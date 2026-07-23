'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  creerJetonQr,
  peutGererJeton,
  type Acteur,
  type NatureJeton,
} from '@/domaine/jeton-qr'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/** Rafraîchit les deux écrans de jetons puis revient sur `chemin`. */
function retour(chemin: string): never {
  revalidatePath('/admin/jetons')
  revalidatePath('/coach/jetons')
  redirect(chemin || '/')
}

async function acteurCourant(): Promise<Acteur> {
  const u = await getUtilisateurCourant()
  return { role: u?.role ?? null, clubId: u?.clubId ?? null }
}

/**
 * Génère un jeton QR pour un périmètre donné (R15–R17). Garde applicative
 * `peutGererJeton` + validation du périmètre `creerJetonQr` ; l'`insert` passe
 * par la RLS (client authenticated) — vraie frontière (policies R15/R16), et les
 * index uniques garantissent R18/R19 (un seul jeton actif par voie / club).
 */
export async function genererJeton(formData: FormData): Promise<void> {
  const chemin = String(formData.get('chemin') ?? '/')
  const acteur = await acteurCourant()
  const nature = String(formData.get('nature') ?? '') as NatureJeton
  const clubId = (formData.get('clubId') as string | null) || null
  const voieVitesseId = (formData.get('voieVitesseId') as string | null) || null

  if (!peutGererJeton(acteur, { nature, clubId })) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=refuse`)
  }

  const perimetre = creerJetonQr({
    rencontreId: String(formData.get('rencontreId') ?? ''),
    nature,
    clubId,
    voieVitesseId,
  })

  const supabase = await createClient()
  const { error } = await supabase.from('jeton_qr').insert({
    rencontre_id: perimetre.rencontreId,
    nature: perimetre.nature,
    club_id: perimetre.clubId,
    voie_vitesse_id: perimetre.voieVitesseId,
  })
  if (error) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=generation`)
  }
  retour(chemin)
}

/** Lit un jeton via la RLS (null si non visible) et vérifie le droit de gestion. */
async function jetonGerable(jetonId: string, acteur: Acteur) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('jeton_qr')
    .select('id, nature, club_id')
    .eq('id', jetonId)
    .maybeSingle()
  if (!data) return null
  const cible = { nature: data.nature as NatureJeton, clubId: data.club_id as string | null }
  return peutGererJeton(acteur, cible) ? data : null
}

/** Révoque un jeton : il devient inactif immédiatement (R22). */
export async function revoquerJeton(formData: FormData): Promise<void> {
  const chemin = String(formData.get('chemin') ?? '/')
  const jetonId = String(formData.get('jetonId') ?? '')
  const acteur = await acteurCourant()

  if (!(await jetonGerable(jetonId, acteur))) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=refuse`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('jeton_qr')
    .update({ actif: false })
    .eq('id', jetonId)
  if (error) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=revocation`)
  }
  retour(chemin)
}

/**
 * Régénère un jeton (R23) : révoque l'ancien PUIS crée un nouveau jeton de même
 * périmètre (valeur distincte via le défaut SQL). L'ordre importe : révoquer
 * d'abord libère l'index unique « un actif par voie / club » avant l'insert.
 */
export async function regenererJeton(formData: FormData): Promise<void> {
  const chemin = String(formData.get('chemin') ?? '/')
  const jetonId = String(formData.get('jetonId') ?? '')
  const acteur = await acteurCourant()

  const jeton = await jetonGerable(jetonId, acteur)
  if (!jeton) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=refuse`)
  }

  const supabase = await createClient()
  const { data: ancien, error: eRead } = await supabase
    .from('jeton_qr')
    .select('rencontre_id, nature, club_id, voie_vitesse_id')
    .eq('id', jetonId)
    .single()
  if (eRead || !ancien) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=regeneration`)
  }

  const { error: eRevoke } = await supabase
    .from('jeton_qr')
    .update({ actif: false })
    .eq('id', jetonId)
  if (eRevoke) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=regeneration`)
  }

  const { error: eInsert } = await supabase.from('jeton_qr').insert({
    rencontre_id: ancien.rencontre_id,
    nature: ancien.nature,
    club_id: ancien.club_id,
    voie_vitesse_id: ancien.voie_vitesse_id,
  })
  if (eInsert) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=regeneration`)
  }
  retour(chemin)
}
