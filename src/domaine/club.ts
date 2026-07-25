// Domaine pur — club (spec #1 « Rôles & autorisations », R11 : CRUD club réservé
// à l'admin). Ici, pas d'accès Supabase : uniquement la validation/normalisation
// du nom, reflet de la contrainte SQL `club.nom` (`text not null unique`).

/** Longueur maximale d'un nom de club (borne de saisie, côté domaine). */
export const NOM_CLUB_MAX = 100

/** Nom de club invalide (vide, ou trop long). */
export class NomClubInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NomClubInvalideError'
  }
}

/**
 * Normalise un nom de club : espaces de bord retirés, espaces internes réduits à
 * un seul. Rejette un nom vide ou dépassant `NOM_CLUB_MAX`. L'unicité (R11) est
 * garantie par la base (`unique`) ; elle ne peut être vérifiée ici (pur).
 */
export function normaliserNomClub(nom: string): string {
  const normalise = (nom ?? '').trim().replace(/\s+/g, ' ')

  if (!normalise) {
    throw new NomClubInvalideError('Le nom du club est obligatoire.')
  }
  if (normalise.length > NOM_CLUB_MAX) {
    throw new NomClubInvalideError(
      `Le nom du club ne peut dépasser ${NOM_CLUB_MAX} caractères.`,
    )
  }
  return normalise
}
