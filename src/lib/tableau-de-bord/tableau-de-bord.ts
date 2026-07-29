import 'server-only'

import type { Phase } from '@/domaine/rencontre'
import { createClient } from '@/lib/supabase/server'

export type StatsTdb = {
  nbClubs: number
  nbRencontres: number
  nbGrimpeurs: number
  nbRencontresEnCompetition: number
}

export type RencontreTdb = {
  id: string
  dateRencontre: string
  categorie: string
  phase: Phase
  clubPorteurNom: string
}

export type DonneesTdb = {
  stats: StatsTdb
  rencontres: RencontreTdb[]
  totalRencontres: number
}

/**
 * Charge les données du tableau de bord admin : bandeau de stats et les 5
 * rencontres les plus récentes (triées par date décroissante). À appeler
 * derrière la garde admin de la page.
 */
export async function chargerTableauDeBord(): Promise<DonneesTdb> {
  const supabase = await createClient()

  const [clubsRes, rencRes, grimpRes] = await Promise.all([
    supabase.from('club').select('id, nom').order('nom'),
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id')
      .order('date_rencontre', { ascending: false }),
    supabase.from('grimpeur').select('id'),
  ])

  if (clubsRes.error) throw clubsRes.error
  if (rencRes.error) throw rencRes.error
  if (grimpRes.error) throw grimpRes.error

  const nomParClub = new Map<string, string>()
  for (const c of clubsRes.data ?? []) {
    nomParClub.set(c.id as string, c.nom as string)
  }

  const toutesRencontres = rencRes.data ?? []
  const nbRencontresEnCompetition = toutesRencontres.filter(
    (r) => r.phase === 'competition',
  ).length

  const cinqDernieres: RencontreTdb[] = toutesRencontres.slice(0, 5).map((r) => ({
    id: r.id as string,
    dateRencontre: r.date_rencontre as string,
    categorie: r.categorie as string,
    phase: r.phase as Phase,
    clubPorteurNom: nomParClub.get(r.club_porteur_id as string) ?? '(club inconnu)',
  }))

  return {
    stats: {
      nbClubs: (clubsRes.data ?? []).length,
      nbRencontres: toutesRencontres.length,
      nbGrimpeurs: (grimpRes.data ?? []).length,
      nbRencontresEnCompetition,
    },
    rencontres: cinqDernieres,
    totalRencontres: toutesRencontres.length,
  }
}
