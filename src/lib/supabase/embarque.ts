// Lecture des relations embarquées PostgREST. Selon la version du client, une
// relation (même to-one) peut être typée ou renvoyée en tableau : on accepte les
// deux formes.

function premiereLigne(valeur: unknown): Record<string, unknown> | null {
  const ligne = Array.isArray(valeur) ? valeur[0] : valeur
  return ligne && typeof ligne === 'object' ? (ligne as Record<string, unknown>) : null
}

/**
 * Compte d'une relation embarquée `relation(count)` : le comptage est fait par
 * la base (pas de lecture des lignes, donc pas de plafond de 1000). 0 si absent.
 */
export function compteEmbarque(valeur: unknown): number {
  const compte = premiereLigne(valeur)?.count
  return typeof compte === 'number' ? compte : 0
}

/** Nom d'une relation to-one embarquée (`club:club_id(nom)`) ; `null` si absente. */
export function nomEmbarque(valeur: unknown): string | null {
  const nom = premiereLigne(valeur)?.nom
  return typeof nom === 'string' ? nom : null
}
