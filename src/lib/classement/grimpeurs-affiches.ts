// Grimpeurs affichés par un écran de classement (spec #11 R8bis, rév.
// 2026-11-10) : tous les grimpeurs composés dans la rencontre, qui figurent au
// classement individuel (filles et garçons). Sert au filtre du temps réel.

/** Identifiants des grimpeurs du classement individuel. */
export function grimpeursDuClassement(individuel: {
  filles: readonly { grimpeurId: string }[]
  garcons: readonly { grimpeurId: string }[]
}): string[] {
  return [...individuel.filles, ...individuel.garcons].map((l) => l.grimpeurId)
}
