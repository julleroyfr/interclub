'use server'

import { revalidatePath } from 'next/cache'

import { creerPret, PretInvalideError } from '@/domaine/pret'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { type EtatPret } from './prets'

/**
 * Crée un prêt (spec #1 R35). Défense en profondeur : garde admin ici (message
 * clair), mais la vraie frontière est la **RLS** `pret_insert` (admin seul).
 */
export async function creerPretAction(
  _etat: EtatPret,
  formData: FormData,
): Promise<EtatPret> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut créer un prêt (R35).' }
  }

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const clubAccueilId = String(formData.get('clubAccueilId') ?? '')

  const supabase = await createClient()
  const [{ data: grimpeur }, { data: engage }] = await Promise.all([
    supabase.from('grimpeur').select('club_id').eq('id', grimpeurId).maybeSingle(),
    // Déjà engagé (toute équipe) dans cette rencontre → indisponible au prêt (R14).
    supabase
      .from('composition')
      .select('grimpeur_id')
      .eq('rencontre_id', rencontreId)
      .eq('grimpeur_id', grimpeurId)
      .maybeSingle(),
  ])

  let pret
  try {
    pret = creerPret({
      rencontreId,
      grimpeurId,
      clubAccueilId,
      clubGrimpeurId: (grimpeur?.club_id as string) ?? '',
    })
  } catch (e) {
    if (e instanceof PretInvalideError) return { erreur: e.message }
    throw e
  }

  if (engage) {
    return {
      erreur:
        'Ce grimpeur est déjà engagé dans une équipe pour cette rencontre (R14) : indisponible au prêt.',
    }
  }

  const { error } = await supabase.from('pret').insert({
    rencontre_id: pret.rencontreId,
    grimpeur_id: pret.grimpeurId,
    club_accueil_id: pret.clubAccueilId,
  })
  if (error) {
    if (error.code === '23505') {
      return { erreur: 'Ce grimpeur est déjà prêté pour cette rencontre.' }
    }
    return { erreur: 'La création du prêt a échoué. Réessayez.' }
  }

  revalidatePath('/admin/prets')
  return { succes: 'Prêt créé.' }
}

/** Révoque un prêt (spec #1 R35). Ne retire pas d'office le grimpeur des équipes. */
export async function revoquerPretAction(
  _etat: EtatPret,
  formData: FormData,
): Promise<EtatPret> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut révoquer un prêt (R35).' }
  }

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase
    .from('pret')
    .delete()
    .eq('rencontre_id', rencontreId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: 'La révocation a échoué. Réessayez.' }

  revalidatePath('/admin/prets')
  return { succes: 'Prêt révoqué.' }
}
