import 'server-only'

import { GroupeDepartInvalideError, voiesDuGroupeDepart } from '@/domaine/engagement'
import { type TypeVoie } from '@/domaine/gabarit'
import { PLAFOND_VOIES_ADO, type IssueBloc, type IssueVoie } from '@/domaine/resultat'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import { scoreBloc, scoreVoie, type BaremeVoie } from '@/domaine/score'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'
import { createClient } from '@/lib/supabase/server'

// Lecture de la saisie des résultats d'une rencontre pour le club du coach
// (spec #6). Par grimpeur engagé (prêtés inclus, R2/R36) : ses voies (enfant : les
// 3 du groupe de départ, R9 ; ado : les voies réalisées, R11) et ses blocs (B1/B2,
// R15) avec l'issue courante, plus l'état de vitesse en lecture seule (R22) et sa
// progression (R20). Le SCORE (R23) est calculé au fil de l'eau (voie + bloc +
// vitesse) via le domaine `score.ts` (spec #7), la composante vitesse étant lue
// depuis `points_vitesse` (matérialisée par le trigger, R20). La RLS borne la
// lecture (club, phase ③+). Le même chargement sert l'admin pour TOUS les clubs
// en une seule série de lectures (spec #9, `getSaisieTousClubs`).

/** Nombre de voies attendues pour un enfant (les 3 du groupe de départ, R9). */
const VOIES_ENFANT = 3

/** Issue d'une voie pour un grimpeur ; `null` = à saisir. */
export type SaisieVoie = {
  voieDifficulteId: string
  niveau: string
  cotation: string
  typeVoie: TypeVoie
  issue: IssueVoie | null
}

/** Issue d'un bloc pour un grimpeur ; `null` = à saisir. */
export type SaisieBloc = {
  blocId: string
  code: string
  issue: IssueBloc | null
  palierId: string | null
  palierLibelle: string | null
}

/**
 * État de vitesse (lecture seule, R22) : la forme saisie par le juge — `temps`
 * chronométré, `chute`, `non_presentation` — ou `en_attente` (pas encore saisi).
 * `temps` (secondes) n'est renseigné que pour la forme `temps`.
 */
export type EtatVitesse = {
  statut: 'temps' | 'chute' | 'non_presentation' | 'en_attente'
  temps: number | null
}

/** Ligne de saisie d'un grimpeur engagé. */
export type GrimpeurSaisie = {
  grimpeurId: string
  /** Score au fil de l'eau (voie + bloc + vitesse, R23). */
  score: number
  /** Composante vitesse du score (points matérialisés, R20) ; 0 si non saisie. */
  pointsVitesse: number
  nom: string
  prenom: string
  equipeId: string
  equipeNom: string
  prete: boolean
  clubOrigineNom: string | null
  groupeDepart: string | null
  voies: SaisieVoie[]
  /** Nombre de voies attendues : enfant 3, ado 6 (plafond). */
  voiesTotal: number
  blocs: SaisieBloc[]
  vitesse: EtatVitesse
  progression: {
    voiesFaites: number
    voiesTotal: number
    blocsFaites: number
    blocsTotal: number
  }
}

/** Palier sélectionnable d'un bloc (R16). */
export type PalierOption = { id: string; libelle: string; ordre: number }

/** Configuration d'un bloc de la rencontre (paliers proposés à la saisie). */
export type BlocConfig = { blocId: string; code: string; ordre: number; paliers: PalierOption[] }

/** Voie de difficulté de l'épreuve (choix ado à l'ajout, R11). */
export type VoieOption = {
  voieDifficulteId: string
  niveau: string
  cotation: string
  typeVoie: TypeVoie
  ordre: number
}

/** Données de saisie d'une rencontre pour le club du coach. */
export type SaisieRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurNom: string
  /** Vrai en ③ compétition : la saisie est ouverte (R5). */
  ouverteSaisie: boolean
  voiesEpreuve: VoieOption[]
  blocsConfig: BlocConfig[]
  grimpeurs: GrimpeurSaisie[]
}

/** Saisie de TOUS les clubs engagés d'une rencontre : grimpeurs par club. */
export type SaisieTousClubs = Omit<SaisieRencontre, 'grimpeurs'> & {
  /** Grimpeurs engagés, par club de leur équipe (clubs sans grimpeur absents). */
  grimpeursParClub: Map<string, GrimpeurSaisie[]>
}

/**
 * Charge la saisie des résultats d'une rencontre pour le club donné. Renvoie
 * `null` si la rencontre est introuvable. À appeler derrière la garde coach.
 */
export async function getSaisieRencontre(
  rencontreId: string,
  clubId: string,
): Promise<SaisieRencontre | null> {
  const saisie = await chargerSaisie(rencontreId, clubId)
  if (!saisie) return null
  const { grimpeursParClub, ...rencontre } = saisie
  return { ...rencontre, grimpeurs: grimpeursParClub.get(clubId) ?? [] }
}

/**
 * Charge la saisie de TOUS les clubs engagés en une seule série de lectures
 * (écran admin, spec #9) : sous session admin, la RLS `est_admin()` ouvre tous
 * les clubs. Renvoie `null` si la rencontre est introuvable. À appeler derrière
 * la garde admin.
 */
export async function getSaisieTousClubs(rencontreId: string): Promise<SaisieTousClubs | null> {
  return chargerSaisie(rencontreId, null)
}

type Ligne = Record<string, unknown>

/** Relation embarquée : objet ou tableau selon l'inférence du client. */
function premier(v: unknown): Ligne | null {
  const x = Array.isArray(v) ? v[0] : v
  return x && typeof x === 'object' ? (x as Ligne) : null
}

/**
 * Lectures + assemblage de la saisie, pour UN club (`clubId`) ou pour tous les
 * clubs engagés (`null`). Toutes les lectures partent en UNE vague : chaque table
 * est filtrée sur la rencontre par jointure (épreuve, voie, bloc), sans attendre
 * d'identifiants — chaque aller-retour vers la base compte, l'écran étant relu
 * après chaque saisie. Les lectures pouvant dépasser le plafond de lignes de
 * l'API (compositions, résultats de toute une rencontre) sont paginées.
 */
async function chargerSaisie(
  rencontreId: string,
  clubId: string | null,
): Promise<SaisieTousClubs | null> {
  const supabase = await createClient()

  type Reponse = { data: Ligne[] | null; error: { message: string; code?: string } | null }
  /** Lecture paginée d'une requête construite par `requete` (ordre total requis). */
  const pagine = (requete: (debut: number, fin: number) => unknown, quoi: string) =>
    lireToutesLesPages((debut, fin) => requete(debut, fin) as PromiseLike<Reponse>, quoi)

  const requeteEquipes = supabase
    .from('equipe')
    .select('id, nom, club_id')
    .eq('rencontre_id', rencontreId)

  const [
    rencRes,
    equipesRes,
    voiesRes,
    blocsRes,
    paliersRes,
    compos,
    rvLignes,
    rbLignes,
    tvLignes,
    pvLignes,
  ] = await Promise.all([
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club:club_porteur_id(nom)')
      .eq('id', rencontreId)
      .maybeSingle(),
    clubId ? requeteEquipes.eq('club_id', clubId) : requeteEquipes,
    supabase
      .from('voie_difficulte')
      .select(
        'id, niveau, cotation, type_voie, ordre, points, points_prise_valorisee, points_zone1, points_zone2, epreuve!inner(rencontre_id)',
      )
      .eq('epreuve.rencontre_id', rencontreId)
      .order('ordre'),
    supabase
      .from('bloc')
      .select('id, code, ordre, epreuve!inner(rencontre_id)')
      .eq('epreuve.rencontre_id', rencontreId)
      .order('ordre'),
    supabase
      .from('bloc_palier')
      .select('id, bloc_id, libelle, ordre, points, bloc!inner(epreuve!inner(rencontre_id))')
      .eq('bloc.epreuve.rencontre_id', rencontreId)
      .order('ordre'),
    // Compositions, grimpeur embarqué (nom, prénom, club d'origine et son nom).
    pagine((debut, fin) => {
      const q = supabase
        .from('composition')
        .select(
          'equipe_id, grimpeur_id, groupe_depart, equipe!inner(club_id), grimpeur:grimpeur_id(nom, prenom, club_id, club:club_id(nom))',
        )
        .eq('rencontre_id', rencontreId)
      return (clubId ? q.eq('equipe.club_id', clubId) : q).order('grimpeur_id').range(debut, fin)
    }, 'des compositions'),
    // Résultats et vitesse de TOUTE la rencontre (lisibles au fil de l'eau, spec
    // #1 R8), rattachés ensuite aux seuls grimpeurs composés.
    pagine(
      (debut, fin) =>
        supabase
          .from('resultat_voie')
          .select('id, voie_difficulte_id, grimpeur_id, issue, voie_difficulte!inner(epreuve!inner(rencontre_id))')
          .eq('voie_difficulte.epreuve.rencontre_id', rencontreId)
          .order('id')
          .range(debut, fin),
      'des résultats de voie',
    ),
    pagine(
      (debut, fin) =>
        supabase
          .from('resultat_bloc')
          .select('id, bloc_id, grimpeur_id, issue, palier_id, bloc!inner(epreuve!inner(rencontre_id))')
          .eq('bloc.epreuve.rencontre_id', rencontreId)
          .order('id')
          .range(debut, fin),
      'des résultats de bloc',
    ),
    pagine(
      (debut, fin) =>
        supabase
          .from('temps_vitesse')
          .select('grimpeur_id, issue, temps, epreuve!inner(rencontre_id)')
          .eq('epreuve.rencontre_id', rencontreId)
          .order('grimpeur_id')
          .range(debut, fin),
      'des temps de vitesse',
    ),
    // Points de vitesse matérialisés par le trigger (R20), lus pour le score (R23).
    pagine(
      (debut, fin) =>
        supabase
          .from('points_vitesse')
          .select('grimpeur_id, points, epreuve!inner(rencontre_id)')
          .eq('epreuve.rencontre_id', rencontreId)
          .order('grimpeur_id')
          .range(debut, fin),
      'des points de vitesse',
    ),
  ])

  const rencontre = verifierLecture(rencRes, 'de la rencontre')
  if (!rencontre) return null

  const categorie = rencontre.categorie as Categorie
  const phase = rencontre.phase as Phase

  const equipes = (verifierLecture(equipesRes, 'des équipes') ?? []) as {
    id: string
    nom: string
    club_id: string
  }[]
  const nomEquipe = new Map(equipes.map((e) => [e.id, e.nom]))
  const clubEquipe = new Map(equipes.map((e) => [e.id, e.club_id]))

  const paliers = verifierLecture(paliersRes, 'des paliers') ?? []
  const lignesVoies = verifierLecture(voiesRes, 'des voies') ?? []

  const voies = lignesVoies.map((v) => ({
    voieDifficulteId: v.id as string,
    niveau: v.niveau as string,
    cotation: v.cotation as string,
    typeVoie: v.type_voie as TypeVoie,
    ordre: v.ordre as number,
  }))
  const voieParId = new Map(voies.map((v) => [v.voieDifficulteId, v]))
  // Barème par voie (points stockés, spec #3 R38) — pour le score au fil de l'eau (R23).
  const baremeParVoie = new Map<string, BaremeVoie>()
  for (const v of lignesVoies) {
    baremeParVoie.set(v.id as string, {
      points: (v.points as number) ?? 0,
      pointsPriseValorisee: (v.points_prise_valorisee as number | null) ?? null,
      pointsZone1: (v.points_zone1 as number | null) ?? null,
      pointsZone2: (v.points_zone2 as number | null) ?? null,
    })
  }
  // Voie représentative par niveau (plus petit ordre) — cible du résultat enfant.
  const voieParNiveau = new Map<string, VoieOption>()
  for (const v of voies) {
    const cur = voieParNiveau.get(v.niveau)
    if (!cur || v.ordre < cur.ordre) voieParNiveau.set(v.niveau, v)
  }

  const paliersParBloc = new Map<string, PalierOption[]>()
  for (const p of paliers) {
    const bid = p.bloc_id as string
    if (!paliersParBloc.has(bid)) paliersParBloc.set(bid, [])
    paliersParBloc.get(bid)!.push({ id: p.id as string, libelle: p.libelle as string, ordre: p.ordre as number })
  }
  const libellePalier = new Map<string, string>()
  for (const liste of paliersParBloc.values()) for (const p of liste) libellePalier.set(p.id, p.libelle)
  // Points par palier (spec #3 R39) — pour le score de bloc (R23).
  const pointsPalier = new Map<string, number>()
  for (const p of paliers) pointsPalier.set(p.id as string, (p.points as number) ?? 0)

  const blocsConfig: BlocConfig[] = (verifierLecture(blocsRes, 'des blocs') ?? []).map((b) => ({
    blocId: b.id as string,
    code: b.code as string,
    ordre: b.ordre as number,
    paliers: paliersParBloc.get(b.id as string) ?? [],
  }))

  const infoGrimpeur = new Map<string, { nom: string; prenom: string; clubId: string }>()
  // Noms des clubs d'origine, embarqués avec le grimpeur (prêtés).
  const nomClub = new Map<string, string>()
  const lignesCompo = compos.map((c) => {
    const g = premier(c.grimpeur)
    if (g) {
      infoGrimpeur.set(c.grimpeur_id as string, {
        nom: g.nom as string,
        prenom: g.prenom as string,
        clubId: g.club_id as string,
      })
      const club = premier(g.club)
      if (club) nomClub.set(g.club_id as string, club.nom as string)
    }
    return {
      equipeId: c.equipe_id as string,
      grimpeurId: c.grimpeur_id as string,
      groupeDepart: (c.groupe_depart as string | null) ?? null,
    }
  })

  // Résultats par grimpeur.
  const issueVoieParGrimpeur = new Map<string, Map<string, IssueVoie>>()
  for (const r of rvLignes) {
    const gid = r.grimpeur_id as string
    if (!issueVoieParGrimpeur.has(gid)) issueVoieParGrimpeur.set(gid, new Map())
    issueVoieParGrimpeur.get(gid)!.set(r.voie_difficulte_id as string, r.issue as IssueVoie)
  }
  const resBlocParGrimpeur = new Map<string, Map<string, { issue: IssueBloc; palierId: string | null }>>()
  for (const r of rbLignes) {
    const gid = r.grimpeur_id as string
    if (!resBlocParGrimpeur.has(gid)) resBlocParGrimpeur.set(gid, new Map())
    resBlocParGrimpeur.get(gid)!.set(r.bloc_id as string, {
      issue: r.issue as IssueBloc,
      palierId: (r.palier_id as string | null) ?? null,
    })
  }
  const formeVitesseParGrimpeur = new Map<string, { issue: string; temps: number | null }>()
  for (const t of tvLignes)
    formeVitesseParGrimpeur.set(t.grimpeur_id as string, {
      issue: t.issue as string,
      temps: (t.temps as number | null) ?? null,
    })
  const pointsVitesseParGrimpeur = new Map<string, number>()
  for (const p of pvLignes)
    pointsVitesseParGrimpeur.set(p.grimpeur_id as string, (p.points as number) ?? 0)

  const grimpeursParClub = new Map<string, GrimpeurSaisie[]>()
  for (const c of lignesCompo) {
    const clubDeLEquipe = clubEquipe.get(c.equipeId) as string
    const info = infoGrimpeur.get(c.grimpeurId)
    const prete = !!info && info.clubId !== clubDeLEquipe
    const issuesVoie = issueVoieParGrimpeur.get(c.grimpeurId) ?? new Map<string, IssueVoie>()

    // Voies : enfant → les 3 du groupe de départ (voie représentative par niveau) ;
    // ado → les voies réalisées (résultats existants).
    let voiesGrimpeur: SaisieVoie[]
    if (categorie === 'enfant') {
      let niveaux: string[] = []
      if (c.groupeDepart) {
        try {
          niveaux = voiesDuGroupeDepart(c.groupeDepart)
        } catch (e) {
          if (!(e instanceof GroupeDepartInvalideError)) throw e
        }
      }
      voiesGrimpeur = niveaux
        .map((niv) => voieParNiveau.get(niv))
        .filter((v): v is VoieOption => v != null)
        .map((v) => ({
          voieDifficulteId: v.voieDifficulteId,
          niveau: v.niveau,
          cotation: v.cotation,
          typeVoie: v.typeVoie,
          issue: issuesVoie.get(v.voieDifficulteId) ?? null,
        }))
    } else {
      voiesGrimpeur = [...issuesVoie.entries()]
        .map(([voieId, issue]): SaisieVoie | null => {
          const v = voieParId.get(voieId)
          if (!v) return null
          return {
            voieDifficulteId: v.voieDifficulteId,
            niveau: v.niveau,
            cotation: v.cotation,
            typeVoie: v.typeVoie,
            issue,
          }
        })
        .filter((v): v is SaisieVoie => v != null)
        .sort((a, b) => a.niveau.localeCompare(b.niveau))
    }

    const resBloc = resBlocParGrimpeur.get(c.grimpeurId) ?? new Map()
    const blocsGrimpeur: SaisieBloc[] = blocsConfig.map((b) => {
      const r = resBloc.get(b.blocId)
      return {
        blocId: b.blocId,
        code: b.code,
        issue: (r?.issue as IssueBloc | undefined) ?? null,
        palierId: r?.palierId ?? null,
        palierLibelle: r?.palierId ? (libellePalier.get(r.palierId) ?? null) : null,
      }
    })

    const forme = formeVitesseParGrimpeur.get(c.grimpeurId)
    const vitesse: EtatVitesse = forme
      ? {
          statut:
            forme.issue === 'temps'
              ? 'temps'
              : forme.issue === 'chute'
                ? 'chute'
                : 'non_presentation',
          temps: forme.temps,
        }
      : { statut: 'en_attente', temps: null }

    const voiesTotal = categorie === 'enfant' ? VOIES_ENFANT : PLAFOND_VOIES_ADO
    const voiesFaites = voiesGrimpeur.filter((v) => v.issue != null).length
    const blocsFaites = blocsGrimpeur.filter((b) => b.issue != null).length

    // Score au fil de l'eau (voie + bloc + vitesse, R23) — mêmes primitives que le
    // domaine (spec #7 `scoreIndividuel`) : voie/bloc calculés à la lecture, la
    // vitesse lue depuis `points_vitesse` (matérialisée par le trigger, R20).
    const scoreVoies = voiesGrimpeur.reduce((s, v) => {
      const bareme = v.issue ? baremeParVoie.get(v.voieDifficulteId) : undefined
      return bareme && v.issue ? s + scoreVoie(v.issue, bareme) : s
    }, 0)
    const scoreBlocs = blocsGrimpeur.reduce(
      (s, b) =>
        b.issue
          ? s + scoreBloc(b.issue, b.palierId ? (pointsPalier.get(b.palierId) ?? null) : null)
          : s,
      0,
    )
    const pointsVitesse = pointsVitesseParGrimpeur.get(c.grimpeurId) ?? 0
    const score = scoreVoies + scoreBlocs + pointsVitesse

    const grimpeur: GrimpeurSaisie = {
      grimpeurId: c.grimpeurId,
      score,
      pointsVitesse,
      nom: info?.nom ?? '(inconnu)',
      prenom: info?.prenom ?? '',
      equipeId: c.equipeId,
      equipeNom: nomEquipe.get(c.equipeId) ?? '(équipe)',
      prete,
      clubOrigineNom: prete ? (nomClub.get(info!.clubId) ?? '(autre club)') : null,
      groupeDepart: c.groupeDepart,
      voies: voiesGrimpeur,
      voiesTotal,
      blocs: blocsGrimpeur,
      vitesse,
      progression: {
        voiesFaites,
        voiesTotal,
        blocsFaites,
        blocsTotal: blocsConfig.length,
      },
    }
    const liste = grimpeursParClub.get(clubDeLEquipe)
    if (liste) liste.push(grimpeur)
    else grimpeursParClub.set(clubDeLEquipe, [grimpeur])
  }

  // Ordre stable des grimpeurs d'un club : nom puis prénom.
  for (const liste of grimpeursParClub.values()) {
    liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'))
  }

  return {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie,
    phase,
    clubPorteurNom: (premier(rencontre.club)?.nom as string | undefined) ?? '(club inconnu)',
    ouverteSaisie: phase === 'competition',
    voiesEpreuve: voies,
    blocsConfig,
    grimpeursParClub,
  }
}
