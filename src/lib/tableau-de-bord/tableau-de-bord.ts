import 'server-only'

import { anneeSaison, bornesSaison, type Phase } from '@/domaine/rencontre'
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
  saison: number
}

/**
 * Charge les données du tableau de bord admin.
 * - Bandeau stats : compteurs globaux (tous clubs, tous grimpeurs, toutes rencontres).
 * - Carte Rencontres : les 5 plus récentes de la saison courante (R10 spec #4).
 * @param aujourdhui date du jour au format AAAA-MM-JJ (injectée pour la testabilité).
 */
export async function chargerTableauDeBord(aujourdhui: string): Promise<DonneesTdb> {
  const supabase = await createClient()
  const saison = anneeSaison(aujourdhui)
  const bornes = bornesSaison(saison)

  const [clubsRes, toutesRencRes, rencSaisonRes, grimpRes] = await Promise.all([
    supabase.from('club').select('id, nom').order('nom'),
    supabase.from('rencontre').select('id, phase'),
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id')
      .gte('date_rencontre', bornes.debut)
      .lte('date_rencontre', bornes.fin)
      .order('date_rencontre', { ascending: false }),
    supabase.from('grimpeur').select('id'),
  ])

  if (clubsRes.error) throw clubsRes.error
  if (toutesRencRes.error) throw toutesRencRes.error
  if (rencSaisonRes.error) throw rencSaisonRes.error
  if (grimpRes.error) throw grimpRes.error

  const nomParClub = new Map<string, string>()
  for (const c of clubsRes.data ?? []) {
    nomParClub.set(c.id as string, c.nom as string)
  }

  const rencSaison = rencSaisonRes.data ?? []
  const cinqDernieres: RencontreTdb[] = rencSaison.slice(0, 5).map((r) => ({
    id: r.id as string,
    dateRencontre: r.date_rencontre as string,
    categorie: r.categorie as string,
    phase: r.phase as Phase,
    clubPorteurNom: nomParClub.get(r.club_porteur_id as string) ?? '(club inconnu)',
  }))

  const toutesRencontres = toutesRencRes.data ?? []
  const nbRencontresEnCompetition = toutesRencontres.filter(
    (r) => r.phase === 'competition',
  ).length

  return {
    stats: {
      nbClubs: (clubsRes.data ?? []).length,
      nbRencontres: toutesRencontres.length,
      nbGrimpeurs: (grimpRes.data ?? []).length,
      nbRencontresEnCompetition,
    },
    rencontres: cinqDernieres,
    totalRencontres: rencSaison.length,
    saison,
  }
}
