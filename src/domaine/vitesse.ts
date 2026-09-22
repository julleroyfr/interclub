// Domaine pur — épreuve de vitesse (spec #10 « Saisie de la vitesse — juge »).
//
// La saisie d'un juge porte sur un RÉSULTAT de vitesse, qui prend exactement une
// des trois formes : un temps chronométré (en secondes, spec #10 R8), une chute,
// ou une non-présentation (spec #1 R31, spec #10 R7). Un grimpeur a un seul
// résultat par rencontre (R10) ; une ressaisie REMPLACE la précédente (correction,
// R11). Ici, pas d'accès Supabase : uniquement le modèle et ses invariants.

/** Résultat de vitesse d'un grimpeur — exactement une des trois formes (R7). */
export type ResultatVitesse =
  | { type: 'temps'; secondes: number }
  | { type: 'chute' }
  | { type: 'non_presentation' }

/** Saisie invalide (forme inconnue, temps non positif, grimpeur manquant). */
export class ResultatVitesseInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResultatVitesseInvalideError'
  }
}

/**
 * Valide et normalise un résultat de vitesse (R7/R8/R9).
 * Rejette toute forme hors des trois autorisées et tout temps non strictement
 * positif (un temps chronométré est une durée réellement mesurée, en secondes).
 */
export function creerResultatVitesse(resultat: ResultatVitesse): ResultatVitesse {
  switch (resultat.type) {
    case 'temps':
      if (!Number.isFinite(resultat.secondes) || resultat.secondes <= 0) {
        throw new ResultatVitesseInvalideError(
          'Un temps chronométré doit être une durée strictement positive, en secondes (R8).',
        )
      }
      return { type: 'temps', secondes: resultat.secondes }
    case 'chute':
      return { type: 'chute' }
    case 'non_presentation':
      return { type: 'non_presentation' }
    default:
      throw new ResultatVitesseInvalideError(
        `Forme de résultat de vitesse inconnue : ${JSON.stringify(resultat)} (R7).`,
      )
  }
}

/**
 * Enregistre le résultat d'un grimpeur dans les saisies d'une épreuve de vitesse
 * (R7/R10/R11). Fonction pure : renvoie une nouvelle map, sans muter l'entrée. Un
 * grimpeur a un seul résultat (R10) : une ressaisie REMPLACE la précédente
 * (correction, R11). Refuse un grimpeur non sélectionné.
 */
export function enregistrerResultat(
  saisies: ReadonlyMap<string, ResultatVitesse>,
  grimpeurId: string,
  resultat: ResultatVitesse,
): Map<string, ResultatVitesse> {
  if (!grimpeurId) {
    throw new ResultatVitesseInvalideError(
      'Un grimpeur doit être sélectionné avant la saisie (R7).',
    )
  }
  const valide = creerResultatVitesse(resultat)
  return new Map(saisies).set(grimpeurId, valide)
}

/**
 * Formate un temps de vitesse (secondes) au millième, à la française (R13).
 * Ex. `8.123` → « 8,123 s ». Réservé aux résultats de forme « temps ».
 */
export function formaterTempsVitesse(secondes: number): string {
  return `${secondes.toFixed(3).replace('.', ',')} s`
}
