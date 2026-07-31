import 'server-only'

import { headers } from 'next/headers'
import QRCode from 'qrcode'

import { construireUrlScan } from '@/domaine/session-qr'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** Rencontre affichée dans les écrans de jetons. */
export type RencontreVue = {
  id: string
  date: string
  categorie: string
  phase: string
  clubPorteurNom: string | null
}

/** Club pour lequel un jeton coach temporaire peut être généré (R19 spec #2). */
export type ClubEngage = { id: string; nom: string }

/** Voie de vitesse d'une rencontre (périmètre d'un jeton juge). */
export type VoieVue = { id: string; numero: number }

/** Jeton actif prêt à afficher (avec son QR encodé en data URL). */
export type JetonVue = {
  id: string
  nature: 'coach_temporaire' | 'juge'
  clubId: string | null
  voieVitesseId: string | null
  valeur: string
  qrDataUrl: string
}

/** Encode la valeur d'un jeton en QR (data URL PNG), généré côté serveur. */
async function versJetonVue(row: {
  id: string
  nature: 'coach_temporaire' | 'juge'
  club_id: string | null
  voie_vitesse_id: string | null
  valeur: string
}): Promise<JetonVue> {
  // Encode l'URL de scan complète (T5d, ADR 0003). Le host est lu depuis les
  // en-têtes HTTP : fonctionne en local, preview Netlify et prod sans config.
  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const contenu = construireUrlScan(`${proto}://${host}`, row.valeur)
  const qrDataUrl = await QRCode.toDataURL(contenu, { margin: 1, width: 240 })
  return {
    id: row.id,
    nature: row.nature,
    clubId: row.club_id,
    voieVitesseId: row.voie_vitesse_id,
    valeur: row.valeur,
    qrDataUrl,
  }
}

function unNom(club: unknown): string | null {
  const c = Array.isArray(club) ? club[0] : club
  return (c as { nom?: string } | null)?.nom ?? null
}

/** Toutes les rencontres (écran admin). Lecture catalogue via service_role. */
export async function listerRencontres(): Promise<RencontreVue[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rencontre')
    .select('id, date_rencontre, categorie, phase, club:club_porteur_id (nom)')
    .order('date_rencontre', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date_rencontre as string,
    categorie: r.categorie as string,
    phase: r.phase as string,
    clubPorteurNom: unNom(r.club),
  }))
}

/** Rencontres où `clubId` est engagé (écran coach). Scopé en code par club. */
export async function listerRencontresDuClub(
  clubId: string,
): Promise<RencontreVue[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rencontre')
    .select(
      'id, date_rencontre, categorie, phase, club:club_porteur_id (nom), equipe!inner (club_id)',
    )
    .eq('equipe.club_id', clubId)
    .order('date_rencontre', { ascending: false })
  if (error) throw error
  // `equipe!inner` peut dupliquer une rencontre (plusieurs équipes) : on déduplique.
  const parId = new Map<string, RencontreVue>()
  for (const r of data ?? []) {
    parId.set(r.id as string, {
      id: r.id as string,
      date: r.date_rencontre as string,
      categorie: r.categorie as string,
      phase: r.phase as string,
      clubPorteurNom: unNom(r.club),
    })
  }
  return [...parId.values()]
}

/**
 * Tous les clubs de la compétition — périmètre des jetons coach temporaire
 * (R19 spec #2). Tous les clubs sont proposés, qu'ils aient ou non des équipes
 * enregistrées pour la rencontre.
 */
export async function listerClubsEngages(): Promise<ClubEngage[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('club')
    .select('id, nom')
    .order('nom')
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id as string, nom: c.nom as string }))
}

/** Voies de vitesse d'une rencontre. */
export async function listerVoies(rencontreId: string): Promise<VoieVue[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('voie_vitesse')
    .select('id, numero')
    .eq('rencontre_id', rencontreId)
    .order('numero')
  if (error) throw error
  return (data ?? []).map((v) => ({ id: v.id as string, numero: v.numero as number }))
}

/**
 * Jetons ACTIFS d'une rencontre visibles par l'appelant, lus via la RLS
 * (`authenticated`) : l'admin voit tout, le coach voit les `coach_temporaire` de
 * son club. Retourne des vues prêtes à afficher (QR encodé).
 */
export async function listerJetonsActifs(
  rencontreId: string,
): Promise<JetonVue[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jeton_qr')
    .select('id, nature, club_id, voie_vitesse_id, valeur')
    .eq('rencontre_id', rencontreId)
    .eq('actif', true)
  if (error) throw error
  return Promise.all((data ?? []).map(versJetonVue))
}
