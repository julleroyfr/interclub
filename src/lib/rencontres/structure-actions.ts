'use server'

import { revalidatePath } from 'next/cache'

import {
  NiveauVoieInvalideError,
  PointsInvalideError,
  champsPointsVoie,
  validerNiveauVoie,
  validerPoints,
} from '@/domaine/gabarit'
import type { TypeEpreuve, TypeVoie } from '@/domaine/gabarit'
import type { Categorie } from '@/domaine/rencontre'
import { BaremeVitesseInvalideError, type EchelonBareme } from '@/domaine/vitesse'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { lireEchelonsSoumis } from '@/lib/bareme-vitesse'
import { createClient } from '@/lib/supabase/server'

/** Client Supabase du projet (schéma `interclub`), tel que renvoyé par `createClient`. */
type Client = Awaited<ReturnType<typeof createClient>>

// Configuration de la structure d'une rencontre (R36) : ajout de voies de
// difficulté, blocs et voies de vitesse — uniquement par l'admin et uniquement
// en phase pré-compétition. Aucune édition/suppression (hors périmètre).

export type EtatStructure = { erreur?: string; succes?: string } | undefined

/** Lit un champ de points obligatoire (entier ≥ 0). */
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

async function refuserSiNonAdmin(): Promise<EtatStructure | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut configurer une rencontre.' }
  }
  return null
}

/**
 * Vérifie que la rencontre est en phase pré-compétition (R36). Renvoie un état
 * d'erreur si non, sinon `null`.
 */
async function refuserSiPasPreCompetition(
  supabase: Client,
  rencontreId: string,
): Promise<EtatStructure | null> {
  const { data: rencontre } = await supabase
    .from('rencontre')
    .select('phase')
    .eq('id', rencontreId)
    .maybeSingle()

  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  if (rencontre.phase !== 'pre_competition') {
    return { erreur: "La structure ne peut être modifiée qu'en phase pré-compétition (R36)." }
  }
  return null
}

/** Prochain `ordre` pour une colonne enfant d'un parent donné. */
async function prochainOrdre(
  supabase: Client,
  table: string,
  colonneParent: string,
  parentId: string,
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select('ordre')
    .eq(colonneParent, parentId)
    .order('ordre', { ascending: false })
    .limit(1)
    .maybeSingle()
  return ((data?.ordre as number | null) ?? 0) + 1
}

/**
 * Crée une épreuve d'un type donné dans une rencontre si aucune n'existe déjà
 * (R36). Utile pour les rencontres créées sur gabarit vide (R35).
 */
export async function ajouterEpreuveRencontre(
  _etat: EtatStructure,
  formData: FormData,
): Promise<EtatStructure> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const type = String(formData.get('type') ?? '') as TypeEpreuve
  if (!['voie', 'bloc', 'vitesse'].includes(type)) return { erreur: 'Type d’épreuve invalide.' }

  const supabase = await createClient()
  const refusPhase = await refuserSiPasPreCompetition(supabase, rencontreId)
  if (refusPhase) return refusPhase

  const { data: existante } = await supabase
    .from('epreuve')
    .select('id')
    .eq('rencontre_id', rencontreId)
    .eq('type', type)
    .maybeSingle()
  if (existante) return { erreur: 'Cette épreuve existe déjà.' }

  const { error } = await supabase
    .from('epreuve')
    .insert({ rencontre_id: rencontreId, type })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return { succes: 'Épreuve ajoutée.' }
}

/** Ajoute une voie de difficulté (avec ses points) à une rencontre (R36, R38). */
export async function ajouterVoieDifficulteRencontre(
  _etat: EtatStructure,
  formData: FormData,
): Promise<EtatStructure> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const epreuveId = String(formData.get('epreuveId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  const niveau = String(formData.get('niveau') ?? '').trim()
  const typeVoie = String(formData.get('typeVoie') ?? '') as TypeVoie
  const cotation = String(formData.get('cotation') ?? '').trim()
  const categorie = String(formData.get('categorie') ?? '') as Categorie

  if (!epreuveId) return { erreur: 'Épreuve introuvable.' }
  if (!cotation) return { erreur: 'La cotation est obligatoire.' }

  let points: number
  let pointsPriseValorisee: number | null
  let pointsZone1: number | null
  let pointsZone2: number | null
  try {
    validerNiveauVoie(niveau, typeVoie, categorie)
    points = lirePointsObligatoire(formData, 'points')
    const champs = champsPointsVoie(categorie, typeVoie)
    pointsPriseValorisee = champs.priseValorisee
      ? lirePointsOptionnel(formData, 'pointsPriseValorisee')
      : null
    pointsZone1 = champs.zones ? lirePointsOptionnel(formData, 'pointsZone1') : null
    pointsZone2 = champs.zones ? lirePointsOptionnel(formData, 'pointsZone2') : null
  } catch (e) {
    if (e instanceof NiveauVoieInvalideError || e instanceof PointsInvalideError) {
      return { erreur: e.message }
    }
    throw e
  }

  const supabase = await createClient()
  const refusPhase = await refuserSiPasPreCompetition(supabase, rencontreId)
  if (refusPhase) return refusPhase

  const ordre = await prochainOrdre(supabase, 'voie_difficulte', 'epreuve_id', epreuveId)

  const { error } = await supabase.from('voie_difficulte').insert({
    epreuve_id: epreuveId,
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

  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return { succes: 'Voie ajoutée.' }
}

/** Ajoute un bloc à une rencontre (R36). */
export async function ajouterBlocRencontre(
  _etat: EtatStructure,
  formData: FormData,
): Promise<EtatStructure> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const epreuveId = String(formData.get('epreuveId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  const code = String(formData.get('code') ?? '').trim()

  if (!epreuveId) return { erreur: 'Épreuve introuvable.' }
  if (!code) return { erreur: 'Le code du bloc est obligatoire.' }

  const supabase = await createClient()
  const refusPhase = await refuserSiPasPreCompetition(supabase, rencontreId)
  if (refusPhase) return refusPhase

  const ordre = await prochainOrdre(supabase, 'bloc', 'epreuve_id', epreuveId)

  const { error } = await supabase
    .from('bloc')
    .insert({ epreuve_id: epreuveId, code, ordre })
  if (error) {
    if (error.code === '23505') return { erreur: `Le bloc « ${code} » existe déjà.` }
    return { erreur: "L'ajout a échoué. Réessayez." }
  }

  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return { succes: 'Bloc ajouté.' }
}

/** Ajoute une voie de vitesse à une rencontre (libellé libre, R36, R32). */
export async function ajouterVoieVitesseRencontre(
  _etat: EtatStructure,
  formData: FormData,
): Promise<EtatStructure> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const libelle = String(formData.get('libelle') ?? '').trim()

  if (!libelle) return { erreur: 'Le libellé de la voie de vitesse est obligatoire.' }

  const supabase = await createClient()
  const refusPhase = await refuserSiPasPreCompetition(supabase, rencontreId)
  if (refusPhase) return refusPhase

  const { data: derniere } = await supabase
    .from('voie_vitesse')
    .select('numero')
    .eq('rencontre_id', rencontreId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  const numero = ((derniere?.numero as number | null) ?? 0) + 1

  const { error } = await supabase
    .from('voie_vitesse')
    .insert({ rencontre_id: rencontreId, numero, libelle })
  if (error) return { erreur: "L'ajout a échoué. Réessayez." }

  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return { succes: 'Voie de vitesse ajoutée.' }
}

/**
 * Met à jour le barème de vitesse d'une rencontre (spec #3 R46/R47/R48) : points
 * fixes de chute / non-présentation (sur l'épreuve) et le **jeu complet d'échelons**
 * — rangs, points, décrément, ajout/suppression. Le jeu soumis est **validé** (R48)
 * avant écriture ; en cas de violation, rien n'est modifié et un message précis est
 * renvoyé. L'écriture **remplace** l'ensemble des échelons (R47). Réservé à l'admin
 * et à la phase pré-competition (R44) — donc avant toute saisie de temps : aucun
 * `points_vitesse` dérivé à préserver.
 */
export async function mettreAJourBaremeVitesse(
  _etat: EtatStructure,
  formData: FormData,
): Promise<EtatStructure> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const epreuveId = String(formData.get('epreuveId') ?? '')
  if (!epreuveId) return { erreur: 'Épreuve de vitesse introuvable.' }

  let pointsChute: number
  let pointsNonPresentation: number
  let echelons: EchelonBareme[]
  try {
    pointsChute = lirePointsObligatoire(formData, 'pointsChute')
    pointsNonPresentation = lirePointsObligatoire(formData, 'pointsNonPresentation')
    echelons = lireEchelonsSoumis(formData)
  } catch (e) {
    if (e instanceof PointsInvalideError || e instanceof BaremeVitesseInvalideError) {
      return { erreur: e.message }
    }
    throw e
  }

  const supabase = await createClient()
  const refusPhase = await refuserSiPasPreCompetition(supabase, rencontreId)
  if (refusPhase) return refusPhase

  const { error: errEp } = await supabase
    .from('epreuve')
    .update({
      points_chute: pointsChute,
      points_non_presentation: pointsNonPresentation,
    })
    .eq('id', epreuveId)
  if (errEp) return { erreur: 'La mise à jour du barème a échoué. Réessayez.' }

  // Remplacement du jeu d'échelons (R47) : suppression puis insertion du set validé.
  // Édition possible seulement en pré-compétition, avant toute saisie de temps : pas
  // de `points_vitesse` matérialisé à préserver, la fenêtre delete→insert est sûre.
  const { error: errDel } = await supabase
    .from('bareme_vitesse_echelon')
    .delete()
    .eq('epreuve_id', epreuveId)
  if (errDel) return { erreur: 'La mise à jour du barème a échoué. Réessayez.' }

  const lignes = echelons.map((e, i) => ({
    epreuve_id: epreuveId,
    rang_min: e.rangMin,
    rang_max: e.rangMax,
    points: e.points,
    decrement: e.decrement,
    ordre: i + 1,
  }))
  const { error: errIns } = await supabase.from('bareme_vitesse_echelon').insert(lignes)
  if (errIns) return { erreur: 'La mise à jour du barème a échoué. Réessayez.' }

  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return { succes: 'Barème de vitesse mis à jour.' }
}
