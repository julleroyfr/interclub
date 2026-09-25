import 'server-only'

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

/** Rôle applicatif d'un compte permanent (spec #2 R1). */
export type RoleApplicatif = 'admin' | 'coach'

/**
 * Utilisateur connecté et son mapping applicatif.
 * `role`/`clubId` sont `null` tant qu'aucun mapping n'a été attribué (spec #2 R5,
 * fail-closed) : un compte sans rôle n'a aucun droit applicatif.
 */
export type UtilisateurCourant = {
  id: string
  email: string | null
  role: RoleApplicatif | null
  clubId: string | null
}

/**
 * Lit l'utilisateur connecté et son rôle/club depuis `interclub.compte`.
 * Mémoïsé sur la durée d'un rendu (React `cache`) pour éviter les requêtes
 * dupliquées. Renvoie `null` si personne n'est connecté.
 *
 * La lecture de `compte` passe par la RLS : la policy « lecture de son compte ou
 * admin » garantit qu'on ne lit que sa propre ligne (spec #1 R4).
 */
export const getUtilisateurCourant = cache(
  async (): Promise<UtilisateurCourant | null> => {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('compte')
      .select('role, club_id')
      .eq('utilisateur_id', user.id)
      .maybeSingle()

    // Une erreur de lecture ne doit pas prétendre à un rôle : on reste fail-closed.
    if (error) {
      console.error('Lecture du mapping de rôle impossible :', error.message)
    }

    return {
      id: user.id,
      email: user.email ?? null,
      role: (data?.role as RoleApplicatif | undefined) ?? null,
      clubId: data?.club_id ?? null,
    }
  }
)

/**
 * Garde de route/action : renvoie l'utilisateur connecté, ou redirige vers la
 * connexion s'il n'y en a pas (spec #12 R2). À utiliser au plus près de l'accès
 * aux données.
 */
export async function exigerUtilisateur(): Promise<UtilisateurCourant> {
  const utilisateur = await getUtilisateurCourant()
  if (!utilisateur) redirect('/connexion')
  return utilisateur
}

/**
 * Garde des pages publiques d'authentification (spec #12 R8) : un utilisateur
 * **déjà authentifié avec un rôle** est renvoyé vers son espace (R6) au lieu de
 * voir le formulaire. Sans rôle attribué (ou non connecté) : ne fait rien.
 */
export async function redirigerSiConnecte(): Promise<void> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role === 'admin') redirect('/admin')
  if (utilisateur?.role === 'coach') redirect('/coach')
}

/**
 * Garde unifiée de l'espace admin (spec #12 R4) : applique la politique hybride
 * — **pas de session** → `redirect('/connexion')` (R2) ; **session sans rôle
 * admin** → `notFound()` (R3, on ne révèle pas l'existence de l'espace). Renvoie
 * l'utilisateur admin. À utiliser par toutes les pages `/admin/**`.
 */
export async function exigerAdmin(): Promise<UtilisateurCourant> {
  const utilisateur = await exigerUtilisateur()
  if (utilisateur.role !== 'admin') notFound()
  return utilisateur
}

/**
 * Contexte d'accès à l'espace coach (spec #5 R16). Deux acteurs :
 * - **permanent** : compte rattaché à un club, actif tout au long des phases
 *   ① pré-compétition et ② préparation, sur toutes les rencontres de son club ;
 * - **temporaire** : session QR anonyme du jour J, bornée à **une** rencontre
 *   (préparation ou compétition), aux mêmes droits d'engagement que le permanent
 *   en ② préparation (spec #1 R6/R27).
 */
export type ContexteCoach =
  | { type: 'permanent'; clubId: string }
  | { type: 'temporaire'; clubId: string; rencontreId: string }

/**
 * Résout le contexte coach de la requête courante (spec #5 R16), ou `null` si
 * l'utilisateur n'est ni coach permanent ni titulaire d'une session QR temporaire
 * active. Mémoïsé sur la durée d'un rendu.
 *
 * Ordre : on privilégie le coach **permanent** (mapping `compte`) ; à défaut on
 * interroge la session QR temporaire via la RPC `contexte_coach_temporaire`
 * (SECURITY DEFINER — un anonyme ne peut pas lire `jeton_qr` directement). La
 * RPC ne renvoie un périmètre que si la session est « du jour » (préparation ou
 * compétition) et le jeton actif ; sinon `null` (fail-closed).
 */
export const getContexteCoach = cache(async (): Promise<ContexteCoach | null> => {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role === 'coach' && utilisateur.clubId) {
    return { type: 'permanent', clubId: utilisateur.clubId }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('contexte_coach_temporaire')
  if (error) {
    console.error('Lecture du contexte coach temporaire impossible :', error.message)
    return null
  }
  if (!data || typeof data !== 'object') return null

  const d = data as Record<string, unknown>
  const clubId = typeof d['club_id'] === 'string' ? d['club_id'] : null
  const rencontreId = typeof d['rencontre_id'] === 'string' ? d['rencontre_id'] : null
  if (!clubId || !rencontreId) return null

  return { type: 'temporaire', clubId, rencontreId }
})

/**
 * Garde de l'espace coach (spec #12 R5) : renvoie le contexte coach, ou applique
 * la politique hybride quand il est absent — **pas de session** →
 * `redirect('/connexion')` (R2) ; **session sans périmètre coach** → `notFound()`
 * (R3).
 */
export async function exigerContexteCoach(): Promise<ContexteCoach> {
  const contexte = await getContexteCoach()
  if (contexte) return contexte
  await exigerUtilisateur() // pas de session → redirect ; sinon on masque en 404
  notFound()
}

/**
 * Contexte d'accès à l'espace juge (spec #10 R1/R2). Session QR « juge »
 * (anonyme) active en ③ compétition : périmètre = l'**épreuve de vitesse** de sa
 * rencontre (le couloir n'est qu'une information d'organisation, spec #1 R30).
 */
export type ContexteJuge = {
  rencontreId: string
  epreuveVitesseId: string
  couloirNumero: number | null
  dateRencontre: string
  clubPorteurNom: string
  phase: string
}

/**
 * Résout le contexte juge de la requête courante (spec #10 R1), ou `null` si
 * l'utilisateur n'a pas de session QR juge active. Mémoïsé sur la durée d'un
 * rendu. Passe par la RPC `contexte_juge` (SECURITY DEFINER — un anonyme ne peut
 * pas lire `jeton_qr` directement) : elle ne renvoie un périmètre que si la
 * session est « du jour » (③ compétition), le jeton actif et une épreuve de
 * vitesse existe ; sinon `null` (fail-closed).
 */
export const getContexteJuge = cache(async (): Promise<ContexteJuge | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('contexte_juge')
  if (error) {
    console.error('Lecture du contexte juge impossible :', error.message)
    return null
  }
  if (!data || typeof data !== 'object') return null

  const d = data as Record<string, unknown>
  const rencontreId = typeof d['rencontre_id'] === 'string' ? d['rencontre_id'] : null
  const epreuveVitesseId =
    typeof d['epreuve_vitesse_id'] === 'string' ? d['epreuve_vitesse_id'] : null
  // Pas d'épreuve de vitesse → aucune saisie possible (fail-closed).
  if (!rencontreId || !epreuveVitesseId) return null

  return {
    rencontreId,
    epreuveVitesseId,
    couloirNumero: typeof d['couloir_numero'] === 'number' ? d['couloir_numero'] : null,
    dateRencontre: typeof d['date_rencontre'] === 'string' ? d['date_rencontre'] : '',
    clubPorteurNom: typeof d['club_porteur_nom'] === 'string' ? d['club_porteur_nom'] : '',
    phase: typeof d['phase'] === 'string' ? d['phase'] : '',
  }
})

/**
 * Garde de l'espace juge (spec #12 R5) : renvoie le contexte juge, ou applique la
 * politique hybride quand il est absent — **pas de session** →
 * `redirect('/connexion')` (R2) ; **session sans périmètre juge** → `notFound()`
 * (R3). L'entrée reste QR-only (R18) ; cette garde ne fait que sécuriser l'accès.
 */
export async function exigerContexteJuge(): Promise<ContexteJuge> {
  const contexte = await getContexteJuge()
  if (contexte) return contexte
  await exigerUtilisateur()
  notFound()
}
