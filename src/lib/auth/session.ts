import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

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
 * connexion s'il n'y en a pas. À utiliser au plus près de l'accès aux données.
 */
export async function exigerUtilisateur(): Promise<UtilisateurCourant> {
  const utilisateur = await getUtilisateurCourant()
  if (!utilisateur) redirect('/connexion')
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
