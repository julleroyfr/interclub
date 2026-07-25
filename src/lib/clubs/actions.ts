'use server'

import { revalidatePath } from 'next/cache'

import { normaliserNomClub, NomClubInvalideError } from '@/domaine/club'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { type EtatClub } from './clubs'

// CRUD des clubs (spec #1 R11) — réservé à l'admin. Server Actions : joignables
// par POST direct, on ne se fie pas à l'UI. Défense en profondeur : garde admin
// explicite (message clair) + la vraie frontière reste la **RLS** (policies
// `club_insert/update/delete_admin`, qui rejetteraient un non-admin).

/** Refuse l'appelant non-admin (message R11), ou `null` si admin. */
async function refuserSiNonAdmin(): Promise<EtatClub | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut gérer les clubs (R11).' }
  }
  return null
}

/** Traduit une erreur Postgres/PostgREST en message lisible. */
function messageErreur(code: string | undefined, contexte: 'ecriture' | 'suppression'): string {
  if (code === '23505') return 'Un club porte déjà ce nom.'
  if (code === '23503') {
    return 'Ce club est référencé (rencontres ou grimpeurs) : suppression impossible.'
  }
  return contexte === 'suppression'
    ? 'La suppression a échoué. Réessayez.'
    : 'L’enregistrement a échoué. Réessayez.'
}

export async function creerClub(
  _etatPrecedent: EtatClub,
  formData: FormData,
): Promise<EtatClub> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  let nom: string
  try {
    nom = normaliserNomClub(String(formData.get('nom') ?? ''))
  } catch (e) {
    if (e instanceof NomClubInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase.from('club').insert({ nom })
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/clubs')
  return { succes: `Club « ${nom} » créé.` }
}

export async function renommerClub(
  _etatPrecedent: EtatClub,
  formData: FormData,
): Promise<EtatClub> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Club introuvable.' }

  let nom: string
  try {
    nom = normaliserNomClub(String(formData.get('nom') ?? ''))
  } catch (e) {
    if (e instanceof NomClubInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase.from('club').update({ nom }).eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/clubs')
  return { succes: `Club renommé « ${nom} ».` }
}

export async function supprimerClub(
  _etatPrecedent: EtatClub,
  formData: FormData,
): Promise<EtatClub> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Club introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('club').delete().eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'suppression') }

  revalidatePath('/admin/clubs')
  return { succes: 'Club supprimé.' }
}
