// Domaine pur — accord en nombre des libellés affichés. Pas de « (s) » dans
// l'interface : le mot est au singulier pour 0 et 1, au pluriel au-delà (usage
// français, déjà appliqué par l'export PDF, spec #15 R12).

/** Le mot accordé à `n` ; pluriel en « s » sauf s'il est fourni. */
export function accorder(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return n <= 1 ? singulier : pluriel
}

/** `n` suivi du mot accordé : « 0 équipe », « 3 grimpeurs ». */
export function compter(n: number, singulier: string, pluriel?: string): string {
  return `${n} ${accorder(n, singulier, pluriel)}`
}
