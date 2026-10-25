// Domaine pur — modification et suppression des éléments de la structure d'une
// rencontre (spec #3 R51–R55) : phases autorisées, protection des résultats
// déjà saisis (retour arrière ③ → ②) et normalisation des libellés. Les Server
// Actions rejouent ces gardes ; le décompte des résultats vient de la base.

import type { TypeVoie } from './gabarit'
import type { Phase } from './rencontre'

/**
 * Vrai si la structure est éditable — ajout, modification, suppression, barème
 * de vitesse — soit en ① et ② (R51, rév. 2026-10-25).
 */
export function editionStructurePossible(phase: Phase): boolean {
  return phase === 'pre_competition' || phase === 'preparation'
}

/**
 * Message de refus d'une édition du barème de vitesse (R55e), ou `null` si
 * acceptée : les points de vitesse sont calculés à la saisie et ne seraient pas
 * recalculés si le barème changeait après coup.
 */
export function refusBaremeVitesse(nbSaisies: number): string | null {
  if (nbSaisies === 0) return null
  const saisies =
    nbSaisies > 1 ? `${nbSaisies} saisies de vitesse existent` : '1 saisie de vitesse existe'
  return `Barème non modifiable : ${saisies} déjà sur cette épreuve.`
}

/** « 1 résultat » / « 3 résultats ». */
function resultats(n: number): string {
  return n > 1 ? `${n} résultats` : `${n} résultat`
}

/**
 * Message de refus d'une modification de voie (R55b), ou `null` si acceptée :
 * le niveau et le type d'une voie portant des résultats sont figés — les issues
 * saisies en dépendent. Cotation et points restent modifiables (R55d).
 */
export function refusModificationVoie({
  avant,
  apres,
  nbResultats,
}: {
  avant: { niveau: string; typeVoie: TypeVoie }
  apres: { niveau: string; typeVoie: TypeVoie }
  nbResultats: number
}): string | null {
  const change = avant.niveau !== apres.niveau || avant.typeVoie !== apres.typeVoie
  if (!change || nbResultats === 0) return null
  const saisis = nbResultats > 1 ? 'déjà saisis' : 'déjà saisi'
  return `Niveau et type non modifiables : ${resultats(nbResultats)} ${saisis} sur cette voie.`
}

/**
 * Message de refus d'une suppression (R55a, R55c), ou `null` si acceptée : une
 * voie ou un bloc portant des résultats, ou un palier retenu par un résultat,
 * ne se supprime pas.
 */
export function refusSuppression(
  nature: 'voie' | 'bloc' | 'palier',
  nbResultats: number,
): string | null {
  if (nbResultats === 0) return null
  const n = resultats(nbResultats)
  if (nature === 'palier') {
    return `Suppression impossible : ${n} ${nbResultats > 1 ? 'retiennent' : 'retient'} ce palier.`
  }
  const verbe = nbResultats > 1 ? 'sont saisis' : 'est saisi'
  const cible = nature === 'voie' ? 'cette voie' : 'ce bloc'
  return `Suppression impossible : ${n} ${verbe} sur ${cible}.`
}

/** Code de bloc ou libellé de palier vide après normalisation. */
export class LibelleStructureInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LibelleStructureInvalideError'
  }
}

/** Normalise un libellé obligatoire (R4) : bords retirés, espaces réduits. */
function normaliserObligatoire(brut: string | null | undefined, message: string): string {
  const normalise = (brut ?? '').trim().replace(/\s+/g, ' ')
  if (!normalise) throw new LibelleStructureInvalideError(message)
  return normalise
}

/** Code d'un bloc, normalisé et obligatoire (R53). */
export function normaliserCodeBloc(brut: string | null | undefined): string {
  return normaliserObligatoire(brut, 'Le code du bloc est obligatoire.')
}

/** Libellé d'un palier de bloc, normalisé et obligatoire (R53). */
export function normaliserLibellePalier(brut: string | null | undefined): string {
  return normaliserObligatoire(brut, 'Le libellé du palier est obligatoire.')
}
