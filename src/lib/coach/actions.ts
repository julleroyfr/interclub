'use server'

import { revalidatePath } from 'next/cache'

import type { Categorie, Phase } from '@/domaine/rencontre'
import {
  EngagementInvalideError,
  GROUPES_DEPART,
  normaliserNomEquipe,
  verifierAjoutComposition,
} from '@/domaine/engagement'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/** Client Supabase du projet (schéma `interclub`). */
type Client = Awaited<ReturnType<typeof createClient>>

// Écriture de l'engagement d'un club en rencontre (spec #5 « Espace Coach ») :
// CRUD équipes (R10), composition (R12/R13/R14/R15) et groupe de départ (R19).
// Chaque action revérifie le rôle coach et le gating de phase ① (gel R16), la
// RLS T6 restant la frontière ultime. Réservé au coach permanent (rattaché à un
// club) : le coach temporaire ne modifie pas l'engagement (gel, spec #1 R27).

export type EtatEngagement = { erreur?: string; succes?: string } | undefined

/** Vérifie le rôle coach et renvoie son club, ou un état d'erreur. */
async function exigerCoachClub(): Promise<
  { clubId: string } | { erreur: string }
> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'coach' || !utilisateur.clubId) {
    return { erreur: 'Action réservée à un coach rattaché à un club.' }
  }
  return { clubId: utilisateur.clubId }
}

/** Charge la phase et la catégorie d'une rencontre. */
async function chargerRencontre(
  supabase: Client,
  rencontreId: string,
): Promise<{ phase: Phase; categorie: Categorie } | null> {
  const { data } = await supabase
    .from('rencontre')
    .select('phase, categorie')
    .eq('id', rencontreId)
    .maybeSingle()
  if (!data) return null
  return { phase: data.phase as Phase, categorie: data.categorie as Categorie }
}

/** Phases où l'engagement est éditable par un coach (R16) : pré-compétition + préparation. */
function estEditable(phase: Phase): boolean {
  return phase === 'pre_competition' || phase === 'preparation'
}

/**
 * Refuse l'édition hors des phases d'engagement (pré-compétition, préparation) :
 * l'engagement est figé dès la compétition (R16). Renvoie un état d'erreur, ou
 * `null` si l'édition est permise.
 */
function refuserSiPasEditable(phase: Phase): EtatEngagement | null {
  if (!estEditable(phase)) {
    return {
      erreur:
        "L'engagement n'est modifiable qu'avant le lancement de la compétition (pré-compétition ou préparation) ; il est ensuite figé (seul l'admin peut corriger, R16).",
    }
  }
  return null
}

/** Vérifie qu'une équipe appartient bien au club du coach (défense en profondeur). */
async function equipeDuClub(
  supabase: Client,
  equipeId: string,
  clubId: string,
): Promise<{ rencontreId: string } | null> {
  const { data } = await supabase
    .from('equipe')
    .select('rencontre_id, club_id')
    .eq('id', equipeId)
    .maybeSingle()
  if (!data || (data.club_id as string) !== clubId) return null
  return { rencontreId: data.rencontre_id as string }
}

/** Crée une équipe du club pour une rencontre (R10). */
export async function creerEquipe(
  _etat: EtatEngagement,
  formData: FormData,
): Promise<EtatEngagement> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const rencontreId = String(formData.get('rencontreId') ?? '')
  let nom: string
  try {
    nom = normaliserNomEquipe(String(formData.get('nom') ?? ''))
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const rencontre = await chargerRencontre(supabase, rencontreId)
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  const refus = refuserSiPasEditable(rencontre.phase)
  if (refus) return refus

  const { error } = await supabase
    .from('equipe')
    .insert({ rencontre_id: rencontreId, club_id: coach.clubId, nom })
  if (error) {
    if (error.code === '23505') return { erreur: `Une équipe « ${nom} » existe déjà.` }
    return { erreur: "La création a échoué. Réessayez." }
  }

  revalidatePath(`/coach/rencontres/${rencontreId}`)
  return { succes: 'Équipe créée.' }
}

/** Renomme une équipe du club (R10). */
export async function renommerEquipe(
  _etat: EtatEngagement,
  formData: FormData,
): Promise<EtatEngagement> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const equipeId = String(formData.get('equipeId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  let nom: string
  try {
    nom = normaliserNomEquipe(String(formData.get('nom') ?? ''))
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const appartenance = await equipeDuClub(supabase, equipeId, coach.clubId)
  if (!appartenance) return { erreur: 'Équipe introuvable.' }
  const rencontre = await chargerRencontre(supabase, appartenance.rencontreId)
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  const refus = refuserSiPasEditable(rencontre.phase)
  if (refus) return refus

  const { error } = await supabase.from('equipe').update({ nom }).eq('id', equipeId)
  if (error) {
    if (error.code === '23505') return { erreur: `Une équipe « ${nom} » existe déjà.` }
    return { erreur: 'Le renommage a échoué. Réessayez.' }
  }

  revalidatePath(`/coach/rencontres/${rencontreId}`)
  return { succes: 'Équipe renommée.' }
}

/** Supprime une équipe du club (R10). */
export async function supprimerEquipe(
  _etat: EtatEngagement,
  formData: FormData,
): Promise<EtatEngagement> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const equipeId = String(formData.get('equipeId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')

  const supabase = await createClient()
  const appartenance = await equipeDuClub(supabase, equipeId, coach.clubId)
  if (!appartenance) return { erreur: 'Équipe introuvable.' }
  const rencontre = await chargerRencontre(supabase, appartenance.rencontreId)
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  const refus = refuserSiPasEditable(rencontre.phase)
  if (refus) return refus

  const { error } = await supabase.from('equipe').delete().eq('id', equipeId)
  if (error) return { erreur: 'La suppression a échoué. Réessayez.' }

  revalidatePath(`/coach/rencontres/${rencontreId}`)
  return { succes: 'Équipe supprimée.' }
}

/** Valide un groupe de départ saisi ; chaîne vide → null (R19). */
function lireGroupeDepart(
  formData: FormData,
  categorie: Categorie,
): string | null {
  const brut = String(formData.get('groupeDepart') ?? '').trim()
  if (brut === '') return null
  if (categorie !== 'enfant') {
    throw new EngagementInvalideError(
      'Le groupe de départ ne concerne que les rencontres enfant (R19).',
    )
  }
  if (!(GROUPES_DEPART as readonly string[]).includes(brut)) {
    throw new EngagementInvalideError(
      `Groupe de départ invalide : « ${brut} ». Valeurs : ${GROUPES_DEPART.join(', ')} (R19).`,
    )
  }
  return brut
}

/** Ajoute un grimpeur du club à une équipe (R12/R13/R14/R15), groupe optionnel (R19). */
export async function ajouterGrimpeurEquipe(
  _etat: EtatEngagement,
  formData: FormData,
): Promise<EtatEngagement> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const equipeId = String(formData.get('equipeId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  if (!grimpeurId) return { erreur: 'Sélectionnez un grimpeur.' }

  const supabase = await createClient()
  const appartenance = await equipeDuClub(supabase, equipeId, coach.clubId)
  if (!appartenance) return { erreur: 'Équipe introuvable.' }
  const rencontre = await chargerRencontre(supabase, appartenance.rencontreId)
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  const refus = refuserSiPasEditable(rencontre.phase)
  if (refus) return refus

  let groupeDepart: string | null
  try {
    groupeDepart = lireGroupeDepart(formData, rencontre.categorie)
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const [{ data: grimpeur }, { data: membres }, { data: engages }] = await Promise.all([
    supabase.from('grimpeur').select('club_id').eq('id', grimpeurId).maybeSingle(),
    supabase.from('composition').select('grimpeur_id').eq('equipe_id', equipeId),
    supabase.from('composition').select('grimpeur_id').eq('rencontre_id', appartenance.rencontreId),
  ])
  if (!grimpeur) {
    return { erreur: "Ce grimpeur n'appartient pas à votre club (prêt réservé à l'admin, R13)." }
  }

  try {
    verifierAjoutComposition({
      grimpeurId,
      grimpeurClubId: grimpeur.club_id as string,
      equipeClubId: coach.clubId,
      membresActuels: (membres ?? []).map((m) => m.grimpeur_id as string),
      dejaEngagesRencontre: (engages ?? []).map((e) => e.grimpeur_id as string),
    })
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const { error } = await supabase
    .from('composition')
    .insert({ equipe_id: equipeId, grimpeur_id: grimpeurId, groupe_depart: groupeDepart })
  if (error) {
    if (error.code === '23505') {
      return { erreur: 'Ce grimpeur est déjà engagé dans cette rencontre (R14).' }
    }
    return { erreur: "L'ajout a échoué. Réessayez." }
  }

  revalidatePath(`/coach/rencontres/${rencontreId}`)
  return { succes: 'Grimpeur ajouté.' }
}

/** Retire un grimpeur d'une équipe du club (R12 ; un prêté est retirable, R13/R36). */
export async function retirerGrimpeurEquipe(
  _etat: EtatEngagement,
  formData: FormData,
): Promise<EtatEngagement> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const equipeId = String(formData.get('equipeId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')

  const supabase = await createClient()
  const appartenance = await equipeDuClub(supabase, equipeId, coach.clubId)
  if (!appartenance) return { erreur: 'Équipe introuvable.' }
  const rencontre = await chargerRencontre(supabase, appartenance.rencontreId)
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  const refus = refuserSiPasEditable(rencontre.phase)
  if (refus) return refus

  const { error } = await supabase
    .from('composition')
    .delete()
    .eq('equipe_id', equipeId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: 'Le retrait a échoué. Réessayez.' }

  revalidatePath(`/coach/rencontres/${rencontreId}`)
  return { succes: 'Grimpeur retiré.' }
}

/** Fixe (ou efface) le groupe de départ d'un grimpeur engagé (R19). */
export async function definirGroupeDepart(
  _etat: EtatEngagement,
  formData: FormData,
): Promise<EtatEngagement> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const equipeId = String(formData.get('equipeId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')

  const supabase = await createClient()
  const appartenance = await equipeDuClub(supabase, equipeId, coach.clubId)
  if (!appartenance) return { erreur: 'Équipe introuvable.' }
  const rencontre = await chargerRencontre(supabase, appartenance.rencontreId)
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  const refus = refuserSiPasEditable(rencontre.phase)
  if (refus) return refus

  let groupeDepart: string | null
  try {
    groupeDepart = lireGroupeDepart(formData, rencontre.categorie)
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const { error } = await supabase
    .from('composition')
    .update({ groupe_depart: groupeDepart })
    .eq('equipe_id', equipeId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: 'La mise à jour a échoué. Réessayez.' }

  revalidatePath(`/coach/rencontres/${rencontreId}`)
  return { succes: groupeDepart ? 'Groupe de départ enregistré.' : 'Groupe de départ effacé.' }
}
