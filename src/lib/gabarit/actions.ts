'use server'

import { revalidatePath } from 'next/cache'

import { NIVEAUX_MOULINETTE, NIVEAUX_TETE, NiveauVoieInvalideError, validerNiveauVoie } from '@/domaine/gabarit'
import type { TypeVoie } from '@/domaine/gabarit'
import type { Categorie } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type EtatGabarit = { erreur?: string; succes?: string } | undefined

async function refuserSiNonAdmin(): Promise<EtatGabarit | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut modifier le gabarit.' }
  }
  return null
}

/** Ajoute une voie de difficulté dans le gabarit d'une catégorie (R31). */
export async function ajouterVoieDifficulteGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const gabaritEpreuveId = String(formData.get('gabaritEpreuveId') ?? '')
  const niveau = String(formData.get('niveau') ?? '').trim()
  const typeVoie = String(formData.get('typeVoie') ?? '') as TypeVoie
  const cotation = String(formData.get('cotation') ?? '').trim()
  const categorie = String(formData.get('categorie') ?? '') as Categorie

  if (!gabaritEpreuveId) return { erreur: 'Épreuve gabarit introuvable.' }
  if (!cotation) return { erreur: 'La cotation est obligatoire.' }

  try {
    validerNiveauVoie(niveau, typeVoie, categorie)
  } catch (e) {
    if (e instanceof NiveauVoieInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()

  // Calcul du prochain ordre
  const { data: derniere } = await supabase
    .from('gabarit_voie_difficulte')
    .select('ordre')
    .eq('gabarit_epreuve_id', gabaritEpreuveId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single()

  const ordre = ((derniere?.ordre as number | null) ?? 0) + 1

  const { error } = await supabase.from('gabarit_voie_difficulte').insert({
    gabarit_epreuve_id: gabaritEpreuveId,
    niveau,
    type_voie: typeVoie,
    cotation,
    ordre,
  })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath('/admin/gabarit')
  return { succes: 'Voie ajoutée.' }
}

/** Supprime une voie de difficulté du gabarit (R31). */
export async function supprimerVoieDifficulteGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Voie introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('gabarit_voie_difficulte').delete().eq('id', id)
  if (error) return { erreur: 'La suppression a échoué. Réessayez.' }

  revalidatePath('/admin/gabarit')
  return { succes: 'Voie supprimée.' }
}

/** Ajoute une voie de difficulté à une rencontre existante en phase pré-compétition (R36). */
export async function ajouterVoieDifficulteRencontre(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const epreuveId = String(formData.get('epreuveId') ?? '')
  const niveau = String(formData.get('niveau') ?? '').trim()
  const typeVoie = String(formData.get('typeVoie') ?? '') as TypeVoie
  const cotation = String(formData.get('cotation') ?? '').trim()
  const categorie = String(formData.get('categorie') ?? '') as Categorie
  const rencontreId = String(formData.get('rencontreId') ?? '')

  if (!epreuveId) return { erreur: 'Épreuve introuvable.' }
  if (!cotation) return { erreur: 'La cotation est obligatoire.' }

  try {
    validerNiveauVoie(niveau, typeVoie, categorie)
  } catch (e) {
    if (e instanceof NiveauVoieInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()

  // Vérifier que la rencontre est en phase pré-compétition (R36)
  const { data: rencontre } = await supabase
    .from('rencontre')
    .select('phase')
    .eq('id', rencontreId)
    .single()

  if (rencontre?.phase !== 'pre_competition') {
    return { erreur: "La structure ne peut être modifiée qu'en phase pré-compétition (R36)." }
  }

  const { data: derniere } = await supabase
    .from('voie_difficulte')
    .select('ordre')
    .eq('epreuve_id', epreuveId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single()

  const ordre = ((derniere?.ordre as number | null) ?? 0) + 1

  const { error } = await supabase.from('voie_difficulte').insert({
    epreuve_id: epreuveId,
    niveau,
    type_voie: typeVoie,
    cotation,
    ordre,
  })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return { succes: 'Voie ajoutée.' }
}

export { NIVEAUX_MOULINETTE, NIVEAUX_TETE }
