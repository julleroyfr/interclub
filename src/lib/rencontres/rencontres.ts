import 'server-only'

import type { Categorie, Phase } from '@/domaine/rencontre'
import { createClient } from '@/lib/supabase/server'

/** Option de club porteur pour le formulaire de rencontre. */
export type OptionClub = { id: string; nom: string }

/** Rencontre listée pour l'écran de paramétrage, avec club porteur et dépendances. */
export type RencontreAvecDependances = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurId: string
  clubPorteurNom: string
  nbEquipes: number
  nbEpreuves: number
}

/** Liste les clubs (id, nom) pour alimenter le sélecteur de club porteur. */
export async function listerClubsOptions(): Promise<OptionClub[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('club').select('id, nom').order('nom')
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id as string, nom: c.nom as string }))
}

/**
 * Liste les rencontres (les plus récentes d'abord) avec le nom du club porteur
 * et le nombre d'équipes/épreuves rattachées — pour informer la suppression
 * (`equipe`/`epreuve` référencent la rencontre en `on delete cascade` : la
 * suppression emporterait ces enregistrements). Lecture via le client
 * `authenticated` ; l'admin voit tout. À appeler derrière la garde admin.
 */
export async function listerRencontres(): Promise<RencontreAvecDependances[]> {
  const supabase = await createClient()

  const [rencRes, clubsRes, eqRes, epRes] = await Promise.all([
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id')
      .order('date_rencontre', { ascending: false }),
    supabase.from('club').select('id, nom'),
    supabase.from('equipe').select('rencontre_id'),
    supabase.from('epreuve').select('rencontre_id'),
  ])

  if (rencRes.error) throw rencRes.error
  if (clubsRes.error) throw clubsRes.error
  if (eqRes.error) throw eqRes.error
  if (epRes.error) throw epRes.error

  const nomParClub = new Map<string, string>()
  for (const c of clubsRes.data ?? []) {
    nomParClub.set(c.id as string, c.nom as string)
  }

  const tally = (rows: Array<Record<string, unknown>>) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const id = r.rencontre_id as string
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }
  const parEquipe = tally(eqRes.data ?? [])
  const parEpreuve = tally(epRes.data ?? [])

  return (rencRes.data ?? []).map((r) => {
    const id = r.id as string
    const clubId = r.club_porteur_id as string
    return {
      id,
      dateRencontre: r.date_rencontre as string,
      categorie: r.categorie as Categorie,
      phase: r.phase as Phase,
      clubPorteurId: clubId,
      clubPorteurNom: nomParClub.get(clubId) ?? '(club inconnu)',
      nbEquipes: parEquipe.get(id) ?? 0,
      nbEpreuves: parEpreuve.get(id) ?? 0,
    }
  })
}

/** État renvoyé aux formulaires de rencontre (pour `useActionState`). */
export type EtatRencontre = { erreur?: string; succes?: string } | undefined
