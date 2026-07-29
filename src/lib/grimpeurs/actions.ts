'use server'

import { revalidatePath } from 'next/cache'

import {
  GrimpeurInvalideError,
  normaliserSaisieGrimpeur,
} from '@/domaine/grimpeur'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { type EtatGrimpeur } from './grimpeurs'

// CRUD du roster de grimpeurs (spec #1 R18 : coach de son club ; R11/R13 :
// paramétrage admin). Cet écran est le volet **admin** (gère tout club) ; on
// garde donc l'accès à l'admin. Server Actions : joignables par POST direct, on
// ne se fie pas à l'UI. Défense en profondeur : garde admin explicite + la vraie
// frontière reste la **RLS** (policies `grimpeur_*`, qui admettent aussi le
// coach du club — hors périmètre de cet écran admin).

/** Refuse l'appelant non-admin, ou `null` si admin. */
async function refuserSiNonAdmin(): Promise<EtatGrimpeur | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut gérer le roster ici (R11/R13).' }
  }
  return null
}

/** Traduit une erreur Postgres/PostgREST en message lisible. */
function messageErreur(code: string | undefined, contexte: 'ecriture' | 'suppression'): string {
  if (code === '23503') {
    return contexte === 'suppression'
      ? 'Ce grimpeur est référencé : suppression impossible.'
      : 'Le club est introuvable.'
  }
  return contexte === 'suppression'
    ? 'La suppression a échoué. Réessayez.'
    : 'L’enregistrement a échoué. Réessayez.'
}

function lireSaisie(formData: FormData) {
  return normaliserSaisieGrimpeur({
    nom: String(formData.get('nom') ?? ''),
    prenom: String(formData.get('prenom') ?? ''),
    anneeNaissance: String(formData.get('anneeNaissance') ?? ''),
  })
}

export async function creerGrimpeur(
  _etatPrecedent: EtatGrimpeur,
  formData: FormData,
): Promise<EtatGrimpeur> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const clubId = String(formData.get('clubId') ?? '')
  if (!clubId) return { erreur: 'Le club est obligatoire.' }

  let saisie
  try {
    saisie = lireSaisie(formData)
  } catch (e) {
    if (e instanceof GrimpeurInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase.from('grimpeur').insert({
    club_id: clubId,
    nom: saisie.nom,
    prenom: saisie.prenom,
    annee_naissance: saisie.anneeNaissance,
  })
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/grimpeurs')
  return { succes: `Grimpeur « ${saisie.prenom} ${saisie.nom} » ajouté.` }
}

export async function modifierGrimpeur(
  _etatPrecedent: EtatGrimpeur,
  formData: FormData,
): Promise<EtatGrimpeur> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Grimpeur introuvable.' }

  const clubId = String(formData.get('clubId') ?? '')
  if (!clubId) return { erreur: 'Le club est obligatoire.' }

  let saisie
  try {
    saisie = lireSaisie(formData)
  } catch (e) {
    if (e instanceof GrimpeurInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('grimpeur')
    .update({
      club_id: clubId,
      nom: saisie.nom,
      prenom: saisie.prenom,
      annee_naissance: saisie.anneeNaissance,
    })
    .eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/grimpeurs')
  return { succes: 'Grimpeur modifié.' }
}

export async function supprimerGrimpeur(
  _etatPrecedent: EtatGrimpeur,
  formData: FormData,
): Promise<EtatGrimpeur> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Grimpeur introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('grimpeur').delete().eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'suppression') }

  revalidatePath('/admin/grimpeurs')
  return { succes: 'Grimpeur supprimé.' }
}
