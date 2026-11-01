// Domaine pur — mapping de rôle d'un compte permanent (spec #2 « Authentification
// & sessions QR », R1–R5).
//
// L'admin attribue à un compte Supabase existant un rôle applicatif (`admin` ou
// `coach`) et, pour un coach, un club (R4). Un compte porte AU PLUS un rôle (R1) ;
// un coach est rattaché à EXACTEMENT un club (R3) ; un admin n'a pas de club (R3).
// Le rôle `juge` n'a jamais de compte permanent (R2). Ici, pas d'accès Supabase :
// uniquement la validation et la normalisation, reflet de la contrainte SQL
// `chk_compte_role_club`.

/** Rôle applicatif d'un compte permanent (R1). Le `juge` en est exclu (R2). */
export type RoleApplicatif = 'admin' | 'coach'

/** Attribution demandée, avant validation. */
export type DemandeMapping = {
  utilisateurId: string
  role: RoleApplicatif
  clubId: string | null
}

/** Mapping validé et normalisé, prêt à être persisté dans `interclub.compte`. */
export type MappingDeRole = {
  utilisateurId: string
  role: RoleApplicatif
  clubId: string | null
}

/** Attribution invalide (rôle inconnu, club manquant/en trop, compte absent). */
export class MappingDeRoleInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MappingDeRoleInvalideError'
  }
}

/**
 * Valide et normalise une attribution de rôle (R1–R5).
 *
 * - Le compte cible est obligatoire (on n'attribue rien « à personne », R4).
 * - Le rôle est `admin` ou `coach` — un compte permanent ne peut être juge (R1, R2).
 * - Un coach doit être rattaché à un club (R3) ; un admin ne l'est jamais : on
 *   force son club à `null` même si un club est fourni (R3).
 */
export function creerMappingDeRole(demande: DemandeMapping): MappingDeRole {
  const utilisateurId = demande.utilisateurId?.trim() ?? ''
  if (!utilisateurId) {
    throw new MappingDeRoleInvalideError(
      'Aucun compte cible : sélectionnez le compte à qui attribuer le rôle.',
    )
  }

  if (demande.role !== 'admin' && demande.role !== 'coach') {
    throw new MappingDeRoleInvalideError(
      `Rôle applicatif invalide : ${JSON.stringify(demande.role)}. ` +
        'Un compte permanent est admin ou coach.',
    )
  }

  if (demande.role === 'admin') {
    // Un admin n'est rattaché à aucun club (R3) : normalisation à null.
    return { utilisateurId, role: 'admin', clubId: null }
  }

  const clubId = demande.clubId?.trim() ?? ''
  if (!clubId) {
    throw new MappingDeRoleInvalideError(
      'Un coach doit être rattaché à un club.',
    )
  }
  return { utilisateurId, role: 'coach', clubId }
}

// --- Suppression d'un compte permanent (spec #2 R41–R46, rév. 2026-10-16) ---

/** Suppression de compte refusée (non-admin, soi-même, cible absente — R45). */
export class SuppressionCompteRefuseeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SuppressionCompteRefuseeError'
  }
}

/** Demande de suppression : qui la fait (null = personne de connecté), et qui est visé. */
export type DemandeSuppressionCompte = {
  demandeur: { id: string; role: RoleApplicatif | null } | null
  cibleId: string
}

/**
 * Vérifie qu'une suppression de compte est permise et renvoie l'identifiant
 * normalisé du compte à supprimer (R41, R45).
 *
 * - Seul un admin supprime un compte (R41, R45).
 * - Tout compte permanent est supprimable — coach, admin ou sans mapping —
 *   sauf celui du demandeur : il reste donc toujours au moins un admin (R41).
 */
export function verifierSuppressionCompte(demande: DemandeSuppressionCompte): string {
  if (demande.demandeur?.role !== 'admin') {
    throw new SuppressionCompteRefuseeError(
      'Seul un administrateur peut supprimer un compte.',
    )
  }
  const cibleId = demande.cibleId?.trim() ?? ''
  if (!cibleId) {
    throw new SuppressionCompteRefuseeError('Aucun compte à supprimer.')
  }
  if (cibleId === demande.demandeur.id) {
    throw new SuppressionCompteRefuseeError(
      'Vous ne pouvez pas supprimer votre propre compte.',
    )
  }
  return cibleId
}

/** Utilisateur Supabase Auth, réduit à ce qui sert ici. */
type UtilisateurAuth = { id: string; email?: string | null; is_anonymous?: boolean }

/**
 * Comptes permanents parmi les utilisateurs Supabase Auth : les comptes
 * **anonymes** des sessions QR éphémères (R6) en sont exclus (R46).
 */
export function comptesPermanents(
  utilisateurs: UtilisateurAuth[],
): { id: string; email: string | null }[] {
  return utilisateurs
    .filter((u) => !u.is_anonymous)
    .map((u) => ({ id: u.id, email: u.email ?? null }))
}
