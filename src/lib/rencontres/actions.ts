'use server'

import { revalidatePath } from 'next/cache'

import {
  normaliserSaisieRencontre,
  PHASES,
  SaisieRencontreInvalideError,
  type Phase,
} from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { type EtatRencontre } from './rencontres'

// CRUD des rencontres (spec #1 R12) — réservé à l'admin. Server Actions :
// joignables par POST direct, on ne se fie pas à l'UI. Défense en profondeur :
// garde admin explicite (message clair) + la vraie frontière reste la **RLS**
// (policies `rencontre_insert/update/delete_admin`).

/** Refuse l'appelant non-admin (message R12), ou `null` si admin. */
async function refuserSiNonAdmin(): Promise<EtatRencontre | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut gérer les rencontres (R12).' }
  }
  return null
}

/** Traduit une erreur Postgres/PostgREST en message lisible. */
function messageErreur(code: string | undefined, contexte: 'ecriture' | 'suppression'): string {
  if (code === '23503') {
    return contexte === 'suppression'
      ? 'Cette rencontre est référencée : suppression impossible.'
      : 'Le club porteur est introuvable.'
  }
  return contexte === 'suppression'
    ? 'La suppression a échoué. Réessayez.'
    : 'L’enregistrement a échoué. Réessayez.'
}

export async function creerRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  let saisie
  try {
    saisie = normaliserSaisieRencontre({
      dateRencontre: String(formData.get('dateRencontre') ?? ''),
      clubPorteurId: String(formData.get('clubPorteurId') ?? ''),
      categorie: String(formData.get('categorie') ?? ''),
    })
  } catch (e) {
    if (e instanceof SaisieRencontreInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  // Copie atomique du gabarit → rencontre (R30). La RPC gère la transaction :
  // si l'une des insertions échoue, la rencontre n'est pas créée non plus.
  const { error } = await supabase.rpc('creer_rencontre_avec_gabarit', {
    p_date: saisie.dateRencontre,
    p_club_porteur: saisie.clubPorteurId,
    p_categorie: saisie.categorie,
  })
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/rencontres')
  return { succes: 'Rencontre créée.' }
}

export async function modifierRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Rencontre introuvable.' }

  let saisie
  try {
    saisie = normaliserSaisieRencontre({
      dateRencontre: String(formData.get('dateRencontre') ?? ''),
      clubPorteurId: String(formData.get('clubPorteurId') ?? ''),
      categorie: String(formData.get('categorie') ?? ''),
    })
  } catch (e) {
    if (e instanceof SaisieRencontreInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('rencontre')
    .update({
      date_rencontre: saisie.dateRencontre,
      club_porteur_id: saisie.clubPorteurId,
      categorie: saisie.categorie,
    })
    .eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/rencontres')
  return { succes: 'Rencontre modifiée.' }
}

export async function changerPhaseRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Rencontre introuvable.' }

  const phase = String(formData.get('phase') ?? '')
  if (!PHASES.some((p) => p.value === phase)) {
    return { erreur: 'La phase est invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('rencontre')
    .update({ phase: phase as Phase })
    .eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/rencontres')
  const label = PHASES.find((p) => p.value === phase)?.label ?? phase
  return { succes: `Phase : ${label}.` }
}

export async function supprimerRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Rencontre introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('rencontre').delete().eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'suppression') }

  revalidatePath('/admin/rencontres')
  return { succes: 'Rencontre supprimée.' }
}
