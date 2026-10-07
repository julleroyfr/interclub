'use server'

import { revalidatePath } from 'next/cache'

import {
  EngagementInvalideError,
  GROUPES_DEPART,
  MESSAGE_CHANGEMENT_HORS_CLUB,
  normaliserNomEquipe,
  verifierAjoutComposition,
  verifierChangementEquipe,
} from '@/domaine/engagement'
import { anneeSaison, estEligibleCategorie, type Categorie } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { mesurer } from '@/lib/perf/mesure'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

// CRUD admin de l'engagement (équipes + compositions) de TOUS les clubs d'une
// rencontre (spec #1 R10 : tous droits ; R6 : l'admin corrige en toute phase).
// Garde admin explicite ; la vraie frontière reste la RLS (`est_admin()`).

export type EtatAdminEngagement = { erreur?: string; succes?: string } | undefined

async function exigerAdmin(): Promise<EtatAdminEngagement | null> {
  const u = await getUtilisateurCourant()
  if (u?.role !== 'admin') return { erreur: 'Action réservée à un administrateur.' }
  return null
}

function revalider(rencontreId: string) {
  revalidatePath(`/admin/rencontres/${rencontreId}`)
}

/** Crée une équipe pour un club donné (admin, R10). */
export async function creerEquipeAdmin(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const clubId = String(formData.get('clubId') ?? '')
  if (!clubId) return { erreur: 'Club manquant.' }

  let nom: string
  try {
    nom = normaliserNomEquipe(String(formData.get('nom') ?? ''))
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await mesurer('action creerEquipe insert', () =>
    supabase.from('equipe').insert({ rencontre_id: rencontreId, club_id: clubId, nom }),
  )
  if (error) {
    if (error.code === '23505') return { erreur: `Une équipe « ${nom} » existe déjà pour ce club.` }
    return { erreur: 'La création a échoué. Réessayez.' }
  }
  revalider(rencontreId)
  return { succes: 'Équipe créée.' }
}

/** Supprime une équipe (admin, R10). */
export async function supprimerEquipeAdmin(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const equipeId = String(formData.get('equipeId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.from('equipe').delete().eq('id', equipeId)
  if (error) return { erreur: 'La suppression a échoué. Réessayez.' }
  revalider(rencontreId)
  return { succes: 'Équipe supprimée.' }
}

/** Ajoute un grimpeur à une équipe (admin, R10/R35 : cross-club autorisé). */
export async function ajouterGrimpeurAdmin(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const equipeId = String(formData.get('equipeId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const groupeBrut = String(formData.get('groupeDepart') ?? '').trim()
  if (!grimpeurId) return { erreur: 'Sélectionnez un grimpeur.' }
  if (groupeBrut && !GROUPES_DEPART.includes(groupeBrut as (typeof GROUPES_DEPART)[number])) {
    return { erreur: 'Groupe de départ invalide.' }
  }

  const supabase = await createClient()
  const [{ data: equipe }, { data: rencontre }, { data: grimpeur }, { data: membres }, { data: engages }] =
    await Promise.all([
      supabase.from('equipe').select('club_id, rencontre_id').eq('id', equipeId).maybeSingle(),
      supabase.from('rencontre').select('categorie, date_rencontre').eq('id', rencontreId).maybeSingle(),
      supabase.from('grimpeur').select('club_id, annee_naissance').eq('id', grimpeurId).maybeSingle(),
      supabase.from('composition').select('grimpeur_id').eq('equipe_id', equipeId),
      supabase.from('composition').select('grimpeur_id').eq('rencontre_id', rencontreId),
    ])
  if (!equipe) return { erreur: 'Équipe introuvable.' }
  if (!rencontre) return { erreur: 'Rencontre introuvable.' }
  if (!grimpeur) return { erreur: 'Grimpeur introuvable.' }

  if (
    !estEligibleCategorie(
      grimpeur.annee_naissance as number,
      rencontre.categorie as Categorie,
      anneeSaison(rencontre.date_rencontre as string),
    )
  ) {
    return { erreur: "Ce grimpeur n'est pas dans la tranche d'âge de la rencontre." }
  }

  try {
    verifierAjoutComposition({
      grimpeurId,
      grimpeurClubId: grimpeur.club_id as string,
      equipeClubId: equipe.club_id as string,
      // L'admin peut engager un grimpeur d'un autre club (R35/R10) : on lève la
      // restriction de club, mais R14 (double) et R15 (plafond) restent.
      estPrete: true,
      membresActuels: (membres ?? []).map((m) => m.grimpeur_id as string),
      dejaEngagesRencontre: (engages ?? []).map((e) => e.grimpeur_id as string),
    })
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const { error } = await supabase
    .from('composition')
    .insert({ equipe_id: equipeId, grimpeur_id: grimpeurId, groupe_depart: groupeBrut || null })
  if (error) {
    if (error.code === '23505') {
      return { erreur: 'Ce grimpeur est déjà engagé dans cette rencontre.' }
    }
    return { erreur: "L'ajout a échoué. Réessayez." }
  }
  revalider(rencontreId)
  return { succes: 'Grimpeur ajouté.' }
}

/** Retire un grimpeur d'une équipe (admin, R10). */
export async function retirerGrimpeurAdmin(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const equipeId = String(formData.get('equipeId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase
    .from('composition')
    .delete()
    .eq('equipe_id', equipeId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: 'Le retrait a échoué. Réessayez.' }
  revalider(rencontreId)
  return { succes: 'Grimpeur retiré.' }
}

/** Définit le groupe de départ d'un membre (admin, R10 ; rencontres enfant, R19). */
export async function definirGroupeAdmin(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const equipeId = String(formData.get('equipeId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  const groupeBrut = String(formData.get('groupeDepart') ?? '').trim()
  if (groupeBrut && !GROUPES_DEPART.includes(groupeBrut as (typeof GROUPES_DEPART)[number])) {
    return { erreur: 'Groupe de départ invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('composition')
    .update({ groupe_depart: groupeBrut || null })
    .eq('equipe_id', equipeId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: 'La mise à jour a échoué. Réessayez.' }
  revalider(rencontreId)
  return { succes: 'Groupe de départ défini.' }
}

/**
 * Change un grimpeur d'équipe (admin, spec #3 R41d) : vers une autre équipe du
 * club d'affectation (club de l'équipe actuelle — club d'accueil d'un prêté),
 * dans la même rencontre, plafond de l'équipe cible respecté (spec #5 R15).
 * C'est une MISE À JOUR de `composition.equipe_id`, pas un retrait + ajout : le
 * grimpeur reste engagé et garde son groupe de départ et tous ses résultats
 * (spec #10 R18bis). La base refuse aussi un changement hors club ou hors
 * rencontre (trigger `verifier_changement_equipe`).
 */
export async function changerEquipeAdmin(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const rencontreId = String(formData.get('rencontreId') ?? '')
  const equipeId = String(formData.get('equipeId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const equipeCibleId = String(formData.get('equipeCibleId') ?? '')
  if (!equipeId || !grimpeurId || !equipeCibleId) {
    return { erreur: 'Choisissez l’équipe de destination.' }
  }

  const supabase = await createClient()
  const [equipes, membresCible] = await Promise.all([
    supabase.from('equipe').select('id, club_id, rencontre_id').in('id', [equipeId, equipeCibleId]),
    supabase.from('composition').select('grimpeur_id').eq('equipe_id', equipeCibleId),
  ])
  const lignes = verifierLecture(equipes, 'des équipes') ?? []
  const source = lignes.find((e) => e.id === equipeId)
  const cible = lignes.find((e) => e.id === equipeCibleId)
  if (!source || !cible) return { erreur: 'Équipe introuvable.' }

  try {
    verifierChangementEquipe({
      equipeSource: {
        id: source.id as string,
        clubId: source.club_id as string,
        rencontreId: source.rencontre_id as string,
      },
      equipeCible: {
        id: cible.id as string,
        clubId: cible.club_id as string,
        rencontreId: cible.rencontre_id as string,
        effectif: (verifierLecture(membresCible, "des membres de l'équipe cible") ?? []).length,
      },
    })
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const { data: maj, error } = await supabase
    .from('composition')
    .update({ equipe_id: equipeCibleId })
    .eq('equipe_id', equipeId)
    .eq('grimpeur_id', grimpeurId)
    .select('grimpeur_id')
  if (error?.message === 'changement_equipe_hors_club') {
    return { erreur: MESSAGE_CHANGEMENT_HORS_CLUB }
  }
  if (error || !maj?.length) return { erreur: 'Le changement d’équipe a échoué. Réessayez.' }
  revalider(rencontreId)
  return { succes: 'Grimpeur changé d’équipe.' }
}
