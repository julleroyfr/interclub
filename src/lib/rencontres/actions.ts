'use server'

import { revalidatePath } from 'next/cache'

import {
  estPhaseJourJ,
  libellePhase,
  normaliserSaisieRencontre,
  peutEntrerEnPhase,
  peutTransiter,
  PHASES,
  SaisieRencontreInvalideError,
  type Phase,
} from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

import { type EtatRencontre } from './rencontres'

// CRUD des rencontres (spec #1 R12) — réservé à l'admin. Server Actions :
// joignables par POST direct, on ne se fie pas à l'UI. Défense en profondeur :
// garde admin explicite (message clair) + la vraie frontière reste la **RLS**
// (policies `rencontre_insert/update/delete_admin`).

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Refuse l'appelant non-admin (message R12), ou `null` si admin. */
async function refuserSiNonAdmin(): Promise<EtatRencontre | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut gérer les rencontres.' }
  }
  return null
}

/** Traduit une erreur Postgres/PostgREST en message lisible. */
function messageErreur(code: string | undefined, contexte: 'ecriture' | 'suppression'): string {
  if (code === '23503') {
    return contexte === 'suppression'
      ? 'Cette rencontre est référencée : suppression impossible.'
      : 'Le club porteur est introuvable.'
  }
  return contexte === 'suppression'
    ? 'La suppression a échoué. Réessayez.'
    : 'L’enregistrement a échoué. Réessayez.'
}

export async function creerRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  let saisie
  try {
    saisie = normaliserSaisieRencontre({
      dateRencontre: String(formData.get('dateRencontre') ?? ''),
      clubPorteurId: String(formData.get('clubPorteurId') ?? ''),
      categorie: String(formData.get('categorie') ?? ''),
    })
  } catch (e) {
    if (e instanceof SaisieRencontreInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  // Copie atomique du gabarit → rencontre (R30). La RPC gère la transaction :
  // si l'une des insertions échoue, la rencontre n'est pas créée non plus.
  const { error } = await supabase.rpc('creer_rencontre_avec_gabarit', {
    p_date: saisie.dateRencontre,
    p_club_porteur: saisie.clubPorteurId,
    p_categorie: saisie.categorie,
  })
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/rencontres')
  return { succes: 'Rencontre créée.' }
}

export async function modifierRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Rencontre introuvable.' }

  let saisie
  try {
    saisie = normaliserSaisieRencontre({
      dateRencontre: String(formData.get('dateRencontre') ?? ''),
      clubPorteurId: String(formData.get('clubPorteurId') ?? ''),
      categorie: String(formData.get('categorie') ?? ''),
    })
  } catch (e) {
    if (e instanceof SaisieRencontreInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('rencontre')
    .update({
      date_rencontre: saisie.dateRencontre,
      club_porteur_id: saisie.clubPorteurId,
      categorie: saisie.categorie,
    })
    .eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'ecriture') }

  revalidatePath('/admin/rencontres')
  return { succes: 'Rencontre modifiée.' }
}

export async function changerPhaseRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Rencontre introuvable.' }

  const phase = String(formData.get('phase') ?? '')
  if (!PHASES.some((p) => p.value === phase)) {
    return { erreur: 'La phase est invalide.' }
  }

  const supabase = await createClient()

  // La phase et la date EN BASE font autorité, pas celles affichées par l'écran
  // (onglet périmé, second admin, POST direct — revue 2026-10-03, M4).
  const renc = verifierLecture(
    await supabase.from('rencontre').select('phase, date_rencontre').eq('id', id).maybeSingle(),
    'de la rencontre',
  )
  if (!renc) return { erreur: 'Rencontre introuvable.' }
  const courante = renc.phase as Phase
  const dateRencontre = renc.date_rencontre as string
  const aujourdhui = aujourdhuiISO()

  // Pas à pas entre phases adjacentes, sans saut (spec #3 R17).
  if (!peutTransiter(courante, phase as Phase, dateRencontre, aujourdhui)) {
    const labelCourante = PHASES.find((p) => p.value === courante)?.label ?? courante
    return {
      erreur: `La rencontre est en phase « ${labelCourante} » : ce changement de phase n'est plus possible. Rechargez la page.`,
    }
  }

  // Garde-fou « jour J » (spec #1 R5, rév. 2026-09-02) : l'entrée dans une phase
  // jour-J (préparation OU compétition) n'est permise que le jour de la
  // rencontre. La date fait autorité en base.
  if (estPhaseJourJ(phase as Phase) && !peutEntrerEnPhase(phase as Phase, dateRencontre, aujourdhui)) {
    const quoi = phase === 'preparation' ? 'La préparation' : 'La compétition'
    return {
      erreur: `${quoi} ne peut être activée que le jour de la rencontre.`,
    }
  }

  // Une seule transaction en base (lot 5, constats P7/J3/B2) : garde admin,
  // transition adjacente (R17) et jour J revérifiées sous verrou, mise à jour
  // conditionnée à la phase lue (deux admins ne passent pas la même
  // transition) et, au passage ③→④, NP automatique (spec #6 R18). Un échec
  // annule tout : la phase ne change jamais sans ses NP.
  const { error } = await supabase.rpc('changer_phase_rencontre', {
    p_rencontre: id,
    p_phase: phase,
  })
  if (error) {
    // Course perdue (second admin, changement de jour) : la base a changé depuis
    // la lecture ci-dessus ; le détail porte la phase en base.
    if (error.message === 'transition_refusee') {
      return {
        erreur: `La rencontre est en phase « ${libellePhase(error.details || courante)} » : ce changement de phase n'est plus possible. Rechargez la page.`,
      }
    }
    if (error.message === 'hors_jour_j') {
      const quoi = phase === 'preparation' ? 'La préparation' : 'La compétition'
      return { erreur: `${quoi} ne peut être activée que le jour de la rencontre.` }
    }
    if (error.message === 'non_admin') {
      return { erreur: 'Seul un administrateur peut gérer les rencontres.' }
    }
    if (error.message === 'rencontre_introuvable') return { erreur: 'Rencontre introuvable.' }
    // Trace serveur de l'erreur technique ; l'admin reçoit un message lisible.
    console.error('Changement de phase en échec', error)
    return { erreur: 'Le changement de phase a échoué. Réessayez.' }
  }

  // Deux surfaces pour la même action (spec #3 R41a) : la liste ET le tableau de
  // bord de la rencontre doivent refléter la nouvelle phase.
  revalidatePath('/admin/rencontres')
  revalidatePath(`/admin/rencontres/${id}`)
  const label = PHASES.find((p) => p.value === phase)?.label ?? phase
  return { succes: `Phase : ${label}.` }
}

export async function supprimerRencontre(
  _etatPrecedent: EtatRencontre,
  formData: FormData,
): Promise<EtatRencontre> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  const id = String(formData.get('id') ?? '')
  if (!id) return { erreur: 'Rencontre introuvable.' }

  const supabase = await createClient()
  const { error } = await supabase.from('rencontre').delete().eq('id', id)
  if (error) return { erreur: messageErreur(error.code, 'suppression') }

  revalidatePath('/admin/rencontres')
  return { succes: 'Rencontre supprimée.' }
}
