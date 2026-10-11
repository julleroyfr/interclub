// Domaine pur — invitation administrateur (spec #2 R35–R40, rév. 2026-10-09).
//
// L'admin génère un QR/URL à usage unique, valable 15 minutes, qui permet de
// créer un compte permanent de rôle admin. Ici : format de l'URL (R35), état
// dérivé de l'invitation (R36, R37, R40), temps restant (R40) et matrice « qui
// peut gérer » (R35). Pas d'accès Supabase : la consommation atomique et la
// création du mapping (R38, R39) passent par la RPC `finaliser_inscription_admin`.

import type { ActeurInvitation } from './invitation-coach'

/** Durée de validité d'une invitation administrateur (R36). */
export const DUREE_INVITATION_ADMIN_MINUTES = 15

/** État affiché d'une invitation administrateur (R40). */
export type EtatInvitationAdmin = 'valable' | 'utilisee' | 'expiree' | 'revoquee'

/** Données d'une invitation nécessaires au calcul de son état. */
export type InvitationAdmin = {
  actif: boolean
  expireLe: Date
  utiliseeLe: Date | null
}

/** Paramètre d'URL portant la valeur de l'invitation administrateur. */
export const PARAMETRE_INVITATION_ADMIN = 'invitation_admin'

/** Invitation administrateur invalide (URL…). */
export class InvitationAdminInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvitationAdminInvalideError'
  }
}

/**
 * Construit l'URL encodée dans le QR de l'invitation administrateur (R35).
 * Format : `<baseUrl>/inscription?invitation_admin=<valeur>`
 */
export function construireUrlInvitationAdmin(baseUrl: string, valeur: string): string {
  const base = baseUrl.trim().replace(/\/$/, '')
  if (!base) {
    throw new InvitationAdminInvalideError("L'URL de base ne peut pas être vide.")
  }
  if (!valeur.trim()) {
    throw new InvitationAdminInvalideError("La valeur de l'invitation ne peut pas être vide.")
  }
  return `${base}/inscription?${PARAMETRE_INVITATION_ADMIN}=${valeur}`
}

/**
 * État d'une invitation à l'instant `maintenant` (R36, R37, R40). Une invitation
 * utilisée le reste ; sinon, inactive = révoquée (ou remplacée, R37) ; sinon,
 * expirée à partir de son heure d'expiration.
 */
export function etatInvitationAdmin(
  invitation: InvitationAdmin,
  maintenant: Date,
): EtatInvitationAdmin {
  if (invitation.utiliseeLe) return 'utilisee'
  if (!invitation.actif) return 'revoquee'
  if (maintenant.getTime() >= invitation.expireLe.getTime()) return 'expiree'
  return 'valable'
}

/** Secondes entières restant avant l'expiration, jamais négatives (R40). */
export function secondesRestantes(expireLe: Date, maintenant: Date): number {
  return Math.max(0, Math.floor((expireLe.getTime() - maintenant.getTime()) / 1000))
}

/** Temps restant au format `m:ss` (R40). */
export function formaterTempsRestant(secondes: number): string {
  const minutes = Math.floor(secondes / 60)
  const reste = secondes % 60
  return `${minutes}:${String(reste).padStart(2, '0')}`
}

/** Seul l'admin génère, affiche ou révoque une invitation administrateur (R35). */
export function peutGererInvitationAdmin(acteur: ActeurInvitation): boolean {
  return acteur.role === 'admin'
}
