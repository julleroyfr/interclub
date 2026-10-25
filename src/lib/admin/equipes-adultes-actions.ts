'use server'

import { revalidatePath } from 'next/cache'

import {
  EFFECTIF_EQUIPE_ADULTE_MAX,
  EngagementInvalideError,
  MESSAGE_EQUIPES_ADULTES_FIGEES,
  equipesAdultesModifiables,
  normaliserNomEquipe,
  verifierAjoutCompositionAdulte,
  verifierChangementEquipe,
} from '@/domaine/engagement'
import { anneeSaison, estEligibleCategorie, type Phase } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

import type { EtatAdminEngagement } from './engagement-actions'

// Équipes d'une rencontre ADULTE (spec #20 R10–R14) : créées et composées par
// l'admin seul, sans club, grimpeurs de tous les clubs, 4 au plus, en ① et ②
// seulement. Garde admin et garde de phase explicites ; la base est la frontière
// (RLS admin, triggers club vide ⇔ adulte, effectif ≤ 4 et gel hors ①/②).
// Suppression d'équipe et retrait d'un grimpeur : actions génériques de
// `engagement-actions.ts`.

async function exigerAdmin(): Promise<EtatAdminEngagement | null> {
  const u = await getUtilisateurCourant()
  if (u?.role !== 'admin') return { erreur: 'Action réservée à un administrateur.' }
  return null
}

/** Refus si la rencontre n'est plus en ① ou ② (R10) ; `null` sinon. */
function refusSiFigees(phase: unknown): EtatAdminEngagement | null {
  return equipesAdultesModifiables(phase as Phase) ? null : { erreur: MESSAGE_EQUIPES_ADULTES_FIGEES }
}

/** Erreur levée par le trigger de gel des équipes adultes (R10). */
const estErreurGel = (message: string | undefined) => message === 'equipes_adultes_figees'

function revalider(rencontreId: string) {
  revalidatePath(`/admin/rencontres/${rencontreId}`)
}

/** Crée une équipe adulte, sans club (R10, R11, R14). */
export async function creerEquipeAdulte(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const rencontreId = String(formData.get('rencontreId') ?? '')
  let nom: string
  try {
    nom = normaliserNomEquipe(String(formData.get('nom') ?? ''))
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const rencontre = verifierLecture(
    await supabase.from('rencontre').select('phase').eq('id', rencontreId).maybeSingle(),
    'de la rencontre',
  )
  if (!rencontre) return { erreur: 'Rencontre adulte introuvable.' }
  const gel = refusSiFigees(rencontre.phase)
  if (gel) return gel

  const { error } = await supabase
    .from('equipe')
    .insert({ rencontre_id: rencontreId, club_id: null, nom })
  if (error) {
    if (estErreurGel(error.message)) return { erreur: MESSAGE_EQUIPES_ADULTES_FIGEES }
    if (error.code === '23505') return { erreur: `Une équipe « ${nom} » existe déjà.` }
    return { erreur: 'La création a échoué. Réessayez.' }
  }
  revalider(rencontreId)
  return { succes: 'Équipe créée.' }
}

/** Ajoute un grimpeur de n'importe quel club à une équipe adulte (R2, R11–R13). */
export async function ajouterGrimpeurEquipeAdulte(
  _etat: EtatAdminEngagement,
  formData: FormData,
): Promise<EtatAdminEngagement> {
  const refus = await exigerAdmin()
  if (refus) return refus

  const equipeId = String(formData.get('equipeId') ?? '')
  const rencontreId = String(formData.get('rencontreId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  if (!grimpeurId) return { erreur: 'Sélectionnez un grimpeur.' }

  const supabase = await createClient()
  const [{ data: rencontre }, { data: grimpeur }, { data: membres }, { data: engages }] =
    await Promise.all([
      supabase.from('rencontre').select('categorie, date_rencontre, phase').eq('id', rencontreId).maybeSingle(),
      supabase.from('grimpeur').select('annee_naissance').eq('id', grimpeurId).maybeSingle(),
      supabase.from('composition').select('grimpeur_id').eq('equipe_id', equipeId),
      supabase.from('composition').select('grimpeur_id').eq('rencontre_id', rencontreId),
    ])
  if (!rencontre || rencontre.categorie !== 'adulte') return { erreur: 'Rencontre adulte introuvable.' }
  const gel = refusSiFigees(rencontre.phase)
  if (gel) return gel
  if (!grimpeur) return { erreur: 'Grimpeur introuvable.' }

  if (
    !estEligibleCategorie(
      grimpeur.annee_naissance as number,
      'adulte',
      anneeSaison(rencontre.date_rencontre as string),
    )
  ) {
    return { erreur: 'Ce grimpeur a moins de 16 ans : il ne peut pas concourir en adulte.' }
  }

  try {
    verifierAjoutCompositionAdulte({
      grimpeurId,
      membresActuels: (membres ?? []).map((m) => m.grimpeur_id as string),
      dejaEngagesRencontre: (engages ?? []).map((e) => e.grimpeur_id as string),
    })
  } catch (e) {
    if (e instanceof EngagementInvalideError) return { erreur: e.message }
    throw e
  }

  const { error } = await supabase
    .from('composition')
    .insert({ equipe_id: equipeId, grimpeur_id: grimpeurId })
  if (error) {
    if (estErreurGel(error.message)) return { erreur: MESSAGE_EQUIPES_ADULTES_FIGEES }
    if (error.code === '23505') return { erreur: 'Ce grimpeur est déjà composé dans cette rencontre.' }
    if (error.message === 'effectif_equipe_adulte') {
      return { erreur: `Une équipe adulte compte au plus ${EFFECTIF_EQUIPE_ADULTE_MAX} grimpeurs.` }
    }
    return { erreur: "L'ajout a échoué. Réessayez." }
  }
  revalider(rencontreId)
  return { succes: 'Grimpeur ajouté.' }
}

/**
 * Change un grimpeur d'équipe adulte, dans la même rencontre (R11, R12) : mise à
 * jour de `composition.equipe_id` — le grimpeur garde ses résultats.
 */
export async function changerEquipeAdulte(
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
  const [equipes, membresCible, rencontreRes] = await Promise.all([
    supabase.from('equipe').select('id, club_id, rencontre_id').in('id', [equipeId, equipeCibleId]),
    supabase.from('composition').select('grimpeur_id').eq('equipe_id', equipeCibleId),
    supabase.from('rencontre').select('phase').eq('id', rencontreId).maybeSingle(),
  ])
  const rencontre = verifierLecture(rencontreRes, 'de la rencontre')
  if (!rencontre) return { erreur: 'Rencontre adulte introuvable.' }
  const gel = refusSiFigees(rencontre.phase)
  if (gel) return gel
  const lignes = verifierLecture(equipes, 'des équipes') ?? []
  const source = lignes.find((e) => e.id === equipeId)
  const cible = lignes.find((e) => e.id === equipeCibleId)
  if (!source || !cible) return { erreur: 'Équipe introuvable.' }

  try {
    verifierChangementEquipe(
      {
        equipeSource: {
          id: source.id as string,
          clubId: (source.club_id as string | null) ?? null,
          rencontreId: source.rencontre_id as string,
        },
        equipeCible: {
          id: cible.id as string,
          clubId: (cible.club_id as string | null) ?? null,
          rencontreId: cible.rencontre_id as string,
          effectif: (verifierLecture(membresCible, "des membres de l'équipe cible") ?? []).length,
        },
      },
      EFFECTIF_EQUIPE_ADULTE_MAX,
    )
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
  if (estErreurGel(error?.message)) return { erreur: MESSAGE_EQUIPES_ADULTES_FIGEES }
  if (error?.message === 'effectif_equipe_adulte') {
    return { erreur: `Une équipe adulte compte au plus ${EFFECTIF_EQUIPE_ADULTE_MAX} grimpeurs.` }
  }
  if (error || !maj?.length) return { erreur: 'Le changement d’équipe a échoué. Réessayez.' }
  revalider(rencontreId)
  return { succes: 'Grimpeur changé d’équipe.' }
}
