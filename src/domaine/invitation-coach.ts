// Domaine pur — invitation coach permanent (spec #2 R26–R33).
//
// Une invitation coach permanent est un secret durable, lié à un club, que
// l'admin affiche (QR + URL) pour permettre à un futur coach de créer son
// compte permanent rattaché à ce club. Ici : format de l'URL encodée dans le
// QR (R26), validation du périmètre « un club » (R28), matrice « qui peut
// gérer » (R29) et validation des identifiants d'inscription (R30). Pas d'accès
// Supabase : la création du compte + mapping (R31), l'unicité active par club
// (R28) et le refus des doublons (R32) passent par la base réelle.

/** Longueur minimale d'un mot de passe (minimum accepté par Supabase Auth). */
const LONGUEUR_MIN_MOT_DE_PASSE = 6

/** Acteur permanent qui tente de gérer une invitation (spec #2 R4, R29). */
export type ActeurInvitation = { role: 'admin' | 'coach' | null }

/** Périmètre validé d'une invitation : exactement un club (R28). */
export type InvitationCoach = { clubId: string }

/** Identifiants normalisés d'une inscription coach (R30). */
export type IdentifiantsInscription = { email: string; motDePasse: string }

/** Invitation ou inscription invalide (périmètre, identifiants…). */
export class InvitationCoachInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvitationCoachInvalideError'
  }
}

/**
 * Construit l'URL encodée dans le QR de l'invitation (R26).
 * Format : `<baseUrl>/inscription?invitation=<valeur>`
 */
export function construireUrlInvitation(baseUrl: string, valeur: string): string {
  const base = baseUrl.trim().replace(/\/$/, '')
  if (!base) {
    throw new InvitationCoachInvalideError("L'URL de base ne peut pas être vide.")
  }
  if (!valeur.trim()) {
    throw new InvitationCoachInvalideError(
      "La valeur de l'invitation ne peut pas être vide.",
    )
  }
  return `${base}/inscription?invitation=${valeur}`
}

/**
 * Valide et normalise le périmètre d'une invitation : elle est liée à
 * **exactement un club** (R28). Reflet de la contrainte SQL `not null`.
 */
export function creerInvitationCoach(demande: { clubId: string }): InvitationCoach {
  const clubId = demande.clubId?.trim() ?? ''
  if (!clubId) {
    throw new InvitationCoachInvalideError(
      'Une invitation coach permanent doit être liée à un club.',
    )
  }
  return { clubId }
}

/**
 * Matrice « qui peut générer / afficher / révoquer / régénérer » une invitation
 * (R29) : **seul l'admin**. Un coach permanent ne gère jamais d'invitation ; un
 * acteur sans rôle non plus (R5 fail-closed).
 */
export function peutGererInvitation(acteur: ActeurInvitation): boolean {
  return acteur.role === 'admin'
}

/**
 * Valide et normalise les identifiants d'une inscription via invitation (R30) :
 * email non vide et bien formé, mot de passe d'au moins {@link
 * LONGUEUR_MIN_MOT_DE_PASSE} caractères. L'email est normalisé (trim + bas de
 * casse) pour comparer sans ambiguïté au catalogue des comptes existants (R32).
 */
export function validerInscriptionCoach(demande: {
  email: string
  motDePasse: string
}): IdentifiantsInscription {
  const email = (demande.email ?? '').trim().toLowerCase()
  if (!email) {
    throw new InvitationCoachInvalideError('Renseignez votre e-mail.')
  }
  // Contrôle volontairement permissif : un « … @ … . … » sans espace. La
  // validation stricte reste du ressort de Supabase Auth.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvitationCoachInvalideError("L'e-mail n'est pas valide.")
  }

  const motDePasse = demande.motDePasse ?? ''
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new InvitationCoachInvalideError(
      `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
    )
  }

  return { email, motDePasse }
}

/**
 * Message d'échec de la création du compte à l'inscription, d'après le code
 * d'erreur de l'API Auth (spec #2 R32 ; revue du 2026-10-03, m6). Seul un e-mail
 * déjà associé à un compte donne le message R32 (« connectez-vous ») : un mot de
 * passe refusé ou une panne ne doivent pas faire croire que le compte existe.
 */
export function messageEchecCreationCompte(code: string | undefined): string {
  switch (code) {
    case 'email_exists':
    case 'user_already_exists':
      return 'Un compte existe déjà avec cet e-mail. Connectez-vous ou contactez un administrateur.'
    case 'weak_password':
      return 'Mot de passe refusé : choisissez un mot de passe plus long ou plus complexe.'
    case 'email_address_invalid':
      return "Cette adresse e-mail n'est pas acceptée. Vérifiez-la."
    default:
      return "L'inscription a échoué. Réessayez ou demandez une nouvelle invitation."
  }
}
