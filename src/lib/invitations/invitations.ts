import 'server-only'

import { headers } from 'next/headers'
import QRCode from 'qrcode'

import { construireUrlInvitation } from '@/domaine/invitation-coach'
import { createAdminClient } from '@/lib/supabase/admin'

/** Invitation active d'un club, prête à afficher (QR + URL). */
export type InvitationVue = {
  id: string
  clubId: string
  valeur: string
  url: string
  qrDataUrl: string
}

/** Invitation résolue pour l'écran d'inscription public (R30). */
export type InvitationResolue = { clubId: string; clubNom: string | null }

/** Motif uuid — évite une requête `.eq('valeur', …)` sur une valeur non uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function unNom(club: unknown): string | null {
  const c = Array.isArray(club) ? club[0] : club
  return (c as { nom?: string } | null)?.nom ?? null
}

/** Encode l'URL d'invitation en QR (data URL PNG), côté serveur (cf. jetons). */
async function versInvitationVue(row: {
  id: string
  club_id: string
  valeur: string
}): Promise<InvitationVue> {
  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const url = construireUrlInvitation(`${proto}://${host}`, row.valeur)
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })
  return { id: row.id, clubId: row.club_id, valeur: row.valeur, url, qrDataUrl }
}

/**
 * Invitations ACTIVES indexées par club (écran admin). Lecture via service_role :
 * la table n'est pas ouverte en RLS `authenticated` autrement que pour l'admin,
 * et l'écran des clubs lit déjà le catalogue en service_role (cf. ADR 0002).
 */
export async function listerInvitationsActives(): Promise<
  Map<string, InvitationVue>
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invitation_coach')
    .select('id, club_id, valeur')
    .eq('actif', true)
  if (error) throw error

  const parClub = new Map<string, InvitationVue>()
  for (const row of data ?? []) {
    parClub.set(
      row.club_id as string,
      await versInvitationVue({
        id: row.id as string,
        club_id: row.club_id as string,
        valeur: row.valeur as string,
      }),
    )
  }
  return parClub
}

/**
 * Résout une invitation par sa valeur pour l'écran d'inscription public (R30) :
 * renvoie le club rattaché si l'invitation est **active**, sinon `null`
 * (révoquée / inexistante ⇒ aucune inscription, R30, R33). service_role : la
 * valeur n'est jamais lisible côté client.
 */
export async function resoudreInvitation(
  valeur: string,
): Promise<InvitationResolue | null> {
  if (!UUID.test(valeur)) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invitation_coach')
    .select('club_id, club:club_id (nom)')
    .eq('valeur', valeur)
    .eq('actif', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { clubId: data.club_id as string, clubNom: unNom(data.club) }
}
