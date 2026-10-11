import 'server-only'

import type { Sexe } from '@/domaine/grimpeur'
import type { Categorie, Phase } from '@/domaine/rencontre'
import type { IssueBloc, IssueVoie } from '@/domaine/resultat'
import {
  classer,
  classementIndividuelParSexe,
  scoreBloc,
  scoreEquipe,
  scoreVoie,
  scoresParClub,
  type BaremeVoie,
  type EquipeComposition,
  type GrimpeurClassable,
  type Rang,
} from '@/domaine/score'
import { formaterTempsVitesse } from '@/domaine/vitesse'
import { exigerLectureAdminOuCoach } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'

// Assemblage du classement d'une rencontre (spec #7). Le calcul (score de voie/bloc,
// agrégations, rangs, séparation par sexe) est fait par le domaine pur
// `src/domaine/score.ts` (testé en Vitest) ; ce loader ne fait qu'ASSEMBLER les
// entrées à partir des résultats saisis (spec #6) et du barème stocké (spec #3),
// pour TOUS les clubs, et prépare la décomposition d'un score (R13).
//
// Composante VITESSE (R15–R20) : elle est *field-dependent* (points par rang, par
// sexe) et donc **matérialisée en base** par un trigger sur `temps_vitesse` (R20).
// Le loader la **lit** dans `points_vitesse` (points + rang) et l'ADDITIONNE au
// score voie + bloc — voie/bloc restent, eux, calculés à la lecture (R10).
//
// Lecture cross-club via le client `service_role` (assemblage transverse, ADR
// 0002/0003) : lire les noms de grimpeurs / équipes / clubs de tous les clubs
// dépasse ce que la RLS ouvre à un simple `authenticated`. Le gating de phase
// (③+ seulement, R11) est donc porté ICI, `service_role` contournant la RLS.

/** Phases où le classement est visible (dès la ③ compétition, R11). */
const PHASES_VISIBLES: Phase[] = ['competition', 'cloture', 'resultats_publics']

/** Détail d'une voie dans la décomposition d'un score (R13/R1). */
export type LigneVoieDecomp = {
  libelle: string
  cotation: string | null
  issue: IssueVoie
  points: number
}

/** Détail d'un bloc dans la décomposition d'un score (R13/R2). */
export type LigneBlocDecomp = {
  code: string
  issue: IssueBloc
  /** Libellé du palier atteint, ou « Échec » / « NP ». */
  issueLibelle: string
  points: number
}

/** Décomposition d'un score individuel (R13) : sous-totaux voie/bloc/vitesse. */
export type Decomposition = {
  totalVoie: number
  totalBloc: number
  /** Points de vitesse (R16/R17), matérialisés en base (R20) et lus ici. */
  vitesse: number
  /** Rang de vitesse (R15) ; `null` si chute / non-présentation / à saisir. */
  rangVitesse: number | null
  /** Libellé de la forme de vitesse : temps formaté, « Chute », « Non-présentation » ou « À saisir » (R13). */
  vitesseLibelle: string
  voies: LigneVoieDecomp[]
  blocs: LigneBlocDecomp[]
}

/** Une ligne du classement individuel (par sexe), R12/R13. */
export type LigneIndividuel = {
  rang: number
  grimpeurId: string
  nom: string
  prenom: string
  clubOrigineId: string
  clubOrigineNom: string
  /** Équipe d'accueil du grimpeur (pour le filtre et le tag, R12b). */
  equipeId: string | null
  equipeNom: string | null
  score: number
  decomposition: Decomposition
}

/** Les deux classements individuels, Filles / Garçons (R8b). */
export type ClassementIndividuel = {
  filles: LigneIndividuel[]
  garcons: LigneIndividuel[]
}

/** Une ligne du classement par équipe (mixte, R8). */
export type LigneEquipe = {
  rang: number
  equipeId: string
  equipeNom: string
  clubNom: string
  nbGrimpeurs: number
  score: number
}

/** Une ligne du classement par club (mixte, R8). */
export type LigneClub = {
  rang: number
  clubId: string
  clubNom: string
  score: number
}

/** Classement complet d'une rencontre : trois vues (R12). */
export type ClassementRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  /** Visible dès la ③ ; avant, aucun classement (R11). */
  visible: boolean
  /** Officiel/figé à partir de la ⑤ résultats publics ; non officiel avant (R10). */
  officiel: boolean
  individuel: ClassementIndividuel
  equipes: LigneEquipe[]
  clubs: LigneClub[]
}

/** Ligne brute d'une lecture PostgREST. */
type Ligne = Record<string, unknown>

/** Nom d'une relation embarquée `club:club_id(nom)` (objet, ou tableau selon l'inférence). */
function nomEmbarque(club: unknown): string | null {
  const c = (Array.isArray(club) ? club[0] : club) as { nom?: string } | null | undefined
  return c?.nom ?? null
}

const individuelVide = (): ClassementIndividuel => ({ filles: [], garcons: [] })

/**
 * Charge et calcule le classement d'une rencontre (individuel par sexe, équipe,
 * club) avec la décomposition de chaque score individuel (R13). Renvoie `null` si
 * la rencontre est introuvable. Avant la ③, `visible` est faux et les classements
 * sont vides (R11). Le total individuel porte sur **voie + bloc + vitesse** (R3,
 * révision 2026-09-22) ; la vitesse est lue depuis `points_vitesse` (R20).
 */
export async function getClassementRencontre(
  rencontreId: string,
): Promise<ClassementRencontre | null> {
  await exigerLectureAdminOuCoach('classement de la rencontre')
  const admin = createAdminClient()

  // UNE vague (lot 1 du plan « appels Supabase ») : chaque table est filtrée sur
  // la rencontre par jointure `!inner`, les noms (grimpeur, club) sont embarqués,
  // et les lectures qui peuvent dépasser le plafond de l'API (1000 lignes) sont
  // paginées — sinon le classement serait faux sans erreur (constat J1).
  type Reponse = { data: Ligne[] | null; error: { message: string; code?: string } | null }
  const pagine = (requete: (debut: number, fin: number) => unknown, quoi: string) =>
    lireToutesLesPages((debut, fin) => requete(debut, fin) as PromiseLike<Reponse>, quoi)

  const [rencRes, voiesRes, blocsRes, paliersRes, equipesRes, compos, rvLignes, rbLignes, pvLignes, tvLignes] =
    await Promise.all([
      admin
        .from('rencontre')
        .select('id, date_rencontre, categorie, phase')
        .eq('id', rencontreId)
        .maybeSingle(),
      admin
        .from('voie_difficulte')
        .select(
          'id, niveau, cotation, ordre, points, points_prise_valorisee, points_zone1, points_zone2, epreuve!inner(rencontre_id)',
        )
        .eq('epreuve.rencontre_id', rencontreId)
        .order('ordre'),
      admin
        .from('bloc')
        .select('id, code, ordre, epreuve!inner(rencontre_id)')
        .eq('epreuve.rencontre_id', rencontreId)
        .order('ordre'),
      admin
        .from('bloc_palier')
        .select('id, points, libelle, bloc!inner(epreuve!inner(rencontre_id))')
        .eq('bloc.epreuve.rencontre_id', rencontreId),
      admin.from('equipe').select('id, nom, club_id, club:club_id(nom)').eq('rencontre_id', rencontreId),
      pagine(
        (debut, fin) =>
          admin
            .from('composition')
            .select('equipe_id, grimpeur_id, grimpeur:grimpeur_id(nom, prenom, sexe, club_id, club:club_id(nom))')
            .eq('rencontre_id', rencontreId)
            .order('equipe_id')
            .order('grimpeur_id')
            .range(debut, fin),
        'des compositions',
      ),
      pagine(
        (debut, fin) =>
          admin
            .from('resultat_voie')
            .select('id, voie_difficulte_id, grimpeur_id, issue, voie_difficulte!inner(epreuve!inner(rencontre_id))')
            .eq('voie_difficulte.epreuve.rencontre_id', rencontreId)
            .order('id')
            .range(debut, fin),
        'des résultats de voie',
      ),
      pagine(
        (debut, fin) =>
          admin
            .from('resultat_bloc')
            .select('id, bloc_id, grimpeur_id, issue, palier_id, bloc!inner(epreuve!inner(rencontre_id))')
            .eq('bloc.epreuve.rencontre_id', rencontreId)
            .order('id')
            .range(debut, fin),
        'des résultats de bloc',
      ),
      // VITESSE : points matérialisés (points_vitesse, R20) + forme saisie
      // (temps_vitesse, pour le libellé R13).
      pagine(
        (debut, fin) =>
          admin
            .from('points_vitesse')
            .select('grimpeur_id, rang, points, epreuve!inner(rencontre_id)')
            .eq('epreuve.rencontre_id', rencontreId)
            .order('grimpeur_id')
            .range(debut, fin),
        'des points de vitesse',
      ),
      pagine(
        (debut, fin) =>
          admin
            .from('temps_vitesse')
            .select('grimpeur_id, issue, temps, epreuve!inner(rencontre_id)')
            .eq('epreuve.rencontre_id', rencontreId)
            .order('grimpeur_id')
            .range(debut, fin),
        'des temps de vitesse',
      ),
    ])

  const rencontre = verifierLecture(rencRes, 'de la rencontre')
  if (!rencontre) return null

  const categorie = rencontre.categorie as Categorie
  const phase = rencontre.phase as Phase
  const base = {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie,
    phase,
    visible: PHASES_VISIBLES.includes(phase),
    officiel: phase === 'resultats_publics',
  }
  // Rien avant la ③ : aucun résultat à classer (R11).
  if (!base.visible) {
    return { ...base, individuel: individuelVide(), equipes: [], clubs: [] }
  }

  // Structure (barème + libellés) des voies et blocs.
  const baremeParVoie = new Map<string, BaremeVoie>()
  const metaVoie = new Map<string, { niveau: string; cotation: string | null; ordre: number }>()
  for (const v of verifierLecture(voiesRes, 'des voies') ?? []) {
    const id = v.id as string
    baremeParVoie.set(id, {
      points: (v.points as number) ?? 0,
      pointsPriseValorisee: (v.points_prise_valorisee as number | null) ?? null,
      pointsZone1: (v.points_zone1 as number | null) ?? null,
      pointsZone2: (v.points_zone2 as number | null) ?? null,
    })
    metaVoie.set(id, {
      niveau: v.niveau as string,
      cotation: (v.cotation as string | null) ?? null,
      ordre: (v.ordre as number) ?? 0,
    })
  }
  const metaBloc = new Map<string, { code: string; ordre: number }>()
  for (const b of verifierLecture(blocsRes, 'des blocs') ?? []) {
    metaBloc.set(b.id as string, { code: b.code as string, ordre: (b.ordre as number) ?? 0 })
  }

  // Noms des clubs (porteurs d'équipes + clubs d'origine des grimpeurs), embarqués.
  const nomClub = new Map<string, string>()
  const equipes = (verifierLecture(equipesRes, 'des équipes') ?? []).map((e) => {
    const clubId = e.club_id as string
    const nom = nomEmbarque(e.club)
    if (nom != null) nomClub.set(clubId, nom)
    return { equipeId: e.id as string, equipeNom: e.nom as string, clubId }
  })

  const pointsParPalier = new Map<string, number>()
  const libellePalier = new Map<string, string>()
  for (const p of verifierLecture(paliersRes, 'des paliers') ?? []) {
    pointsParPalier.set(p.id as string, (p.points as number) ?? 0)
    libellePalier.set(p.id as string, p.libelle as string)
  }

  // Vitesse : points + rang matérialisés (R20) et forme saisie (libellé R13).
  const pointsVitesseDe = new Map<string, { points: number; rang: number | null }>()
  for (const p of pvLignes) {
    pointsVitesseDe.set(p.grimpeur_id as string, {
      points: (p.points as number) ?? 0,
      rang: (p.rang as number | null) ?? null,
    })
  }
  const formeVitesseDe = new Map<string, { issue: string; temps: number | null }>()
  for (const t of tvLignes) {
    formeVitesseDe.set(t.grimpeur_id as string, {
      issue: t.issue as string,
      temps: (t.temps as number | null) ?? null,
    })
  }

  // Décomposition (voie + bloc) par grimpeur — R13, et sous-totaux (R1/R2),
  // dans l'ordre des voies et des blocs de la rencontre.
  const decompVoie = new Map<string, (LigneVoieDecomp & { ordre: number })[]>()
  for (const r of rvLignes) {
    const voieId = r.voie_difficulte_id as string
    const bareme = baremeParVoie.get(voieId)
    if (!bareme) continue
    const meta = metaVoie.get(voieId)
    const issue = r.issue as IssueVoie
    const gid = r.grimpeur_id as string
    if (!decompVoie.has(gid)) decompVoie.set(gid, [])
    decompVoie.get(gid)!.push({
      libelle: meta?.niveau ?? '?',
      cotation: meta?.cotation ?? null,
      issue,
      points: scoreVoie(issue, bareme),
      ordre: meta?.ordre ?? 0,
    })
  }
  const decompBloc = new Map<string, (LigneBlocDecomp & { ordre: number })[]>()
  for (const r of rbLignes) {
    const gid = r.grimpeur_id as string
    const issue = r.issue as IssueBloc
    const palierId = (r.palier_id as string | null) ?? null
    const points = scoreBloc(issue, palierId ? (pointsParPalier.get(palierId) ?? null) : null)
    const issueLibelle =
      issue === 'palier'
        ? (palierId ? (libellePalier.get(palierId) ?? 'Palier') : 'Palier')
        : issue === 'echec'
          ? 'Échec'
          : 'NP'
    const meta = metaBloc.get(r.bloc_id as string)
    if (!decompBloc.has(gid)) decompBloc.set(gid, [])
    decompBloc.get(gid)!.push({ code: meta?.code ?? '?', issue, issueLibelle, points, ordre: meta?.ordre ?? 0 })
  }

  // Grimpeurs engagés (composés) — dédupliqués — leur équipe d'accueil et leur
  // fiche (nom, sexe, club d'origine), embarquée dans la composition.
  const compositions = compos.map((c) => ({
    equipeId: c.equipe_id as string,
    grimpeurId: c.grimpeur_id as string,
  }))
  const equipeParId = new Map(equipes.map((e) => [e.equipeId, e]))
  const equipeDuGrimpeur = new Map<string, { equipeId: string; equipeNom: string }>()
  for (const c of compositions) {
    if (equipeDuGrimpeur.has(c.grimpeurId)) continue
    const e = equipeParId.get(c.equipeId)
    if (e) equipeDuGrimpeur.set(c.grimpeurId, { equipeId: e.equipeId, equipeNom: e.equipeNom })
  }
  const grimpeurIds = [...new Set(compositions.map((c) => c.grimpeurId))]

  const infoGrimpeur = new Map<
    string,
    { nom: string; prenom: string; sexe: Sexe; clubId: string }
  >()
  for (const c of compos) {
    const g = (Array.isArray(c.grimpeur) ? c.grimpeur[0] : c.grimpeur) as Ligne | null | undefined
    if (!g) continue
    const clubId = g.club_id as string
    const nom = nomEmbarque(g.club)
    if (nom != null) nomClub.set(clubId, nom)
    infoGrimpeur.set(c.grimpeur_id as string, {
      nom: g.nom as string,
      prenom: g.prenom as string,
      sexe: g.sexe as Sexe,
      clubId,
    })
  }

  // Décomposition + score par grimpeur (R3/R4).
  const decompositionDe = (gid: string): Decomposition => {
    const voies = (decompVoie.get(gid) ?? [])
      .sort((a, b) => a.ordre - b.ordre)
      .map((v): LigneVoieDecomp => ({ libelle: v.libelle, cotation: v.cotation, issue: v.issue, points: v.points }))
    const blocs = (decompBloc.get(gid) ?? [])
      .sort((a, b) => a.ordre - b.ordre)
      .map((b): LigneBlocDecomp => ({ code: b.code, issue: b.issue, issueLibelle: b.issueLibelle, points: b.points }))
    const totalVoie = voies.reduce((s, v) => s + v.points, 0)
    const totalBloc = blocs.reduce((s, b) => s + b.points, 0)
    const pv = pointsVitesseDe.get(gid)
    const forme = formeVitesseDe.get(gid)
    const vitesseLibelle =
      forme?.issue === 'temps' && forme.temps != null
        ? formaterTempsVitesse(forme.temps)
        : forme?.issue === 'chute'
          ? 'Chute'
          : forme?.issue === 'non_presentation'
            ? 'Non-présentation'
            : 'À saisir'
    return {
      totalVoie,
      totalBloc,
      vitesse: pv?.points ?? 0,
      rangVitesse: pv?.rang ?? null,
      vitesseLibelle,
      voies,
      blocs,
    }
  }
  const scoreParGrimpeur = new Map<string, number>()
  const decompParGrimpeur = new Map<string, Decomposition>()
  for (const gid of grimpeurIds) {
    const d = decompositionDe(gid)
    decompParGrimpeur.set(gid, d)
    scoreParGrimpeur.set(gid, d.totalVoie + d.totalBloc + d.vitesse)
  }

  // Classement individuel par sexe (R8b) — rattaché au club d'origine (R7).
  const classables: GrimpeurClassable[] = grimpeurIds
    .map((gid) => {
      const info = infoGrimpeur.get(gid)
      if (!info) return null
      return {
        grimpeurId: gid,
        nom: info.nom,
        prenom: info.prenom,
        sexe: info.sexe,
        score: scoreParGrimpeur.get(gid) ?? 0,
        clubOrigineId: info.clubId,
      }
    })
    .filter((g): g is GrimpeurClassable => g != null)

  const indiv = classementIndividuelParSexe(classables)
  const versLigneIndiv = (r: Rang<GrimpeurClassable>): LigneIndividuel => {
    const eq = equipeDuGrimpeur.get(r.element.grimpeurId) ?? null
    return {
      rang: r.rang,
      grimpeurId: r.element.grimpeurId,
      nom: r.element.nom,
      prenom: r.element.prenom,
      clubOrigineId: r.element.clubOrigineId,
      clubOrigineNom: nomClub.get(r.element.clubOrigineId) ?? '(club inconnu)',
      equipeId: eq?.equipeId ?? null,
      equipeNom: eq?.equipeNom ?? null,
      score: r.score,
      decomposition: decompParGrimpeur.get(r.element.grimpeurId) ?? {
        totalVoie: 0,
        totalBloc: 0,
        vitesse: 0,
        rangVitesse: null,
        vitesseLibelle: 'À saisir',
        voies: [],
        blocs: [],
      },
    }
  }
  const individuel: ClassementIndividuel = {
    filles: indiv.filles.map(versLigneIndiv),
    garcons: indiv.garcons.map(versLigneIndiv),
  }

  // Classement par équipe (R5 + R8) — le prêté compte pour son équipe d'accueil (R7).
  const membresParEquipe = new Map<string, string[]>()
  for (const c of compositions) {
    if (!membresParEquipe.has(c.equipeId)) membresParEquipe.set(c.equipeId, [])
    membresParEquipe.get(c.equipeId)!.push(c.grimpeurId)
  }
  const equipesAvecScore = equipes.map((e) => {
    const membres = membresParEquipe.get(e.equipeId) ?? []
    return {
      ...e,
      clubNom: nomClub.get(e.clubId) ?? '(club inconnu)',
      nbGrimpeurs: membres.length,
      score: scoreEquipe(membres, scoreParGrimpeur),
    }
  })
  const equipes_ = classer(
    equipesAvecScore,
    (e) => e.score,
    (a, b) => a.equipeNom.localeCompare(b.equipeNom, 'fr'),
  ).map(
    (r): LigneEquipe => ({
      rang: r.rang,
      equipeId: r.element.equipeId,
      equipeNom: r.element.equipeNom,
      clubNom: r.element.clubNom,
      nbGrimpeurs: r.element.nbGrimpeurs,
      score: r.score,
    }),
  )

  // Classement par club (R6 + R8).
  const compositionsClub: EquipeComposition[] = equipes.map((e) => ({
    equipeId: e.equipeId,
    clubId: e.clubId,
    membresIds: membresParEquipe.get(e.equipeId) ?? [],
  }))
  const scoreParClub = scoresParClub(compositionsClub, scoreParGrimpeur)
  const clubsAvecScore = [...scoreParClub.entries()].map(([clubId, score]) => ({
    clubId,
    clubNom: nomClub.get(clubId) ?? '(club inconnu)',
    score,
  }))
  const clubs_ = classer(
    clubsAvecScore,
    (c) => c.score,
    (a, b) => a.clubNom.localeCompare(b.clubNom, 'fr'),
  ).map(
    (r): LigneClub => ({
      rang: r.rang,
      clubId: r.element.clubId,
      clubNom: r.element.clubNom,
      score: r.score,
    }),
  )

  return { ...base, individuel, equipes: equipes_, clubs: clubs_ }
}
