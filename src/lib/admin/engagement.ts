import 'server-only'

import { getEngagementRencontre, type EngagementRencontre } from '@/lib/coach/engagement'
import { createAdminClient } from '@/lib/supabase/admin'

// Engagement de TOUS les clubs d'une rencontre, pour l'écran admin (spec #1 R10).
// Réutilise le loader coach par club : sous session admin, la RLS `est_admin()`
// donne accès à tous les clubs. Le catalogue `club` est lu en service_role
// (ADR 0002/0003).

export type EngagementClub = {
  clubId: string
  clubNom: string
  engagement: EngagementRencontre
}

/** Charge l'engagement de chaque club pour la rencontre (équipes + roster). */
export async function chargerEngagementTousClubs(
  rencontreId: string,
): Promise<EngagementClub[]> {
  const admin = createAdminClient()
  const { data: clubs, error } = await admin.from('club').select('id, nom').order('nom')
  if (error) throw error

  const resultats: EngagementClub[] = []
  for (const c of clubs ?? []) {
    const clubId = c.id as string
    const engagement = await getEngagementRencontre(rencontreId, clubId)
    if (engagement) {
      resultats.push({ clubId, clubNom: c.nom as string, engagement })
    }
  }
  return resultats
}
