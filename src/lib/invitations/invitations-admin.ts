import 'server-only'

import { headers } from 'next/headers'
import QRCode from 'qrcode'

import {
  construireUrlInvitationAdmin,
  etatInvitationAdmin,
  type EtatInvitationAdmin,
} from '@/domaine/invitation-admin'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'

/** Dernière invitation administrateur, prête à afficher (spec #2 R40). */
export type InvitationAdminVue = {
  id: string
  etat: EtatInvitationAdmin
  /** Échéance (ISO) : sert au décompte du temps restant. */
  expireLe: string
  /** Heure du serveur au chargement (ISO) : recale l'horloge du navigateur. */
  heureServeur: string
  /** QR et URL : seulement tant que l'invitation est valable (R36). */
  url: string | null
  qrDataUrl: string | null
}

/** Motif uuid — évite une requête `.eq('valeur', …)` sur une valeur non uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LigneInvitationAdmin = {
  id: string
  valeur: string
  actif: boolean
  expire_le: string
  utilisee_le: string | null
}

const etatDe = (ligne: LigneInvitationAdmin, maintenant: Date) =>
  etatInvitationAdmin(
    {
      actif: ligne.actif,
      expireLe: new Date(ligne.expire_le),
      utiliseeLe: ligne.utilisee_le ? new Date(ligne.utilisee_le) : null,
    },
    maintenant,
  )

/**
 * Dernière invitation administrateur générée, avec son état (R40) ; `null` si
 * aucune. Lecture via service_role derrière la garde admin (ADR 0005), comme le
 * reste de l'écran « Mapping de rôle ».
 */
export async function chargerInvitationAdmin(): Promise<InvitationAdminVue | null> {
  await exigerLectureAdmin('invitation administrateur')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invitation_admin')
    .select('id, valeur, actif, expire_le, utilisee_le')
    .order('cree_le', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const ligne = data as LigneInvitationAdmin
  const maintenant = new Date()
  const etat = etatDe(ligne, maintenant)

  let url: string | null = null
  let qrDataUrl: string | null = null
  if (etat === 'valable') {
    const hdrs = await headers()
    const host = hdrs.get('host') ?? 'localhost:3000'
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    url = construireUrlInvitationAdmin(`${proto}://${host}`, ligne.valeur)
    qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })
  }

  return {
    id: ligne.id,
    etat,
    expireLe: ligne.expire_le,
    heureServeur: maintenant.toISOString(),
    url,
    qrDataUrl,
  }
}

/**
 * L'invitation administrateur de valeur `valeur` est-elle valable (R36) ?
 * Résolution pour l'écran d'inscription public : service_role, la valeur n'est
 * jamais lisible côté client. La validité est revérifiée à la consommation
 * (RPC `finaliser_inscription_admin`, R39).
 */
export async function resoudreInvitationAdmin(valeur: string): Promise<boolean> {
  if (!UUID.test(valeur)) return false

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invitation_admin')
    .select('id, valeur, actif, expire_le, utilisee_le')
    .eq('valeur', valeur)
    .maybeSingle()
  if (error) throw error
  if (!data) return false
  return etatDe(data as LigneInvitationAdmin, new Date()) === 'valable'
}
