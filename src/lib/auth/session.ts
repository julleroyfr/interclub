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
