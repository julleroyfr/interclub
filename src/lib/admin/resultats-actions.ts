'use server'

import { revalidatePath } from 'next/cache'

import { type TypeVoie } from '@/domaine/gabarit'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import {
  type IssueBloc,
  type IssueVoie,
  ResultatInvalideError,
  validerIssueVoie,
  validerResultatBloc,
  verifierAjoutVoieAdo,
} from '@/domaine/resultat'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

// Saisie / correction des résultats voie/bloc par l'ADMIN (spec #9). L'admin agit
// sur TOUT grimpeur, tous clubs (R2), en ③ compétition (saisie de plein droit) OU
// ④ clôture (correction, R5). Le gating de phase est porté ICI ; l'écriture passe
// par la branche est_admin() de la RLS resultat_* (frontière ultime). Le domaine
// valide l'issue (R7 = spec #6 R10/R12/R16), le plafond et l'unicité ado. L'auteur
// (admin) est tracé (R14).

/** Client Supabase du projet (schéma `interclub`). */
type Client = Awaited<ReturnType<typeof createClient>>

export type EtatSaisie = { erreur?: string; succes?: string } | undefined

/** Phases où l'admin peut saisir/corriger un résultat (R5). */
const PHASES_ECRITURE_ADMIN: Phase[] = ['competition', 'cloture']

/** Vérifie le rôle admin ; renvoie son id auth, ou un état d'erreur. */
async function exigerAdmin(): Promise<{ utilisateurId: string } | { erreur: string }> {
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
        "La saisie admin n'est possible qu'en compétition (③) ou clôture (④) (R5).",
    }
  }
  return null
}

/** Traduit un refus d'écriture (RLS) ou une erreur base en message lisible (R4). */
function messageEcriture(code: string | undefined): string {
  if (code === '42501') {
    return 'Écriture non autorisée : rôle ou phase invalide.'
  }
  return 'La saisie a échoué. Réessayez.'
}

/** Contexte d'une voie : rencontre, épreuve, catégorie, phase, type de voie. */
async function chargerContexteVoie(
  supabase: Client,
  voieId: string,
): Promise<
  | { rencontreId: string; epreuveId: string; categorie: Categorie; phase: Phase; typeVoie: TypeVoie }
  | null
> {
  const { data: voie } = await supabase
    .from('voie_difficulte')
    .select('type_voie, epreuve_id')
    .eq('id', voieId)
    .maybeSingle()
  if (!voie) return null
  const { data: ep } = await supabase
    .from('epreuve')
    .select('rencontre_id')
    .eq('id', voie.epreuve_id as string)
    .maybeSingle()
  if (!ep) return null
  const { data: r } = await supabase
    .from('rencontre')
    .select('categorie, phase')
    .eq('id', ep.rencontre_id as string)
    .maybeSingle()
  if (!r) return null
  return {
    rencontreId: ep.rencontre_id as string,
    epreuveId: voie.epreuve_id as string,
    categorie: r.categorie as Categorie,
    phase: r.phase as Phase,
    typeVoie: voie.type_voie as TypeVoie,
  }
}

/** Contexte d'un bloc : rencontre, phase. */
async function chargerContexteBloc(
  supabase: Client,
  blocId: string,
): Promise<{ rencontreId: string; phase: Phase } | null> {
  const { data: bloc } = await supabase
    .from('bloc')
    .select('epreuve_id')
    .eq('id', blocId)
    .maybeSingle()
  if (!bloc) return null
  const { data: ep } = await supabase
    .from('epreuve')
    .select('rencontre_id')
    .eq('id', bloc.epreuve_id as string)
    .maybeSingle()
  if (!ep) return null
  const { data: r } = await supabase
    .from('rencontre')
    .select('phase')
    .eq('id', ep.rencontre_id as string)
    .maybeSingle()
  if (!r) return null
  return { rencontreId: ep.rencontre_id as string, phase: r.phase as Phase }
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
  const admin = await exigerAdmin()
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
    const { data: voiesEp } = await supabase
      .from('voie_difficulte')
      .select('id')
      .eq('epreuve_id', ctx.epreuveId)
    const idsEp = (voiesEp ?? []).map((v) => v.id as string)
    const { data: existantes } = await supabase
      .from('resultat_voie')
      .select('voie_difficulte_id')
      .eq('grimpeur_id', grimpeurId)
      .in('voie_difficulte_id', idsEp)
    const dejaSaisies = (existantes ?? []).map((r) => r.voie_difficulte_id as string)
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
  if (error) return { erreur: messageEcriture(error.code) }

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
  const admin = await exigerAdmin()
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

  const { data: paliers } = await supabase
    .from('bloc_palier')
    .select('id')
    .eq('bloc_id', blocId)
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
  if (error) return { erreur: messageEcriture(error.code) }

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
  const admin = await exigerAdmin()
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
  if (error) return { erreur: messageEcriture(error.code) }

  revalidatePath(`/admin/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat retiré.' }
}
