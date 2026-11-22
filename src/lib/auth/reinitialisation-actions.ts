'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  MESSAGE_DEMANDE_ENVOYEE,
  ReinitialisationInvalideError,
  destinationSelonRole,
  estSessionDeReinitialisation,
  validerDemandeReinitialisation,
  validerNouveauMotDePasse,
  type MethodeAuthentification,
} from '@/domaine/reinitialisation-mot-de-passe'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

/** État du formulaire « Mot de passe oublié ? » (pour `useActionState`). */
export type EtatDemandeReinitialisation = { erreur?: string; envoye?: string } | undefined

/**
 * Demande de réinitialisation (spec #2 R48–R50) : Supabase Auth envoie l'e-mail
 * si l'adresse correspond à un compte. La réponse est **la même** dans tous les
 * cas (R49) : une erreur d'envoi (compte inconnu, limite de fréquence…) est
 * journalisée, jamais montrée.
 */
export async function demanderReinitialisation(
  _etatPrecedent: EtatDemandeReinitialisation,
  formData: FormData,
): Promise<EtatDemandeReinitialisation> {
  let email: string
  try {
    email = validerDemandeReinitialisation(String(formData.get('email') ?? ''))
  } catch (e) {
    if (e instanceof ReinitialisationInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) console.error('Demande de réinitialisation non envoyée :', error.message)

  return { envoye: MESSAGE_DEMANDE_ENVOYEE }
}

/** État du formulaire « Nouveau mot de passe ». */
export type EtatNouveauMotDePasse = { erreur?: string; lienInvalide?: boolean } | undefined

const MESSAGE_LIEN_INVALIDE =
  'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.'

/**
 * Enregistre le nouveau mot de passe (spec #2 R51–R53). Le lien (`token_hash`)
 * n'est consommé **qu'ici** (R52), après validation du mot de passe (R51) :
 * une saisie refusée ne le gâche pas. Si le lien a déjà ouvert la session de
 * réinitialisation (nouvel essai après un refus de Supabase), on ne le
 * revérifie pas. Sans lien ni session de réinitialisation : refus (R53).
 */
export async function enregistrerNouveauMotDePasse(
  _etatPrecedent: EtatNouveauMotDePasse,
  formData: FormData,
): Promise<EtatNouveauMotDePasse> {
  let motDePasse: string
  try {
    motDePasse = validerNouveauMotDePasse({
      motDePasse: String(formData.get('motDePasse') ?? ''),
      confirmation: String(formData.get('confirmationMotDePasse') ?? ''),
    })
  } catch (e) {
    if (e instanceof ReinitialisationInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { data: jeton } = await supabase.auth.getClaims()
  const amr = jeton?.claims.amr as MethodeAuthentification[] | undefined
  const dejaOuverte = estSessionDeReinitialisation(amr, Math.floor(Date.now() / 1000))

  if (!dejaOuverte) {
    const tokenHash = String(formData.get('tokenHash') ?? '')
    if (!tokenHash) return { erreur: MESSAGE_LIEN_INVALIDE, lienInvalide: true }
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    if (error) return { erreur: MESSAGE_LIEN_INVALIDE, lienInvalide: true }
  }

  const { data, error } = await supabase.auth.updateUser({ password: motDePasse })
  if (error) {
    if (error.code === 'same_password') {
      return { erreur: "Choisissez un mot de passe différent de l'ancien." }
    }
    if (error.code === 'weak_password') {
      return { erreur: 'Ce mot de passe est trop simple. Choisissez-en un plus robuste.' }
    }
    console.error('Nouveau mot de passe non enregistré :', error.message)
    return { erreur: "Le mot de passe n'a pas pu être enregistré. Réessayez." }
  }

  // Connecté avec le nouveau mot de passe : espace du rôle (R51), comme
  // après une connexion.
  const mapping = verifierLecture(
    await supabase.from('compte').select('role').eq('utilisateur_id', data.user.id).maybeSingle(),
    'du compte',
  )
  revalidatePath('/', 'layout')
  redirect(destinationSelonRole(mapping?.role))
}
