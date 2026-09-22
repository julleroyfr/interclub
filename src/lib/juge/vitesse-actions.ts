'use server'

import { revalidatePath } from 'next/cache'

import {
  creerResultatVitesse,
  ResultatVitesseInvalideError,
  type ResultatVitesse,
} from '@/domaine/vitesse'
import { getContexteJuge } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

// Saisie du résultat de vitesse par le juge (spec #10). L'action revérifie la
// session juge, la phase (③ compétition, R6) et cible l'épreuve de vitesse de sa
// rencontre (R3) ; le domaine valide la forme (temps > 0 / chute / non-prés.,
// R7/R8/R9). La RLS (peut_ecrire_temps_vitesse) reste la frontière ultime.

export type EtatSaisieVitesse = { erreur?: string; succes?: string } | undefined

/** Traduit un refus d'écriture (RLS) ou une erreur base en message lisible (R4). */
function messageEcriture(code: string | undefined): string {
  if (code === '42501') {
    return 'Saisie non autorisée : hors compétition, ou hors de votre épreuve de vitesse.'
  }
  return 'La saisie a échoué. Réessayez.'
}

/** Convertit la saisie du formulaire en résultat de vitesse du domaine (R7). */
function lireResultat(formData: FormData): ResultatVitesse {
  const issue = String(formData.get('issue') ?? '')
  if (issue === 'chute') return { type: 'chute' }
  if (issue === 'non_presentation') return { type: 'non_presentation' }
  // Temps : accepte la virgule décimale (8,123) comme le point (8.123), R8.
  const brut = String(formData.get('temps') ?? '').trim().replace(',', '.')
  return { type: 'temps', secondes: Number(brut) }
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
  const contexte = await getContexteJuge()
  if (!contexte) {
    return { erreur: 'Action réservée à un juge (session QR active en compétition).' }
  }
  if (contexte.phase !== 'competition') {
    return { erreur: "La saisie de la vitesse n'est ouverte qu'en phase compétition (R6)." }
  }

  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  if (!grimpeurId) return { erreur: 'Grimpeur requis.' }

  let resultat: ResultatVitesse
  try {
    resultat = creerResultatVitesse(lireResultat(formData))
  } catch (e) {
    if (e instanceof ResultatVitesseInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('temps_vitesse').upsert(
    {
      epreuve_id: contexte.epreuveVitesseId,
      grimpeur_id: grimpeurId,
      issue: resultat.type,
      temps: resultat.type === 'temps' ? resultat.secondes : null,
      auteur_utilisateur_id: user?.id ?? null,
      auteur_role: 'juge',
    },
    { onConflict: 'epreuve_id,grimpeur_id' },
  )
  if (error) return { erreur: messageEcriture(error.code) }

  revalidatePath('/juge')
  return { succes: 'Résultat enregistré.' }
}
