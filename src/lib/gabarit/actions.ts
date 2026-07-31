'use server'

import { revalidatePath } from 'next/cache'

import {
  NIVEAUX_MOULINETTE,
  NIVEAUX_TETE,
  NiveauVoieInvalideError,
  PointsInvalideError,
  validerNiveauVoie,
  validerPoints,
} from '@/domaine/gabarit'
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

/** Lit un champ de points obligatoire (entier ≥ 0) depuis un FormData. */
function lirePointsObligatoire(formData: FormData, nom: string): number {
  const points = Number(formData.get(nom))
  validerPoints(points)
  return points
}

/** Lit un champ de points optionnel : chaîne vide → null, sinon entier ≥ 0. */
function lirePointsOptionnel(formData: FormData, nom: string): number | null {
  const brut = String(formData.get(nom) ?? '').trim()
  if (brut === '') return null
  const points = Number(brut)
  validerPoints(points)
  return points
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

  let points: number
  let pointsPriseValorisee: number | null
  let pointsZone1: number | null
  let pointsZone2: number | null
  try {
    validerNiveauVoie(niveau, typeVoie, categorie)
    points = lirePointsObligatoire(formData, 'points')
    // Prise valorisée : enfant tête uniquement ; zones : ado uniquement (R38).
    pointsPriseValorisee =
      categorie === 'enfant' && typeVoie === 'tete'
        ? lirePointsOptionnel(formData, 'pointsPriseValorisee')
        : null
    pointsZone1 = categorie === 'ado' ? lirePointsOptionnel(formData, 'pointsZone1') : null
    pointsZone2 = categorie === 'ado' ? lirePointsOptionnel(formData, 'pointsZone2') : null
  } catch (e) {
    if (e instanceof NiveauVoieInvalideError || e instanceof PointsInvalideError) {
      return { erreur: e.message }
    }
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
    points,
    points_prise_valorisee: pointsPriseValorisee,
    points_zone1: pointsZone1,
    points_zone2: pointsZone2,
    ordre,
  })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath('/admin/gabarit')
  return { succes: 'Voie ajoutée.' }
}

/** Modifie les points d'une voie de difficulté du gabarit (R38). */
export async function modifierPointsVoieGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  const categorie = String(formData.get('categorie') ?? '') as Categorie
  const typeVoie = String(formData.get('typeVoie') ?? '') as TypeVoie
  if (!id) return { erreur: 'Voie introuvable.' }

  let maj: {
    points: number
    points_prise_valorisee: number | null
    points_zone1: number | null
    points_zone2: number | null
  }
  try {
    maj = {
      points: lirePointsObligatoire(formData, 'points'),
      points_prise_valorisee:
        categorie === 'enfant' && typeVoie === 'tete'
          ? lirePointsOptionnel(formData, 'pointsPriseValorisee')
          : null,
      points_zone1: categorie === 'ado' ? lirePointsOptionnel(formData, 'pointsZone1') : null,
      points_zone2: categorie === 'ado' ? lirePointsOptionnel(formData, 'pointsZone2') : null,
    }
  } catch (e) {
    if (e instanceof PointsInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase.from('gabarit_voie_difficulte').update(maj).eq('id', id)
  if (error) return { erreur: 'La mise à jour a échoué. Réessayez.' }

  revalidatePath('/admin/gabarit')
  return { succes: 'Points mis à jour.' }
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

/** Ajoute un bloc au gabarit d'une catégorie (R31). */
export async function ajouterBlocGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const gabaritEpreuveId = String(formData.get('gabaritEpreuveId') ?? '')
  const code = String(formData.get('code') ?? '').trim()

  if (!gabaritEpreuveId) return { erreur: 'Épreuve gabarit introuvable.' }
  if (!code) return { erreur: 'Le code du bloc est obligatoire.' }

  const supabase = await createClient()

  const { data: dernier } = await supabase
    .from('gabarit_bloc')
    .select('ordre')
    .eq('gabarit_epreuve_id', gabaritEpreuveId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single()

  const ordre = ((dernier?.ordre as number | null) ?? 0) + 1

  const { error } = await supabase.from('gabarit_bloc').insert({
    gabarit_epreuve_id: gabaritEpreuveId,
    code,
    ordre,
  })
  if (error) {
    if (error.code === '23505') return { erreur: `Le bloc « ${code} » existe déjà.` }
    return { erreur: "L'ajout a échoué. Réessayez." }
  }

  revalidatePath('/admin/gabarit')
  return { succes: 'Bloc ajouté.' }
}

/** Supprime un bloc du gabarit (R31). */
export async function supprimerBlocGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Bloc introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('gabarit_bloc').delete().eq('id', id)
  if (error) return { erreur: 'La suppression a échoué. Réessayez.' }

  revalidatePath('/admin/gabarit')
  return { succes: 'Bloc supprimé.' }
}

/** Ajoute un palier de points à un bloc du gabarit (R39). */
export async function ajouterPalierBlocGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const gabaritBlocId = String(formData.get('gabaritBlocId') ?? '')
  const libelle = String(formData.get('libelle') ?? '').trim()

  if (!gabaritBlocId) return { erreur: 'Bloc introuvable.' }
  if (!libelle) return { erreur: 'Le libellé du palier est obligatoire.' }

  let points: number
  try {
    points = lirePointsObligatoire(formData, 'points')
  } catch (e) {
    if (e instanceof PointsInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()

  const { data: dernier } = await supabase
    .from('gabarit_bloc_palier')
    .select('ordre')
    .eq('gabarit_bloc_id', gabaritBlocId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single()

  const ordre = ((dernier?.ordre as number | null) ?? 0) + 1

  const { error } = await supabase.from('gabarit_bloc_palier').insert({
    gabarit_bloc_id: gabaritBlocId,
    libelle,
    points,
    ordre,
  })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath('/admin/gabarit')
  return { succes: 'Palier ajouté.' }
}

/** Supprime un palier de points d'un bloc du gabarit (R39). */
export async function supprimerPalierBlocGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Palier introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('gabarit_bloc_palier').delete().eq('id', id)
  if (error) return { erreur: 'La suppression a échoué. Réessayez.' }

  revalidatePath('/admin/gabarit')
  return { succes: 'Palier supprimé.' }
}

/** Ajoute une voie de vitesse au gabarit (libellé libre, R31/R32). */
export async function ajouterVoieVitesseGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const gabaritEpreuveId = String(formData.get('gabaritEpreuveId') ?? '')
  const libelle = String(formData.get('libelle') ?? '').trim()

  if (!gabaritEpreuveId) return { erreur: 'Épreuve gabarit introuvable.' }
  if (!libelle) return { erreur: 'Le libellé de la voie de vitesse est obligatoire.' }

  const supabase = await createClient()

  const { data: derniere } = await supabase
    .from('gabarit_voie_vitesse')
    .select('ordre')
    .eq('gabarit_epreuve_id', gabaritEpreuveId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single()

  const ordre = ((derniere?.ordre as number | null) ?? 0) + 1

  const { error } = await supabase.from('gabarit_voie_vitesse').insert({
    gabarit_epreuve_id: gabaritEpreuveId,
    libelle,
    ordre,
  })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath('/admin/gabarit')
  return { succes: 'Voie de vitesse ajoutée.' }
}

/** Supprime une voie de vitesse du gabarit (R31). */
export async function supprimerVoieVitesseGabarit(
  _etat: EtatGabarit,
  formData: FormData,
): Promise<EtatGabarit> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Voie de vitesse introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('gabarit_voie_vitesse').delete().eq('id', id)
  if (error) return { erreur: 'La suppression a échoué. Réessayez.' }

  revalidatePath('/admin/gabarit')
  return { succes: 'Voie de vitesse supprimée.' }
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
