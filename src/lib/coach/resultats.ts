import 'server-only'

import { GroupeDepartInvalideError, voiesDuGroupeDepart } from '@/domaine/engagement'
import { type TypeVoie } from '@/domaine/gabarit'
import { PLAFOND_VOIES_ADO, type IssueBloc, type IssueVoie } from '@/domaine/resultat'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import { scoreBloc, scoreVoie, type BaremeVoie } from '@/domaine/score'
import { createClient } from '@/lib/supabase/server'

// Lecture de la saisie des résultats d'une rencontre pour le club du coach
// (spec #6). Par grimpeur engagé (prêtés inclus, R2/R36) : ses voies (enfant : les
// 3 du groupe de départ, R9 ; ado : les voies réalisées, R11) et ses blocs (B1/B2,
// R15) avec l'issue courante, plus l'état de vitesse en lecture seule (R22) et sa
// progression (R20). Le SCORE (R23) est calculé au fil de l'eau (voie + bloc +
// vitesse) via le domaine `score.ts` (spec #7), la composante vitesse étant lue
// depuis `points_vitesse` (matérialisée par le trigger, R20). La RLS borne la
// lecture (club, phase ③+).

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

/**
 * Charge la saisie des résultats d'une rencontre pour le club donné. Renvoie
 * `null` si la rencontre est introuvable. À appeler derrière la garde coach.
 */
export async function getSaisieRencontre(
  rencontreId: string,
  clubId: string,
): Promise<SaisieRencontre | null> {
  const supabase = await createClient()

  const { data: rencontre } = await supabase
    .from('rencontre')
    .select('id, date_rencontre, categorie, phase, club_porteur_id')
    .eq('id', rencontreId)
    .maybeSingle()
  if (!rencontre) return null

  const categorie = rencontre.categorie as Categorie
  const phase = rencontre.phase as Phase

  const [clubRes, epreuvesRes, equipesRes] = await Promise.all([
    supabase.from('club').select('nom').eq('id', rencontre.club_porteur_id as string).maybeSingle(),
    supabase.from('epreuve').select('id, type').eq('rencontre_id', rencontreId),
    supabase.from('equipe').select('id, nom').eq('rencontre_id', rencontreId).eq('club_id', clubId),
  ])
  const epreuveVoie = (epreuvesRes.data ?? []).find((e) => e.type === 'voie')?.id as string | undefined
  const epreuveBloc = (epreuvesRes.data ?? []).find((e) => e.type === 'bloc')?.id as string | undefined
  const epreuveVitesse = (epreuvesRes.data ?? []).find((e) => e.type === 'vitesse')?.id as
    | string
    | undefined

  const equipes = (equipesRes.data ?? []) as { id: string; nom: string }[]
  const equipeIds = equipes.map((e) => e.id)
  const nomEquipe = new Map(equipes.map((e) => [e.id, e.nom]))

  // Structure (voies, blocs+paliers) + compositions du club.
  const [voiesRes, blocsRes, paliersRes, composRes] = await Promise.all([
    epreuveVoie
      ? supabase
          .from('voie_difficulte')
          .select(
            'id, niveau, cotation, type_voie, ordre, points, points_prise_valorisee, points_zone1, points_zone2',
          )
          .eq('epreuve_id', epreuveVoie)
          .order('ordre')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    epreuveBloc
      ? supabase.from('bloc').select('id, code, ordre').eq('epreuve_id', epreuveBloc).order('ordre')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    epreuveBloc
      ? supabase
          .from('bloc_palier')
          .select('id, bloc_id, libelle, ordre, points')
          .order('ordre')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    equipeIds.length
      ? supabase
          .from('composition')
          .select('equipe_id, grimpeur_id, groupe_depart')
          .in('equipe_id', equipeIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const voies = (voiesRes.data ?? []).map((v) => ({
    voieDifficulteId: v.id as string,
    niveau: v.niveau as string,
    cotation: v.cotation as string,
    typeVoie: v.type_voie as TypeVoie,
    ordre: v.ordre as number,
  }))
  const voieParId = new Map(voies.map((v) => [v.voieDifficulteId, v]))
  // Barème par voie (points stockés, spec #3 R38) — pour le score au fil de l'eau (R23).
  const baremeParVoie = new Map<string, BaremeVoie>()
  for (const v of voiesRes.data ?? []) {
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
  for (const p of paliersRes.data ?? []) {
    const bid = p.bloc_id as string
    if (!paliersParBloc.has(bid)) paliersParBloc.set(bid, [])
    paliersParBloc.get(bid)!.push({ id: p.id as string, libelle: p.libelle as string, ordre: p.ordre as number })
  }
  const libellePalier = new Map<string, string>()
  for (const liste of paliersParBloc.values()) for (const p of liste) libellePalier.set(p.id, p.libelle)
  // Points par palier (spec #3 R39) — pour le score de bloc (R23).
  const pointsPalier = new Map<string, number>()
  for (const p of paliersRes.data ?? []) pointsPalier.set(p.id as string, (p.points as number) ?? 0)

  const blocsConfig: BlocConfig[] = (blocsRes.data ?? []).map((b) => ({
    blocId: b.id as string,
    code: b.code as string,
    ordre: b.ordre as number,
    paliers: paliersParBloc.get(b.id as string) ?? [],
  }))

  const compos = (composRes.data ?? []).map((c) => ({
    equipeId: c.equipe_id as string,
    grimpeurId: c.grimpeur_id as string,
    groupeDepart: (c.groupe_depart as string | null) ?? null,
  }))
  const grimpeurIds = [...new Set(compos.map((c) => c.grimpeurId))]

  // Noms/clubs des grimpeurs engagés + résultats + vitesse (temps saisi + points).
  const [grimpeursRes, rvRes, rbRes, tvRes, pvRes] = await Promise.all([
    grimpeurIds.length
      ? supabase.from('grimpeur').select('id, nom, prenom, club_id').in('id', grimpeurIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    epreuveVoie && voies.length
      ? supabase
          .from('resultat_voie')
          .select('voie_difficulte_id, grimpeur_id, issue')
          .in('voie_difficulte_id', voies.map((v) => v.voieDifficulteId))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    epreuveBloc && blocsConfig.length
      ? supabase
          .from('resultat_bloc')
          .select('bloc_id, grimpeur_id, issue, palier_id')
          .in('bloc_id', blocsConfig.map((b) => b.blocId))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    epreuveVitesse && grimpeurIds.length
      ? supabase
          .from('temps_vitesse')
          .select('grimpeur_id, issue, temps')
          .eq('epreuve_id', epreuveVitesse)
          .in('grimpeur_id', grimpeurIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // Points de vitesse matérialisés par le trigger (R20), lus pour le score (R23).
    epreuveVitesse && grimpeurIds.length
      ? supabase
          .from('points_vitesse')
          .select('grimpeur_id, points')
          .eq('epreuve_id', epreuveVitesse)
          .in('grimpeur_id', grimpeurIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const infoGrimpeur = new Map<string, { nom: string; prenom: string; clubId: string }>()
  for (const g of grimpeursRes.data ?? []) {
    infoGrimpeur.set(g.id as string, {
      nom: g.nom as string,
      prenom: g.prenom as string,
      clubId: g.club_id as string,
    })
  }
  // Noms des clubs d'origine (grimpeurs prêtés).
  const clubIdsAutres = [...new Set([...infoGrimpeur.values()].map((g) => g.clubId))].filter(
    (id) => id !== clubId,
  )
  const nomClub = new Map<string, string>()
  if (clubIdsAutres.length) {
    const { data } = await supabase.from('club').select('id, nom').in('id', clubIdsAutres)
    for (const c of data ?? []) nomClub.set(c.id as string, c.nom as string)
  }

  // Résultats par grimpeur.
  const issueVoieParGrimpeur = new Map<string, Map<string, IssueVoie>>()
  for (const r of rvRes.data ?? []) {
    const gid = r.grimpeur_id as string
    if (!issueVoieParGrimpeur.has(gid)) issueVoieParGrimpeur.set(gid, new Map())
    issueVoieParGrimpeur.get(gid)!.set(r.voie_difficulte_id as string, r.issue as IssueVoie)
  }
  const resBlocParGrimpeur = new Map<string, Map<string, { issue: IssueBloc; palierId: string | null }>>()
  for (const r of rbRes.data ?? []) {
    const gid = r.grimpeur_id as string
    if (!resBlocParGrimpeur.has(gid)) resBlocParGrimpeur.set(gid, new Map())
    resBlocParGrimpeur.get(gid)!.set(r.bloc_id as string, {
      issue: r.issue as IssueBloc,
      palierId: (r.palier_id as string | null) ?? null,
    })
  }
  const formeVitesseParGrimpeur = new Map<string, { issue: string; temps: number | null }>()
  for (const t of tvRes.data ?? [])
    formeVitesseParGrimpeur.set(t.grimpeur_id as string, {
      issue: t.issue as string,
      temps: (t.temps as number | null) ?? null,
    })
  const pointsVitesseParGrimpeur = new Map<string, number>()
  for (const p of pvRes.data ?? [])
    pointsVitesseParGrimpeur.set(p.grimpeur_id as string, (p.points as number) ?? 0)

  const grimpeurs: GrimpeurSaisie[] = compos.map((c) => {
    const info = infoGrimpeur.get(c.grimpeurId)
    const prete = !!info && info.clubId !== clubId
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

    return {
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
  })

  return {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie,
    phase,
    clubPorteurNom: (clubRes.data?.nom as string) ?? '(club inconnu)',
    ouverteSaisie: phase === 'competition',
    voiesEpreuve: voies,
    blocsConfig,
    grimpeurs,
  }
}
