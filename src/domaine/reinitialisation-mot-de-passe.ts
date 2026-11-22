// Domaine pur — réinitialisation du mot de passe d'un compte permanent
// (spec #2 R48–R53, rév. 2026-11-22). Validation de la demande (R49) et du
// nouveau mot de passe (R51), destination après enregistrement (R51), et
// reconnaissance d'une session ouverte par le lien e-mail (R50, R53). L'envoi
// de l'e-mail, la vérification du lien et l'enregistrement relèvent de
// Supabase Auth.

import { LONGUEUR_MIN_MOT_DE_PASSE } from './invitation-coach'

/** Durée de validité du lien reçu par e-mail, en secondes (R50). */
export const DUREE_LIEN_REINITIALISATION_S = 3600

/** Message affiché après une demande, que le compte existe ou non (R49). */
export const MESSAGE_DEMANDE_ENVOYEE =
  'Si un compte existe pour cette adresse, un e-mail vient de lui être envoyé.'

/** Demande ou nouveau mot de passe invalide (message affichable). */
export class ReinitialisationInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReinitialisationInvalideError'
  }
}

/**
 * Valide et normalise l'adresse d'une demande de réinitialisation (R49) :
 * non vide et bien formée (même contrôle permissif qu'à l'inscription, R30).
 */
export function validerDemandeReinitialisation(emailBrut: string): string {
  const email = (emailBrut ?? '').trim().toLowerCase()
  if (!email) throw new ReinitialisationInvalideError('Renseignez votre e-mail.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ReinitialisationInvalideError("L'e-mail n'est pas valide.")
  }
  return email
}

/**
 * Valide le nouveau mot de passe (R51) : mêmes exigences qu'à l'inscription
 * (R30) — au moins {@link LONGUEUR_MIN_MOT_DE_PASSE} caractères, deux saisies
 * identiques.
 */
export function validerNouveauMotDePasse(saisie: {
  motDePasse: string
  confirmation: string
}): string {
  const motDePasse = saisie.motDePasse ?? ''
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new ReinitialisationInvalideError(
      `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
    )
  }
  if ((saisie.confirmation ?? '') !== motDePasse) {
    throw new ReinitialisationInvalideError('Les deux mots de passe ne correspondent pas.')
  }
  return motDePasse
}

/** Espace d'arrivée selon le rôle, comme après une connexion (R51, R5). */
export function destinationSelonRole(role: 'admin' | 'coach' | null | undefined): string {
  return role === 'admin' ? '/admin' : role === 'coach' ? '/coach' : '/'
}

/** Méthode d'authentification portée par le jeton de session (claim `amr`). */
export type MethodeAuthentification = { method: string; timestamp: number }

/**
 * Vrai si la session a été ouverte par le lien e-mail de réinitialisation
 * (méthode `otp` : l'application n'ouvre aucune autre session par lien) il y a
 * au plus {@link DUREE_LIEN_REINITIALISATION_S} secondes (R50, R53). Une
 * connexion par mot de passe, une session QR (anonyme) ou l'absence de session
 * ne donnent pas accès à l'écran « Nouveau mot de passe ».
 */
export function estSessionDeReinitialisation(
  amr: readonly MethodeAuthentification[] | undefined,
  maintenantS: number,
): boolean {
  return (amr ?? []).some(
    (m) => m.method === 'otp' && maintenantS - m.timestamp <= DUREE_LIEN_REINITIALISATION_S,
  )
}
