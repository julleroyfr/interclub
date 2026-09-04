'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

/** État renvoyé au formulaire de connexion (pour `useActionState`). */
export type EtatConnexion = { erreur?: string } | undefined

/**
 * Connexion d'un compte permanent (spec #2 R1) par e-mail + mot de passe.
 * Server Action : joignable par POST direct → on ne se fie pas à l'UI. En cas
 * d'échec on renvoie un message générique (ne pas révéler quel champ est faux).
 */
export async function seConnecter(
  _etatPrecedent: EtatConnexion,
  formData: FormData
): Promise<EtatConnexion> {
  const email = String(formData.get('email') ?? '').trim()
  const motDePasse = String(formData.get('motDePasse') ?? '')

  if (!email || !motDePasse) {
    return { erreur: 'Renseignez votre e-mail et votre mot de passe.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: motDePasse,
  })

  if (error) {
    return { erreur: 'Identifiants invalides.' }
  }

  // Redirection vers l'espace du rôle (spec #2 R1) : on lit le mapping avec le
  // client déjà authentifié (session en mémoire). Sans rôle → accueil générique.
  const { data: mapping } = await supabase
    .from('compte')
    .select('role')
    .eq('utilisateur_id', data.user.id)
    .maybeSingle()

  const destination =
    mapping?.role === 'admin' ? '/admin' : mapping?.role === 'coach' ? '/coach' : '/'

  // La session (cookies) a changé : rafraîchir tout l'arbre puis rediriger.
  revalidatePath('/', 'layout')
  redirect(destination)
}

/** Déconnexion : ferme la session Supabase et renvoie vers la connexion. */
export async function seDeconnecter(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/connexion')
}
