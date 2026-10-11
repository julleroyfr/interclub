'use server'

import { revalidatePath } from 'next/cache'

import { type Phase } from '@/domaine/rencontre'
import {
  MESSAGE_PLAFOND_VOIES_ADO,
  type IssueBloc,
  type IssueVoie,
  ResultatInvalideError,
  validerIssueVoie,
  validerResultatBloc,
  verifierAjoutVoieAdo,
} from '@/domaine/resultat'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { chargerContexteBloc, chargerContexteVoie, voiesDejaSaisiesAdo } from '@/lib/resultats/contexte-saisie'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

// Saisie / correction des résultats voie/bloc par l'ADMIN (spec #9). L'admin agit
// sur TOUT grimpeur, tous clubs (R2), en ③ compétition (saisie de plein droit) OU
// ④ clôture (correction, R5). Le gating de phase est porté ICI ; l'écriture passe
// par la branche est_admin() de la RLS resultat_* (frontière ultime). Le domaine
// valide l'issue (R7 = spec #6 R10/R12/R16), le plafond et l'unicité ado. L'auteur
// (admin) est tracé (R14).

export type EtatSaisie = { erreur?: string; succes?: string } | undefined

/** Phases où l'admin peut saisir/corriger un résultat (R5). */
const PHASES_ECRITURE_ADMIN: Phase[] = ['competition', 'cloture']

/** Vérifie le rôle admin ; renvoie son id auth, ou un état d'erreur. */
async function verifierAdminSaisie(): Promise<{ utilisateurId: string } | { erreur: string }> {
  const u = await getUtilisateurCourant()
  if (u?.role !== 'admin') {
    return { erreur: 'Action réservée à un administrateur.' }
  }
  return { utilisateurId: u.id }
}

/** Refuse l'écriture hors de la fenêtre admin (③ compétition ou ④ clôture, R5). */
function refuserSiHorsFenetre(phase: Phase): EtatSaisie | null {
  if (!PHASES_ECRITURE_ADMIN.includes(phase)) {
    return {
      erreur:
        "La saisie admin n'est possible qu'en compétition (③) ou clôture (④).",
    }
  }
  return null
}

/** Traduit un refus d'écriture (RLS) ou une erreur base en message lisible (R4). */
function messageEcriture(erreur: { code?: string; message?: string }): string {
  // Plafond de 6 voies ado garanti en base (spec #6 R14, rév. 2026-10-03) :
  // même message que le contrôle préalable du domaine.
  if (erreur.message === 'plafond_voies_ado') return MESSAGE_PLAFOND_VOIES_ADO
  if (erreur.code === '42501') {
    return 'Écriture non autorisée : rôle ou phase invalide.'
  }
  return 'La saisie a échoué. Réessayez.'
}

/**
 * Enregistre / corrige l'issue d'un grimpeur (tout club) sur une voie (R2/R5/R7).
 * Correction = remplacement (une seule issue par voie). Ado : plafond 6 + unicité
 * à l'ajout d'une nouvelle voie. Trace l'auteur admin (R14).
 */
export async function saisirResultatVoieAdmin(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const admin = await verifierAdminSaisie()
  if ('erreur' in admin) return admin

  const voieId = String(formData.get('voieDifficulteId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const issue = String(formData.get('issue') ?? '') as IssueVoie
  if (!voieId || !grimpeurId) return { erreur: 'Voie et grimpeur requis.' }

  const supabase = await createClient()
  const ctx = await chargerContexteVoie(supabase, voieId)
  if (!ctx) return { erreur: 'Voie introuvable.' }
  const refus = refuserSiHorsFenetre(ctx.phase)
  if (refus) return refus

  try {
    validerIssueVoie(issue, ctx.categorie, ctx.typeVoie)
  } catch (e) {
    if (e instanceof ResultatInvalideError) return { erreur: e.message }
    throw e
  }

  // Ado : plafond 6 + unicité, uniquement à l'AJOUT d'une voie non encore saisie.
  if (ctx.categorie === 'ado') {
    const dejaSaisies = await voiesDejaSaisiesAdo(supabase, ctx.epreuveId, grimpeurId)
    if (!dejaSaisies.includes(voieId)) {
      try {
        verifierAjoutVoieAdo({ voiesSaisiesIds: dejaSaisies, voieCandidateId: voieId })
      } catch (e) {
        if (e instanceof ResultatInvalideError) return { erreur: e.message }
        throw e
      }
    }
  }

  const { error } = await supabase.from('resultat_voie').upsert(
    {
      voie_difficulte_id: voieId,
      grimpeur_id: grimpeurId,
      issue,
      auteur_utilisateur_id: admin.utilisateurId,
      auteur_role: 'admin',
    },
    { onConflict: 'voie_difficulte_id,grimpeur_id' },
  )
  if (error) return { erreur: messageEcriture(error) }

  revalidatePath(`/admin/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat enregistré.' }
}

/**
 * Enregistre / corrige l'issue d'un grimpeur (tout club) sur un bloc (R2/R5/R7) :
 * palier atteint (parmi les paliers du bloc) ou échec. Trace l'auteur admin (R14).
 */
export async function saisirResultatBlocAdmin(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const admin = await verifierAdminSaisie()
  if ('erreur' in admin) return admin

  const blocId = String(formData.get('blocId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const issue = String(formData.get('issue') ?? '') as IssueBloc
  const palierBrut = String(formData.get('palierId') ?? '')
  const palierId = palierBrut === '' ? null : palierBrut
  if (!blocId || !grimpeurId) return { erreur: 'Bloc et grimpeur requis.' }

  const supabase = await createClient()
  const ctx = await chargerContexteBloc(supabase, blocId)
  if (!ctx) return { erreur: 'Bloc introuvable.' }
  const refus = refuserSiHorsFenetre(ctx.phase)
  if (refus) return refus

  const paliers = verifierLecture(
    await supabase
      .from('bloc_palier')
      .select('id')
      .eq('bloc_id', blocId),
    'des paliers',
  )
  const paliersDuBloc = (paliers ?? []).map((p) => p.id as string)

  try {
    validerResultatBloc({ issue, palierId, paliersDuBloc })
  } catch (e) {
    if (e instanceof ResultatInvalideError) return { erreur: e.message }
    throw e
  }

  const { error } = await supabase.from('resultat_bloc').upsert(
    {
      bloc_id: blocId,
      grimpeur_id: grimpeurId,
      issue,
      palier_id: issue === 'palier' ? palierId : null,
      auteur_utilisateur_id: admin.utilisateurId,
      auteur_role: 'admin',
    },
    { onConflict: 'bloc_id,grimpeur_id' },
  )
  if (error) return { erreur: messageEcriture(error) }

  revalidatePath(`/admin/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat enregistré.' }
}

/**
 * Retire le résultat d'un grimpeur sur une voie (ado : libère un des 6 emplacements).
 * Réservé à l'admin, en ③/④ (R5).
 */
export async function retirerResultatVoieAdmin(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const admin = await verifierAdminSaisie()
  if ('erreur' in admin) return admin

  const voieId = String(formData.get('voieDifficulteId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  if (!voieId || !grimpeurId) return { erreur: 'Voie et grimpeur requis.' }

  const supabase = await createClient()
  const ctx = await chargerContexteVoie(supabase, voieId)
  if (!ctx) return { erreur: 'Voie introuvable.' }
  const refus = refuserSiHorsFenetre(ctx.phase)
  if (refus) return refus

  const { error } = await supabase
    .from('resultat_voie')
    .delete()
    .eq('voie_difficulte_id', voieId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: messageEcriture(error) }

  revalidatePath(`/admin/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat retiré.' }
}
