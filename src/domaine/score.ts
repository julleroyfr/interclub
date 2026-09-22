// Domaine pur — calcul du score et des classements (spec #7 « Classement »).
//
// Aucune dépendance Supabase : ces fonctions prennent en entrée des données déjà
// chargées (issues de résultats, barème de la rencontre) et renvoient scores et
// rangs. Rien n'est stocké — tout est recalculé à la lecture, au fil de l'eau
// (spec #7 R10). Périmètre : voie + bloc ; la vitesse s'y ajoutera plus tard
// (R14, cf. « Note d'architecture — composante vitesse » de la spec).

import type { Sexe } from './grimpeur'
import type { IssueBloc, IssueVoie } from './resultat'

/**
 * Barème d'une voie (points stockés, spec #3 R38) : `points` = voie entière (top),
 * `pointsPriseValorisee` = prise valorisée (enfant tête), `pointsZone1`/
 * `pointsZone2` = zones (ado). Les champs non applicables valent `null`.
 */
export type BaremeVoie = {
  points: number
  pointsPriseValorisee: number | null
  pointsZone1: number | null
  pointsZone2: number | null
}

/**
 * Score de voie d'un grimpeur (R1) : points de son issue enregistrée selon le
 * barème de la voie. `echec`, `np` (et un champ de points absent) valent 0.
 */
export function scoreVoie(issue: IssueVoie, bareme: BaremeVoie): number {
  switch (issue) {
    case 'top':
      return bareme.points
    case 'prise_valorisee':
      return bareme.pointsPriseValorisee ?? 0
    case 'zone2':
      return bareme.pointsZone2 ?? 0
    case 'zone1':
      return bareme.pointsZone1 ?? 0
    case 'echec':
    case 'np':
      return 0
  }
}

/**
 * Score de bloc d'un grimpeur (R2) : points du palier atteint (`issue = 'palier'`,
 * points du `bloc_palier` référencé, spec #3 R39). `echec`, `np` (et un palier
 * sans points) valent 0.
 */
export function scoreBloc(issue: IssueBloc, pointsPalier: number | null): number {
  return issue === 'palier' ? (pointsPalier ?? 0) : 0
}

/** Résultat de voie d'un grimpeur, avec le barème de sa voie (pour R1). */
export type ResultatVoieScore = { issue: IssueVoie; bareme: BaremeVoie }

/** Résultat de bloc d'un grimpeur, avec les points du palier atteint (pour R2). */
export type ResultatBlocScore = { issue: IssueBloc; pointsPalier: number | null }

/**
 * Score individuel d'un grimpeur pour la rencontre (R3) : somme de tous ses
 * scores de voie, de bloc **et de vitesse**. Les voies / blocs sans résultat ne
 * figurent tout simplement pas dans les listes — ils comptent donc 0 (R4), et le
 * total évolue à chaque saisie (au fil de l'eau).
 *
 * La composante **vitesse** (R15–R20) est *field-dependent* (points par rang, par
 * sexe) : elle est **calculée et matérialisée en base** (trigger sur
 * `temps_vitesse`, R20) puis **lue** par le loader et fournie ici via
 * `pointsVitesse`. Absente / chute-NP-à saisir sans points → 0 (R17), d'où la
 * valeur par défaut.
 */
export function scoreIndividuel(
  voies: readonly ResultatVoieScore[],
  blocs: readonly ResultatBlocScore[],
  pointsVitesse = 0,
): number {
  const totalVoies = voies.reduce((s, v) => s + scoreVoie(v.issue, v.bareme), 0)
  const totalBlocs = blocs.reduce((s, b) => s + scoreBloc(b.issue, b.pointsPalier), 0)
  return totalVoies + totalBlocs + pointsVitesse
}

/**
 * Score d'une équipe (R5) : somme des scores individuels de **tous** ses grimpeurs
 * composés (`membresIds`), y compris un grimpeur **prêté** rattaché à cette équipe
 * d'accueil (R7 — le prêté figure dans la composition de l'équipe d'accueil). Un
 * membre sans score connu compte 0.
 */
export function scoreEquipe(
  membresIds: readonly string[],
  scoreParGrimpeur: ReadonlyMap<string, number>,
): number {
  return membresIds.reduce((s, id) => s + (scoreParGrimpeur.get(id) ?? 0), 0)
}

/**
 * Composition d'une équipe pour l'agrégation : l'équipe (`equipeId`), son **club
 * d'accueil** (`clubId`, club porteur) et ses grimpeurs composés (`membresIds`,
 * prêté inclus, R7).
 */
export type EquipeComposition = {
  equipeId: string
  clubId: string
  membresIds: readonly string[]
}

/**
 * Score de chaque club dans la rencontre (R6) : somme des scores de **toutes** ses
 * équipes engagées (un club peut en aligner plusieurs). Un grimpeur **prêté**
 * compte pour son **club d'accueil** — celui de l'équipe où il est composé (R7) —,
 * pas pour son club d'origine. Renvoie une map `clubId → score`.
 */
export function scoresParClub(
  equipes: readonly EquipeComposition[],
  scoreParGrimpeur: ReadonlyMap<string, number>,
): Map<string, number> {
  const parClub = new Map<string, number>()
  for (const equipe of equipes) {
    const scoreEq = scoreEquipe(equipe.membresIds, scoreParGrimpeur)
    parClub.set(equipe.clubId, (parClub.get(equipe.clubId) ?? 0) + scoreEq)
  }
  return parClub
}

// ---------------------------------------------------------------------------
// Classements — rangs (R8), ordre d'affichage (R9), séparation par sexe (R8b)
// ---------------------------------------------------------------------------

/** Une ligne de classement : l'élément classé, son score et son rang (R8). */
export type Rang<T> = { element: T; score: number; rang: number }

/**
 * Comparateur d'affichage par **nom** (R9, classements équipe / club), insensible
 * à la casse et aux accents (locale française).
 */
export function parNom<T extends { nom: string }>(a: T, b: T): number {
  return a.nom.localeCompare(b.nom, 'fr')
}

/**
 * Comparateur d'affichage par **nom puis prénom** (R9, classement individuel),
 * locale française.
 */
export function parNomPuisPrenom<T extends { nom: string; prenom: string }>(
  a: T,
  b: T,
): number {
  return a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr')
}

/**
 * Établit un classement (R8) : tri par **score décroissant**, avec un **ordre
 * d'affichage déterministe** à score égal via `comparerAffichage` (R9). Les **ex
 * æquo** partagent le même rang, le rang suivant étant décalé du nombre d'ex æquo
 * (classement standard : 1, 2, 2, 4). Fonction pure — le tableau d'entrée n'est
 * pas muté.
 */
export function classer<T>(
  elements: readonly T[],
  score: (element: T) => number,
  comparerAffichage: (a: T, b: T) => number,
): Rang<T>[] {
  const tries = [...elements].sort(
    (a, b) => score(b) - score(a) || comparerAffichage(a, b),
  )
  const classement: Rang<T>[] = []
  for (let index = 0; index < tries.length; index++) {
    const element = tries[index]
    const scoreCourant = score(element)
    const precedent = classement[index - 1]
    // Ex æquo (même score que le précédent) → même rang ; sinon rang = position
    // 1-based, ce qui décale le rang du nombre d'ex æquo (standard 1, 2, 2, 4).
    const rang =
      precedent && precedent.score === scoreCourant ? precedent.rang : index + 1
    classement.push({ element, score: scoreCourant, rang })
  }
  return classement
}

/**
 * Grimpeur classable à l'individuel : identité, sexe (R8b), score voie + bloc et
 * **club d'origine** — celui auquel le grimpeur reste rattaché au classement
 * individuel, prêté inclus (R7).
 */
export type GrimpeurClassable = {
  grimpeurId: string
  nom: string
  prenom: string
  sexe: Sexe
  score: number
  clubOrigineId: string
}

/** Classement individuel scindé par sexe (R8b) : deux listes rangées. */
export type ClassementIndividuel = {
  filles: Rang<GrimpeurClassable>[]
  garcons: Rang<GrimpeurClassable>[]
}

/**
 * Établit le classement individuel **séparé par sexe** (R8b) : deux classements
 * distincts (Filles / Garçons), chacun trié et rangé selon R8/R9 (score
 * décroissant, ex æquo standard, départage d'affichage par nom puis prénom), les
 * rangs **repartant de 1** dans chacun. Un score de fille et un score de garçon ne
 * se comparent jamais entre eux.
 */
export function classementIndividuelParSexe(
  grimpeurs: readonly GrimpeurClassable[],
): ClassementIndividuel {
  const parSexe = (sexe: Sexe) =>
    classer(
      grimpeurs.filter((g) => g.sexe === sexe),
      (g) => g.score,
      parNomPuisPrenom,
    )
  return { filles: parSexe('F'), garcons: parSexe('G') }
}
