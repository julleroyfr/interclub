import 'server-only'

import { anneeSaison, bornesSaison, type Phase } from '@/domaine/rencontre'
import { nomEmbarque } from '@/lib/supabase/embarque'
import { verifierLecture } from '@/lib/supabase/lecture'
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

  // Une vague ; tous les compteurs sont faits par la base (`count`), seules les
  // 5 dernières rencontres de la saison sont lues, club porteur embarqué.
  const compter = { count: 'exact', head: true } as const
  const [clubsRes, rencontresRes, competitionRes, grimpRes, rencSaisonRes] = await Promise.all([
    supabase.from('club').select('id', compter),
    supabase.from('rencontre').select('id', compter),
    supabase.from('rencontre').select('id', compter).eq('phase', 'competition'),
    supabase.from('grimpeur').select('id', compter),
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club:club_porteur_id(nom)', { count: 'exact' })
      .gte('date_rencontre', bornes.debut)
      .lte('date_rencontre', bornes.fin)
      .order('date_rencontre', { ascending: false })
      .limit(5),
  ])
  verifierLecture(clubsRes, 'des clubs')
  verifierLecture(rencontresRes, 'des rencontres')
  verifierLecture(competitionRes, 'des rencontres en compétition')
  verifierLecture(grimpRes, 'des grimpeurs')
  const cinqDernieres: RencontreTdb[] = (verifierLecture(rencSaisonRes, 'des rencontres de la saison') ?? []).map(
    (r) => ({
      id: r.id as string,
      dateRencontre: r.date_rencontre as string,
      categorie: r.categorie as string,
      phase: r.phase as Phase,
      clubPorteurNom: nomEmbarque(r.club) ?? '(club inconnu)',
    }),
  )

  return {
    stats: {
      nbClubs: clubsRes.count ?? 0,
      nbRencontres: rencontresRes.count ?? 0,
      nbGrimpeurs: grimpRes.count ?? 0,
      nbRencontresEnCompetition: competitionRes.count ?? 0,
    },
    rencontres: cinqDernieres,
    totalRencontres: rencSaisonRes.count ?? 0,
    saison,
  }
}
