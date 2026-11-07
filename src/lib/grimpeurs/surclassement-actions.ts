'use server'

import { revalidatePath } from 'next/cache'

import { estEligibleCategorie, labelSaison } from '@/domaine/rencontre'
import {
  messageRevocation,
  refusAccordSurclassement,
  saisonsSurclassement,
} from '@/domaine/surclassement'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { bornesAgeOuErreur } from '@/lib/rencontres/bornes-age'
import { createClient } from '@/lib/supabase/server'

import { type EtatGrimpeur } from './grimpeurs'

// Accord et révocation d'un surclassement (spec #21 R1–R4, R11–R15). Admin seul :
// garde explicite (message clair) ; la vraie frontière est la RLS
// `surclassement_*` et la garde `est_admin()` de la RPC de révocation.

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function refuserSiNonAdmin(): Promise<EtatGrimpeur | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut gérer un surclassement.' }
  }
  return null
}

/** « Prénom NOM », comme dans les messages de l'écran. */
function nomAffiche(g: { prenom: unknown; nom: unknown }): string {
  return `${String(g.prenom)} ${String(g.nom).toUpperCase()}`
}

/** Accorde un surclassement pour la saison choisie (R1–R4). */
export async function accorderSurclassement(
  _etat: EtatGrimpeur,
  formData: FormData,
): Promise<EtatGrimpeur> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const saison = Number(formData.get('saison'))
  // Saison courante ou suivante seulement (R2).
  if (!saisonsSurclassement(aujourdhuiISO()).includes(saison)) {
    return { erreur: 'Choisissez la saison courante ou la suivante.' }
  }
  const bornes = bornesAgeOuErreur()
  if ('erreur' in bornes) return bornes

  const supabase = await createClient()
  const [{ data: grimpeur }, { data: actif }] = await Promise.all([
    supabase.from('grimpeur').select('nom, prenom, annee_naissance').eq('id', grimpeurId).maybeSingle(),
    supabase
      .from('surclassement')
      .select('id')
      .eq('grimpeur_id', grimpeurId)
      .eq('saison', saison)
      .is('revoque_le', null)
      .maybeSingle(),
  ])
  if (!grimpeur) return { erreur: 'Grimpeur introuvable.' }

  const motif = refusAccordSurclassement({
    anneeNaissance: grimpeur.annee_naissance as number,
    saison,
    bornes: bornes.bornes,
    dejaActif: !!actif,
  })
  if (motif) return { erreur: motif }

  const { error } = await supabase.from('surclassement').insert({ grimpeur_id: grimpeurId, saison })
  if (error) {
    // Accord concurrent : l'index « un actif par saison » tranche (R4).
    if (error.code === '23505') return { erreur: 'Ce grimpeur est déjà surclassé pour cette saison.' }
    return { erreur: 'Le surclassement a échoué. Réessayez.' }
  }

  revalidatePath('/admin/grimpeurs')
  return {
    succes: `${nomAffiche(grimpeur)} est surclassé en ado pour la saison ${labelSaison(saison)}.`,
  }
}

/** Révoque un surclassement et retire le grimpeur des rencontres ado à venir (R11–R15). */
export async function revoquerSurclassement(
  _etat: EtatGrimpeur,
  formData: FormData,
): Promise<EtatGrimpeur> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const grimpeurId = String(formData.get('grimpeurId') ?? '')
  const saison = Number(formData.get('saison'))
  if (!Number.isInteger(saison)) return { erreur: 'Saison invalide.' }

  const supabase = await createClient()
  const { data: grimpeur } = await supabase
    .from('grimpeur')
    .select('nom, prenom, annee_naissance')
    .eq('id', grimpeurId)
    .maybeSingle()
  if (!grimpeur) return { erreur: 'Grimpeur introuvable.' }

  // Éligible ado par son âge (âge de bascule abaissé depuis l'accord) : la
  // révocation ne retire rien (R12). Âges non configurés : on retire, le
  // surclassement n'ayant été accordé qu'à un âge < B (R3).
  const bornes = bornesAgeOuErreur()
  const eligibleParAge =
    'bornes' in bornes &&
    estEligibleCategorie(grimpeur.annee_naissance as number, 'ado', saison, bornes.bornes)

  const { data, error } = await supabase.rpc('revoquer_surclassement', {
    p_grimpeur: grimpeurId,
    p_saison: saison,
    p_retirer: !eligibleParAge,
  })
  if (error) {
    if (error.message?.includes('surclassement_introuvable')) {
      return { erreur: 'Ce grimpeur n’est plus surclassé pour cette saison.' }
    }
    if (error.message?.includes('acces_refuse')) {
      return { erreur: 'Seul un administrateur peut gérer un surclassement.' }
    }
    return { erreur: 'La révocation a échoué. Réessayez.' }
  }

  revalidatePath('/admin/grimpeurs')
  // Les rencontres quittées changent de composition (écrans d'engagement).
  revalidatePath('/admin/rencontres', 'layout')
  revalidatePath('/coach', 'layout')
  return { succes: messageRevocation(nomAffiche(grimpeur), Number(data ?? 0)) }
}
