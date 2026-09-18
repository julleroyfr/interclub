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
import { type ContexteCoach, getContexteCoach } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

// Saisie des résultats voie/bloc par le coach (spec #6). Chaque action revérifie
// le contexte coach, la phase (③ compétition, R5/R7) et le périmètre du coach
// temporaire ; le domaine valide l'issue (R10/R12/R16), le plafond et l'unicité
// ado (R11/R13/R14). La RLS (peut_ecrire_resultat_voie/_bloc) reste la frontière
// ultime (périmètre-club via composition, prêté inclus R36).

/** Client Supabase du projet (schéma `interclub`). */
type Client = Awaited<ReturnType<typeof createClient>>

export type EtatSaisie = { erreur?: string; succes?: string } | undefined

/** Vérifie le contexte coach et renvoie son club + contexte, ou un état d'erreur. */
async function exigerCoachClub(): Promise<
  { clubId: string; contexte: ContexteCoach } | { erreur: string }
> {
  const contexte = await getContexteCoach()
  if (!contexte) {
    return { erreur: 'Action réservée à un coach (compte rattaché à un club ou session QR active).' }
  }
  return { clubId: contexte.clubId, contexte }
}

/**
 * Refuse la saisie hors de la fenêtre autorisée : phase ③ compétition (R5/R7) ;
 * un coach temporaire est borné à SA rencontre (session du jour). Renvoie un état
 * d'erreur, ou `null` si la saisie est permise pour ce contexte.
 */
function refuserSiHorsSaisie(
  contexte: ContexteCoach,
  rencontreId: string,
  phase: Phase,
): EtatSaisie | null {
  if (phase !== 'competition') {
    return { erreur: "La saisie des résultats n'est ouverte qu'en phase compétition (R5)." }
  }
  if (contexte.type === 'temporaire' && contexte.rencontreId !== rencontreId) {
    return { erreur: 'Votre session QR ne couvre pas cette rencontre.' }
  }
  return null
}

/** Traduit un refus d'écriture (RLS) ou une erreur base en message lisible (R4). */
function messageEcriture(code: string | undefined): string {
  if (code === '42501') {
    return 'Saisie non autorisée : hors compétition, ou grimpeur hors de votre club.'
  }
  return 'La saisie a échoué. Réessayez.'
}

/** Contexte d'une voie de difficulté : rencontre, épreuve, catégorie, phase, type. */
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
 * Enregistre (ou corrige) l'issue d'un grimpeur sur une voie de difficulté
 * (R8/R10/R12). Correction = remplacement (une seule issue par voie, R13). Pour
 * l'ado, contrôle le plafond de 6 et l'unicité à l'AJOUT d'une nouvelle voie
 * (R11/R14).
 */
export async function saisirResultatVoie(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const voieId = String(formData.get('voieDifficulteId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const issue = String(formData.get('issue') ?? '') as IssueVoie
  if (!voieId || !grimpeurId) return { erreur: 'Voie et grimpeur requis.' }

  const supabase = await createClient()
  const ctx = await chargerContexteVoie(supabase, voieId)
  if (!ctx) return { erreur: 'Voie introuvable.' }
  const refus = refuserSiHorsSaisie(coach.contexte, ctx.rencontreId, ctx.phase)
  if (refus) return refus

  try {
    validerIssueVoie(issue, ctx.categorie, ctx.typeVoie)
  } catch (e) {
    if (e instanceof ResultatInvalideError) return { erreur: e.message }
    throw e
  }

  // Ado : plafond 6 + unicité, uniquement quand on AJOUTE une voie non encore
  // saisie (une correction sur une voie déjà saisie est un remplacement, R13).
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

  const { error } = await supabase
    .from('resultat_voie')
    .upsert(
      { voie_difficulte_id: voieId, grimpeur_id: grimpeurId, issue },
      { onConflict: 'voie_difficulte_id,grimpeur_id' },
    )
  if (error) return { erreur: messageEcriture(error.code) }

  revalidatePath(`/coach/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat enregistré.' }
}

/**
 * Enregistre (ou corrige) l'issue d'un grimpeur sur un bloc (R15/R16/R17) :
 * palier atteint (parmi les paliers du bloc) ou échec. Correction = remplacement.
 */
export async function saisirResultatBloc(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const blocId = String(formData.get('blocId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const issue = String(formData.get('issue') ?? '') as IssueBloc
  const palierBrut = String(formData.get('palierId') ?? '')
  const palierId = palierBrut === '' ? null : palierBrut
  if (!blocId || !grimpeurId) return { erreur: 'Bloc et grimpeur requis.' }

  const supabase = await createClient()
  const ctx = await chargerContexteBloc(supabase, blocId)
  if (!ctx) return { erreur: 'Bloc introuvable.' }
  const refus = refuserSiHorsSaisie(coach.contexte, ctx.rencontreId, ctx.phase)
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

  const { error } = await supabase
    .from('resultat_bloc')
    .upsert(
      {
        bloc_id: blocId,
        grimpeur_id: grimpeurId,
        issue,
        palier_id: issue === 'palier' ? palierId : null,
      },
      { onConflict: 'bloc_id,grimpeur_id' },
    )
  if (error) return { erreur: messageEcriture(error.code) }

  revalidatePath(`/coach/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat enregistré.' }
}

/**
 * Retire le résultat d'un grimpeur sur une voie (utile en ado pour libérer un des
 * 6 emplacements, R11/R14). Bornée à la ③ compétition et au périmètre coach.
 */
export async function retirerResultatVoie(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const coach = await exigerCoachClub()
  if ('erreur' in coach) return coach

  const voieId = String(formData.get('voieDifficulteId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  if (!voieId || !grimpeurId) return { erreur: 'Voie et grimpeur requis.' }

  const supabase = await createClient()
  const ctx = await chargerContexteVoie(supabase, voieId)
  if (!ctx) return { erreur: 'Voie introuvable.' }
  const refus = refuserSiHorsSaisie(coach.contexte, ctx.rencontreId, ctx.phase)
  if (refus) return refus

  const { error } = await supabase
    .from('resultat_voie')
    .delete()
    .eq('voie_difficulte_id', voieId)
    .eq('grimpeur_id', grimpeurId)
  if (error) return { erreur: messageEcriture(error.code) }

  revalidatePath(`/coach/rencontres/${ctx.rencontreId}/resultats`)
  return { succes: 'Résultat retiré.' }
}
