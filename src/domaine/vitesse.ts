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

// ---------------------------------------------------------------------------
// Barème de vitesse par rang — édition & validation (spec #3 R46/R47/R48)
// ---------------------------------------------------------------------------

/** Un échelon du barème de vitesse par rang (spec #3 R46) : plage + points/décrément. */
export type EchelonBareme = {
  rangMin: number
  /** `null` = « au-delà » (dernier échelon, sans borne haute). */
  rangMax: number | null
  points: number
  decrement: number
}

/** Jeu d'échelons invalide au regard de l'invariant R46 (conditions R48). */
export class BaremeVitesseInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BaremeVitesseInvalideError'
  }
}

/**
 * Valide un jeu d'échelons de barème de vitesse avant enregistrement (R47/R48) et
 * le renvoie **trié par `rangMin` croissant**. Lève `BaremeVitesseInvalideError`
 * avec un message précis dès qu'une condition de R48 est violée (rejet global,
 * rien n'est « réparé »). Fonction pure : l'entrée n'est pas mutée.
 */
export function validerEchelonsBareme(
  echelons: readonly EchelonBareme[],
): EchelonBareme[] {
  // a. au moins un échelon.
  if (echelons.length === 0) {
    throw new BaremeVitesseInvalideError('Le barème doit comporter au moins un échelon (R48).')
  }

  // b/c. champs de chaque échelon (rangs, points, décrément) — entiers, bornes.
  for (const e of echelons) {
    if (!Number.isInteger(e.rangMin) || e.rangMin < 1) {
      throw new BaremeVitesseInvalideError(
        `Le rang minimum doit être un entier ≥ 1 (reçu : ${e.rangMin}) (R48).`,
      )
    }
    if (e.rangMax !== null && (!Number.isInteger(e.rangMax) || e.rangMax < e.rangMin)) {
      throw new BaremeVitesseInvalideError(
        `Le rang maximum doit être vide (« au-delà ») ou un entier ≥ rang minimum ` +
          `(échelon ${e.rangMin}…${e.rangMax}) (R48).`,
      )
    }
    if (!Number.isInteger(e.points) || e.points < 0) {
      throw new BaremeVitesseInvalideError(
        `Les points doivent être un entier ≥ 0 (reçu : ${e.points}) (R48).`,
      )
    }
    if (!Number.isInteger(e.decrement) || e.decrement < 0) {
      throw new BaremeVitesseInvalideError(
        `Le décrément doit être un entier ≥ 0 (reçu : ${e.decrement}) (R48).`,
      )
    }
  }

  // Tri par rang_min croissant (copie — pas de mutation de l'entrée).
  const tries = [...echelons].sort((a, b) => a.rangMin - b.rangMin)

  // d. la couverture commence au rang 1.
  if (tries[0].rangMin !== 1) {
    throw new BaremeVitesseInvalideError(
      `La couverture doit commencer au rang 1 (premier échelon : rang ${tries[0].rangMin}) (R48).`,
    )
  }

  // e. contiguïté sans chevauchement ; seul le dernier échelon peut être « au-delà ».
  for (let i = 0; i < tries.length - 1; i++) {
    const cur = tries[i]
    const suivant = tries[i + 1]
    if (cur.rangMax === null) {
      throw new BaremeVitesseInvalideError(
        `Seul le dernier échelon peut être « au-delà » (échelon ouvert au rang ${cur.rangMin} ` +
          `suivi d'un autre) (R48).`,
      )
    }
    if (suivant.rangMin > cur.rangMax + 1) {
      throw new BaremeVitesseInvalideError(
        `Trou de couverture entre les rangs ${cur.rangMax} et ${suivant.rangMin} (R48).`,
      )
    }
    if (suivant.rangMin < cur.rangMax + 1) {
      throw new BaremeVitesseInvalideError(
        `Chevauchement des échelons autour du rang ${suivant.rangMin} (R48).`,
      )
    }
  }

  // f. le dernier échelon est ouvert (couvre tous les rangs au-delà).
  const dernier = tries[tries.length - 1]
  if (dernier.rangMax !== null) {
    throw new BaremeVitesseInvalideError(
      `Le dernier échelon doit être « au-delà » (rang max vide) pour couvrir tous les ` +
        `rangs supérieurs (R48).`,
    )
  }

  return tries
}
