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
import { createAdminClient } from '@/lib/supabase/admin'

// Assemblage du classement d'une rencontre (spec #7). Le calcul (score de voie/bloc,
// agrégations, rangs, séparation par sexe) est fait par le domaine pur
// `src/domaine/score.ts` (testé en Vitest) ; ce loader ne fait qu'ASSEMBLER les
// entrées à partir des résultats saisis (spec #6) et du barème stocké (spec #3),
// pour TOUS les clubs, et prépare la décomposition d'un score (R13).
//
// Lecture cross-club via le client `service_role` (assemblage transverse, ADR
// 0002/0003) : lire les noms de grimpeurs / équipes / clubs de tous les clubs
// dépasse ce que la RLS ouvre à un simple `authenticated`. Le gating de phase
// (③+ seulement, R11) est donc porté ICI, `service_role` contournant la RLS.
// Rien n'est stocké : recalcul à la lecture, au fil de l'eau (R10).

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

/** Décomposition d'un score individuel (R13) : sous-totaux et détail voie/bloc. */
export type Decomposition = {
  totalVoie: number
  totalBloc: number
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

const individuelVide = (): ClassementIndividuel => ({ filles: [], garcons: [] })

/**
 * Charge et calcule le classement d'une rencontre (individuel par sexe, équipe,
 * club) avec la décomposition de chaque score individuel (R13). Renvoie `null` si
 * la rencontre est introuvable. Avant la ③, `visible` est faux et les classements
 * sont vides (R11). Le total porte sur voie + bloc ; la vitesse s'ajoutera plus
 * tard (R14).
 */
export async function getClassementRencontre(
  rencontreId: string,
): Promise<ClassementRencontre | null> {
  const admin = createAdminClient()

  const { data: rencontre } = await admin
    .from('rencontre')
    .select('id, date_rencontre, categorie, phase')
    .eq('id', rencontreId)
    .maybeSingle()
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

  // Épreuves voie / bloc de la rencontre.
  const { data: epreuves } = await admin
    .from('epreuve')
    .select('id, type')
    .eq('rencontre_id', rencontreId)
  const epreuveVoie = (epreuves ?? []).find((e) => e.type === 'voie')?.id as string | undefined
  const epreuveBloc = (epreuves ?? []).find((e) => e.type === 'bloc')?.id as string | undefined

  // Structure (barème + libellés) des voies et blocs, et équipes (tous clubs).
  const vide = Promise.resolve({ data: [] as Record<string, unknown>[] })
  const [voiesRes, blocsRes, equipesRes] = await Promise.all([
    epreuveVoie
      ? admin
          .from('voie_difficulte')
          .select(
            'id, niveau, cotation, type_voie, points, points_prise_valorisee, points_zone1, points_zone2',
          )
          .eq('epreuve_id', epreuveVoie)
      : vide,
    epreuveBloc
      ? admin.from('bloc').select('id, code, ordre').eq('epreuve_id', epreuveBloc).order('ordre')
      : vide,
    admin.from('equipe').select('id, nom, club_id').eq('rencontre_id', rencontreId),
  ])

  const baremeParVoie = new Map<string, BaremeVoie>()
  const metaVoie = new Map<string, { niveau: string; cotation: string | null }>()
  for (const v of voiesRes.data ?? []) {
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
    })
  }
  const voieIds = [...baremeParVoie.keys()]
  const codeBloc = new Map<string, string>()
  for (const b of blocsRes.data ?? []) codeBloc.set(b.id as string, b.code as string)
  const blocIds = [...codeBloc.keys()]
  const equipes = (equipesRes.data ?? []).map((e) => ({
    equipeId: e.id as string,
    equipeNom: e.nom as string,
    clubId: e.club_id as string,
  }))
  const equipeIds = equipes.map((e) => e.equipeId)

  // Paliers (points + libellé), résultats voie/bloc, compositions (tous clubs).
  const [paliersRes, rvRes, rbRes, composRes] = await Promise.all([
    blocIds.length
      ? admin.from('bloc_palier').select('id, points, libelle').in('bloc_id', blocIds)
      : vide,
    voieIds.length
      ? admin
          .from('resultat_voie')
          .select('voie_difficulte_id, grimpeur_id, issue')
          .in('voie_difficulte_id', voieIds)
      : vide,
    blocIds.length
      ? admin
          .from('resultat_bloc')
          .select('bloc_id, grimpeur_id, issue, palier_id')
          .in('bloc_id', blocIds)
      : vide,
    equipeIds.length
      ? admin.from('composition').select('equipe_id, grimpeur_id').in('equipe_id', equipeIds)
      : vide,
  ])

  const pointsParPalier = new Map<string, number>()
  const libellePalier = new Map<string, string>()
  for (const p of paliersRes.data ?? []) {
    pointsParPalier.set(p.id as string, (p.points as number) ?? 0)
    libellePalier.set(p.id as string, p.libelle as string)
  }

  // Décomposition (voie + bloc) par grimpeur — R13, et sous-totaux (R1/R2).
  const decompVoie = new Map<string, LigneVoieDecomp[]>()
  for (const r of rvRes.data ?? []) {
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
    })
  }
  const decompBloc = new Map<string, LigneBlocDecomp[]>()
  for (const r of rbRes.data ?? []) {
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
    if (!decompBloc.has(gid)) decompBloc.set(gid, [])
    decompBloc.get(gid)!.push({ code: codeBloc.get(r.bloc_id as string) ?? '?', issue, issueLibelle, points })
  }

  // Grimpeurs engagés (composés) — dédupliqués — et leur équipe d'accueil.
  const compositions = (composRes.data ?? []).map((c) => ({
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

  const grimpeursRes = grimpeurIds.length
    ? await admin.from('grimpeur').select('id, nom, prenom, sexe, club_id').in('id', grimpeurIds)
    : { data: [] as Record<string, unknown>[] }
  const infoGrimpeur = new Map<
    string,
    { nom: string; prenom: string; sexe: Sexe; clubId: string }
  >()
  for (const g of grimpeursRes.data ?? []) {
    infoGrimpeur.set(g.id as string, {
      nom: g.nom as string,
      prenom: g.prenom as string,
      sexe: g.sexe as Sexe,
      clubId: g.club_id as string,
    })
  }

  // Noms des clubs (porteurs d'équipes + clubs d'origine des grimpeurs).
  const clubIds = [
    ...new Set([
      ...equipes.map((e) => e.clubId),
      ...[...infoGrimpeur.values()].map((g) => g.clubId),
    ]),
  ]
  const nomClub = new Map<string, string>()
  if (clubIds.length) {
    const { data } = await admin.from('club').select('id, nom').in('id', clubIds)
    for (const c of data ?? []) nomClub.set(c.id as string, c.nom as string)
  }

  // Décomposition + score par grimpeur (R3/R4).
  const decompositionDe = (gid: string): Decomposition => {
    const voies = decompVoie.get(gid) ?? []
    const blocs = decompBloc.get(gid) ?? []
    const totalVoie = voies.reduce((s, v) => s + v.points, 0)
    const totalBloc = blocs.reduce((s, b) => s + b.points, 0)
    return { totalVoie, totalBloc, voies, blocs }
  }
  const scoreParGrimpeur = new Map<string, number>()
  const decompParGrimpeur = new Map<string, Decomposition>()
  for (const gid of grimpeurIds) {
    const d = decompositionDe(gid)
    decompParGrimpeur.set(gid, d)
    scoreParGrimpeur.set(gid, d.totalVoie + d.totalBloc)
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
