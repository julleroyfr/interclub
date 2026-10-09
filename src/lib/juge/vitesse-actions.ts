'use server'

import {
  lireSaisieVitesse,
  ResultatVitesseInvalideError,
  type ResultatVitesse,
} from '@/domaine/vitesse'
import { createClient } from '@/lib/supabase/server'

// Saisie du résultat de vitesse par le juge (spec #10). Le domaine valide la
// forme (temps > 0 / chute / non-prés., R7/R8/R9) sans appel réseau ; puis UN
// appel à la fonction d'enregistrement contrôle la session juge (③, R6),
// l'épreuve de vitesse de sa rencontre (R3) et le grimpeur engagé (R7bis), et
// écrit (rév. 2026-10-09). La RLS (peut_ecrire_temps_vitesse) reste la
// frontière ultime.

export type EtatSaisieVitesse = { erreur?: string; succes?: string } | undefined

/** Traduit un refus d'écriture (RLS) ou une erreur base en message lisible (R4). */
function messageEcriture(erreur: { code?: string; message?: string }): string {
  // Seul un grimpeur engagé reçoit un résultat de vitesse, garanti en base
  // (spec #10 R7bis, rév. 2026-10-03).
  if (erreur.message === 'grimpeur_non_engage') {
    return "Ce grimpeur n'est pas engagé dans la rencontre."
  }
  if (erreur.message === 'session_juge_absente') {
    return 'Action réservée à un juge (session QR active en compétition).'
  }
  if (erreur.code === '42501') {
    return 'Saisie non autorisée : hors compétition, ou hors de votre épreuve de vitesse.'
  }
  return 'La saisie a échoué. Réessayez.'
}

/**
 * Enregistre (ou corrige) le résultat de vitesse d'un grimpeur (R7/R10/R11).
 * Correction = remplacement (upsert sur `(epreuve, grimpeur)`, R10). Bornée à la
 * ③ compétition et à l'épreuve de vitesse de la rencontre du juge (R3/R6).
 */
export async function saisirTempsVitesse(
  _etat: EtatSaisieVitesse,
  formData: FormData,
): Promise<EtatSaisieVitesse> {
  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  if (!grimpeurId) return { erreur: 'Grimpeur requis.' }

  let resultat: ResultatVitesse
  try {
    resultat = lireSaisieVitesse(String(formData.get('issue') ?? ''), String(formData.get('temps') ?? ''))
  } catch (e) {
    if (e instanceof ResultatVitesseInvalideError) return { erreur: e.message }
    throw e
  }

  // Un seul appel : la fonction d'enregistrement contrôle la session juge (③),
  // l'épreuve de sa rencontre, le grimpeur engagé, puis écrit (R3, rév.
  // 2026-10-09). Pas de relecture de l'écran (R14).
  const supabase = await createClient()
  const { error } = await supabase.rpc('saisir_temps_vitesse', {
    p_grimpeur: grimpeurId,
    p_issue: resultat.type,
    p_temps: resultat.type === 'temps' ? resultat.secondes : null,
  })
  if (error) return { erreur: messageEcriture(error) }
  return { succes: 'Résultat enregistré.' }
}
