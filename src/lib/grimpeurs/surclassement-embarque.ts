// Lecture d'une relation `surclassement` embarquée dans une ligne `grimpeur`
// (PostgREST : `surclassement(saison, revoque_le)`), pour le contrôle
// d'éligibilité des Server Actions d'engagement (spec #21 R7, R9).

/** Colonnes à embarquer dans la lecture du grimpeur. */
export const SURCLASSEMENT_EMBARQUE = 'surclassement(saison, revoque_le)'

/** Vrai si la relation embarquée contient un surclassement actif de la saison. */
export function estSurclasseEmbarque(valeur: unknown, saison: number): boolean {
  const lignes = (Array.isArray(valeur) ? valeur : valeur ? [valeur] : []) as {
    saison?: unknown
    revoque_le?: unknown
  }[]
  return lignes.some((l) => l.saison === saison && l.revoque_le == null)
}
