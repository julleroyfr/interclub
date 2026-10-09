'use server'

import { MESSAGE_PLAFOND_VOIES_ADO } from '@/domaine/resultat'
import { lireReponseEnregistrement, type ScoreGrimpeur } from '@/lib/resultats/reponse-enregistrement'
import { createClient } from '@/lib/supabase/server'

// Saisie des résultats voie/bloc par le coach (spec #6). Chaque écriture est UN
// SEUL appel à une fonction d'enregistrement en base (R3, rév. 2026-10-09 ;
// migration 202610091000) qui contrôle — rôle coach (permanent ou session QR),
// club du grimpeur (prêtés inclus), phase ③, issue admise, palier du bloc,
// plafond ado — PUIS écrit, avec les droits de l'appelant (la RLS reste la
// frontière ultime). La réponse porte les résultats du grimpeur, dont le score
// est déduit par le domaine (R20) : l'écran n'est pas relu en entier.

export type EtatSaisie =
  | { erreur?: string; succes?: string; score?: ScoreGrimpeur }
  | undefined

/** Traduit un refus de la fonction d'enregistrement en message lisible (R4). */
function messageRefus(erreur: { code?: string; message?: string }): string {
  switch (erreur.message) {
    case 'hors_competition':
      return "La saisie des résultats n'est ouverte qu'en phase compétition."
    case 'hors_perimetre':
      return 'Saisie non autorisée : grimpeur hors de votre club, ou session QR expirée.'
    case 'voie_introuvable':
      return 'Voie introuvable.'
    case 'bloc_introuvable':
      return 'Bloc introuvable.'
    case 'issue_non_admise':
      return 'Issue non admise pour cette voie ou ce bloc.'
    case 'palier_invalide':
      return 'Le palier choisi doit appartenir au bloc.'
    // Plafond de 6 voies ado garanti en base (R14) : même message que le domaine.
    case 'plafond_voies_ado':
      return MESSAGE_PLAFOND_VOIES_ADO
    default:
      return erreur.code === '42501'
        ? 'Saisie non autorisée : grimpeur hors de votre club, ou session QR expirée.'
        : 'La saisie a échoué. Réessayez.'
  }
}

/** Appelle une fonction d'enregistrement et lit le score renvoyé (R3/R20). */
async function enregistrer(
  fonction: 'saisir_resultat_voie' | 'saisir_resultat_bloc' | 'retirer_resultat_voie',
  parametres: Record<string, string | null>,
  succes: string,
): Promise<EtatSaisie> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fonction, parametres)
  if (error) return { erreur: messageRefus(error) }
  return { succes, score: lireReponseEnregistrement(data) }
}

/**
 * Enregistre (ou corrige) l'issue d'un grimpeur sur une voie de difficulté
 * (R8/R10/R12). Correction = remplacement (R13) ; plafond ado (R14).
 */
export async function saisirResultatVoie(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const voieId = String(formData.get('voieDifficulteId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const issue = String(formData.get('issue') ?? '')
  if (!voieId || !grimpeurId) return { erreur: 'Voie et grimpeur requis.' }
  return enregistrer(
    'saisir_resultat_voie',
    { p_voie: voieId, p_grimpeur: grimpeurId, p_issue: issue },
    'Résultat enregistré.',
  )
}

/**
 * Enregistre (ou corrige) l'issue d'un grimpeur sur un bloc (R15/R16/R17) :
 * palier atteint (parmi les paliers du bloc) ou échec. Correction = remplacement.
 */
export async function saisirResultatBloc(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const blocId = String(formData.get('blocId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const issue = String(formData.get('issue') ?? '')
  const palierBrut = String(formData.get('palierId') ?? '')
  if (!blocId || !grimpeurId) return { erreur: 'Bloc et grimpeur requis.' }
  return enregistrer(
    'saisir_resultat_bloc',
    {
      p_bloc: blocId,
      p_grimpeur: grimpeurId,
      p_issue: issue,
      p_palier: issue === 'palier' && palierBrut !== '' ? palierBrut : null,
    },
    'Résultat enregistré.',
  )
}

/**
 * Retire le résultat d'un grimpeur sur une voie (utile en ado pour libérer un des
 * 6 emplacements, R11/R14). Bornée à la ③ compétition et au périmètre coach.
 */
export async function retirerResultatVoie(
  _etat: EtatSaisie,
  formData: FormData,
): Promise<EtatSaisie> {
  const voieId = String(formData.get('voieDifficulteId') ?? '')
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  if (!voieId || !grimpeurId) return { erreur: 'Voie et grimpeur requis.' }
  return enregistrer(
    'retirer_resultat_voie',
    { p_voie: voieId, p_grimpeur: grimpeurId },
    'Résultat retiré.',
  )
}
