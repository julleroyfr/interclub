// Domaine pur — épreuve de vitesse (spec #1 « Rôles & autorisations », R30, R31).
//
// La saisie d'un juge porte sur un RÉSULTAT de vitesse, qui prend exactement une
// des trois formes : un temps chronométré, une chute, ou une non-présentation
// (R31). Un grimpeur a un seul résultat par rencontre (R31). Ici, pas d'accès
// Supabase : uniquement le modèle et ses invariants.

/** Résultat de vitesse d'un grimpeur — exactement une des trois formes (R31). */
export type ResultatVitesse =
  | { type: 'temps'; centiemes: number }
  | { type: 'chute' }
  | { type: 'non_presentation' }

/** Saisie invalide (forme inconnue, temps non positif, grimpeur manquant). */
export class ResultatVitesseInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResultatVitesseInvalideError'
  }
}

/** Un grimpeur a déjà un résultat : pas d'autre passage (R31). */
export class ResultatDejaSaisiError extends Error {
  constructor(grimpeurId: string) {
    super(`Le grimpeur ${grimpeurId} a déjà un résultat de vitesse (R31).`)
    this.name = 'ResultatDejaSaisiError'
  }
}

/**
 * Valide et normalise un résultat de vitesse (R31).
 * Rejette toute forme hors des trois autorisées et tout temps non strictement
 * positif (un temps chronométré est une durée réellement mesurée).
 */
export function creerResultatVitesse(resultat: ResultatVitesse): ResultatVitesse {
  switch (resultat.type) {
    case 'temps':
      if (!Number.isFinite(resultat.centiemes) || resultat.centiemes <= 0) {
        throw new ResultatVitesseInvalideError(
          'Un temps chronométré doit être une durée strictement positive (R31).',
        )
      }
      return { type: 'temps', centiemes: resultat.centiemes }
    case 'chute':
      return { type: 'chute' }
    case 'non_presentation':
      return { type: 'non_presentation' }
    default:
      throw new ResultatVitesseInvalideError(
        `Forme de résultat de vitesse inconnue : ${JSON.stringify(resultat)} (R31).`,
      )
  }
}

/**
 * Enregistre le résultat d'un grimpeur dans les saisies d'une épreuve de vitesse
 * (R31). Fonction pure : renvoie une nouvelle map, sans muter l'entrée. Refuse un
 * grimpeur non sélectionné ou déjà saisi (un seul résultat, pas d'autre passage).
 */
export function enregistrerResultat(
  saisies: ReadonlyMap<string, ResultatVitesse>,
  grimpeurId: string,
  resultat: ResultatVitesse,
): Map<string, ResultatVitesse> {
  if (!grimpeurId) {
    throw new ResultatVitesseInvalideError(
      'Un grimpeur doit être sélectionné avant la saisie (R31).',
    )
  }
  if (saisies.has(grimpeurId)) {
    throw new ResultatDejaSaisiError(grimpeurId)
  }
  const valide = creerResultatVitesse(resultat)
  return new Map(saisies).set(grimpeurId, valide)
}
