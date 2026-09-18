// Domaine pur — saisie des résultats de voie et de bloc (spec #6).
//
// Pas d'accès Supabase : uniquement les invariants purement calculables avant
// écriture (le périmètre-club, le gating de phase et l'unicité en base restent
// garantis côté Supabase / RLS). La saisie coach porte sur les épreuves de VOIE
// et de BLOC ; la vitesse (juge) et le calcul du score/classement sont hors
// périmètre (specs dédiées, cf. spec #6).

import type { Categorie } from './rencontre'
import { champsPointsVoie, type TypeVoie } from './gabarit'

/**
 * Issue d'un résultat de voie — meilleure tentative, une seule par voie (R8) :
 * `top` (voie entière), `prise_valorisee` (voies tête enfant), `zone1`/`zone2`
 * (ado, non cumulatives), `echec` (tentée sans validation), `np` (non présenté —
 * posé automatiquement à la clôture, R18).
 */
export type IssueVoie = 'top' | 'prise_valorisee' | 'zone1' | 'zone2' | 'echec' | 'np'

/**
 * Issue d'un résultat de bloc (R16) : `palier` (meilleur palier atteint, référencé
 * à part), `echec` (tenté sans palier), `np` (non présenté — auto clôture, R18).
 */
export type IssueBloc = 'palier' | 'echec' | 'np'

/** Nombre maximal de voies réalisées par un grimpeur ado (règlement ; R14). */
export const PLAFOND_VOIES_ADO = 6

/** Saisie de résultat invalide (issue incohérente, palier absent, plafond, doublon). */
export class ResultatInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResultatInvalideError'
  }
}

/**
 * Issues de voie **saisissables par le coach** selon la catégorie et le type de
 * voie (R10/R12) — pilote le sélecteur d'issue de l'IHM. `np` n'y figure jamais :
 * il est posé automatiquement à la clôture (R18), non saisissable.
 * - Enfant tête → Top, Prise valorisée, Échec.
 * - Enfant moulinette → Top, Échec (pas de prise valorisée).
 * - Ado (tête) → Top, Zone 2, Zone 1, Échec (zones non cumulatives).
 */
export function issuesVoieSaisissables(
  categorie: Categorie,
  typeVoie: TypeVoie,
): IssueVoie[] {
  const { priseValorisee, zones } = champsPointsVoie(categorie, typeVoie)
  const issues: IssueVoie[] = ['top']
  if (zones) issues.push('zone2', 'zone1')
  if (priseValorisee) issues.push('prise_valorisee')
  issues.push('echec')
  return issues
}

/**
 * Valide une issue de voie soumise par le coach (R10/R12). Refuse `np` (posé
 * automatiquement, R18) et toute issue non cohérente avec la catégorie / le type
 * de voie. Lance `ResultatInvalideError` sinon.
 */
export function validerIssueVoie(
  issue: IssueVoie,
  categorie: Categorie,
  typeVoie: TypeVoie,
): void {
  if (issue === 'np') {
    throw new ResultatInvalideError(
      "« NP » est posé automatiquement à la clôture (R18) : il n'est pas saisissable.",
    )
  }
  const admises = issuesVoieSaisissables(categorie, typeVoie)
  if (!admises.includes(issue)) {
    throw new ResultatInvalideError(
      `Issue « ${issue} » non admise pour cette voie (${categorie}). Admises : ${admises.join(', ')} (R10/R12).`,
    )
  }
}

/** Résultat de bloc soumis par le coach (R16). */
export type ResultatBlocSaisi = {
  issue: IssueBloc
  /** Palier atteint (id), requis si `issue === 'palier'`, `null` sinon. */
  palierId: string | null
  /** Paliers (ids) disponibles pour ce bloc (issus de la config, spec #3 R39). */
  paliersDuBloc: string[]
}

/**
 * Valide un résultat de bloc soumis par le coach (R16). Refuse `np` (auto
 * clôture, R18). Pour l'issue `palier`, le palier doit appartenir au bloc ;
 * `echec` n'a pas de palier. Lance `ResultatInvalideError` sinon.
 */
export function validerResultatBloc({
  issue,
  palierId,
  paliersDuBloc,
}: ResultatBlocSaisi): void {
  if (issue === 'np') {
    throw new ResultatInvalideError(
      "« NP » est posé automatiquement à la clôture (R18) : il n'est pas saisissable.",
    )
  }
  if (issue === 'echec') return
  if (issue === 'palier') {
    if (!palierId || !paliersDuBloc.includes(palierId)) {
      throw new ResultatInvalideError('Le palier choisi doit appartenir au bloc (R16).')
    }
    return
  }
  throw new ResultatInvalideError(`Issue de bloc inconnue : « ${issue} » (R16).`)
}

/** Contexte d'ajout d'une voie réalisée à un grimpeur ado, à valider (R13/R14). */
export type AjoutVoieAdo = {
  /** Ids des voies déjà saisies pour ce grimpeur sur l'épreuve. */
  voiesSaisiesIds: string[]
  /** Voie candidate. */
  voieCandidateId: string
}

/**
 * Vérifie l'ajout d'une voie réalisée pour un grimpeur ado (R13/R14) :
 * - R13 : une voie n'est réalisée qu'une fois (pas deux résultats sur la même
 *   voie) — l'identité est celle de la voie, pas du niveau, donc deux voies
 *   **distinctes** de même niveau restent autorisées (R11) ;
 * - R14 : au plus `PLAFOND_VOIES_ADO` voies par grimpeur.
 * Lance `ResultatInvalideError` au premier invariant violé.
 */
export function verifierAjoutVoieAdo({
  voiesSaisiesIds,
  voieCandidateId,
}: AjoutVoieAdo): void {
  if (voiesSaisiesIds.includes(voieCandidateId)) {
    throw new ResultatInvalideError(
      "Cette voie a déjà un résultat pour ce grimpeur : une voie n'est réalisée qu'une fois (R13).",
    )
  }
  if (voiesSaisiesIds.length >= PLAFOND_VOIES_ADO) {
    throw new ResultatInvalideError(
      `Un grimpeur ado réalise au plus ${PLAFOND_VOIES_ADO} voies (R14).`,
    )
  }
}

/**
 * Calcule les **attendus sans résultat** à passer en NP à la clôture (R18) :
 * différence ensembliste `attendus \ saisis`, en préservant l'ordre des attendus.
 * Fonction pure et **idempotente** (un attendu déjà saisi n'est pas renvoyé).
 * S'applique aux voies **attendues** de l'enfant (les 3 du groupe de départ, R9)
 * et aux blocs (B1/B2) ; les voies ado, choisies librement, n'ont pas d'attendu
 * figé (aucune ligne NP — décision 2026-09-08, R18).
 */
export function manquantsCloture(
  attendusIds: readonly string[],
  saisisIds: readonly string[],
): string[] {
  const saisis = new Set(saisisIds)
  return attendusIds.filter((id) => !saisis.has(id))
}
