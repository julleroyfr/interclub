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
      'Aucun compte cible : sélectionnez le compte à qui attribuer le rôle (R4).',
    )
  }

  if (demande.role !== 'admin' && demande.role !== 'coach') {
    throw new MappingDeRoleInvalideError(
      `Rôle applicatif invalide : ${JSON.stringify(demande.role)}. ` +
        'Un compte permanent est admin ou coach (R1, R2).',
    )
  }

  if (demande.role === 'admin') {
    // Un admin n'est rattaché à aucun club (R3) : normalisation à null.
    return { utilisateurId, role: 'admin', clubId: null }
  }

  const clubId = demande.clubId?.trim() ?? ''
  if (!clubId) {
    throw new MappingDeRoleInvalideError(
      'Un coach doit être rattaché à un club (R3).',
    )
  }
  return { utilisateurId, role: 'coach', clubId }
}
