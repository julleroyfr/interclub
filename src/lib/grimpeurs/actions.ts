'use server'

import { revalidatePath } from 'next/cache'

import {
  GrimpeurInvalideError,
  normaliserAjoutGrimpeur,
  normaliserSaisieGrimpeur,
} from '@/domaine/grimpeur'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { type EtatGrimpeur } from './grimpeurs'

// CRUD du roster de grimpeurs (spec #1 R18 : coach de son club ; R11/R13 :
// parametrage admin). Cet ecran est le volet **admin** (gere tout club) ; on
// garde donc l'acces a l'admin. Server Actions : joignables par POST direct, on
// ne se fie pas a l'UI. Defense en profondeur : garde admin explicite + la vraie
// frontiere reste la **RLS** (policies `grimpeur_*`, qui admettent aussi le
// coach du club -- hors perimetre de cet ecran admin).

/** Refuse l'appelant non-admin, ou `null` si admin. */
async function refuserSiNonAdmin(): Promise<EtatGrimpeur | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut gérer le roster ici.' }
  }
  return null
}

type Contexte = 'ecriture' | 'suppression'

/** Traduit une erreur Postgres/PostgREST en message lisible. */
function messageErreur(
  code: string | undefined,
  contexte: Contexte,
  message?: string,
): string {
  if (code === '23503') {
    return contexte === 'suppression'
      ? 'Ce grimpeur est référencé : suppression impossible.'
      : 'Le club est introuvable.'
  }
  if (code === '23505') {
    return 'Ce numéro de licence est déjà utilisé par un autre grimpeur.'
  }
  // Erreurs levées par la RPC d'ajout avec licence générée (spec #3 R21d).
  if (message?.includes('plage_licences_epuisee')) {
    return 'Plus aucune licence générée disponible. Saisissez un numéro de licence.'
  }
  if (message?.includes('club_introuvable')) return 'Le club est introuvable.'
  if (message?.includes('acces_refuse')) {
    return 'Seul un administrateur peut gérer le roster ici.'
  }
  return contexte === 'suppression'
    ? 'La suppression a échoué. Réessayez.'
    : "L'enregistrement a échoué. Réessayez."
}

function lireChamps(formData: FormData) {
  return {
    nom: String(formData.get('nom') ?? ''),
    prenom: String(formData.get('prenom') ?? ''),
    anneeNaissance: String(formData.get('anneeNaissance') ?? ''),
    sexe: String(formData.get('sexe') ?? ''),
    licence: String(formData.get('licence') ?? ''),
  }
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
    saisie = normaliserAjoutGrimpeur(lireChamps(formData))
  } catch (e) {
    if (e instanceof GrimpeurInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()

  // Licence vide : la RPC attribue une licence générée sous le verrou de
  // l'import CSV (spec #3 R21d, spec #18 R14).
  if (saisie.licence === null) {
    const { data, error } = await supabase.rpc('creer_grimpeur_licence_generee', {
      p_club_id: clubId,
      p_nom: saisie.nom,
      p_prenom: saisie.prenom,
      p_annee_naissance: saisie.anneeNaissance,
      p_sexe: saisie.sexe,
    })
    if (error) return { erreur: messageErreur(error.code, 'ecriture', error.message) }

    revalidatePath('/admin/grimpeurs')
    return {
      succes: `Grimpeur « ${saisie.prenom} ${saisie.nom} » ajouté avec la licence générée ${data}.`,
    }
  }

  const { error } = await supabase.from('grimpeur').insert({
    club_id: clubId,
    nom: saisie.nom,
    prenom: saisie.prenom,
    annee_naissance: saisie.anneeNaissance,
    sexe: saisie.sexe,
    licence: saisie.licence,
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

  const supabase = await createClient()
  // Licence actuelle lue en base (pas depuis le formulaire) : seule une licence
  // générée déjà portée peut être conservée (spec #3 R21c).
  const { data: actuel } = await supabase
    .from('grimpeur')
    .select('licence')
    .eq('id', id)
    .maybeSingle()
  if (!actuel) return { erreur: 'Grimpeur introuvable.' }

  let saisie
  try {
    // `actuel.licence` : licence générée que la modification peut conserver
    // (spec #3 R21c).
    saisie = normaliserSaisieGrimpeur(lireChamps(formData), actuel.licence as number)
  } catch (e) {
    if (e instanceof GrimpeurInvalideError) return { erreur: e.message }
    throw e
  }

  const { error } = await supabase
    .from('grimpeur')
    .update({
      club_id: clubId,
      nom: saisie.nom,
      prenom: saisie.prenom,
      annee_naissance: saisie.anneeNaissance,
      sexe: saisie.sexe,
      licence: saisie.licence,
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
