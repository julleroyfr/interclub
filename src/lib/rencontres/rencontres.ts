import 'server-only'

import { anneeSaison, bornesSaison, type Categorie, type Phase } from '@/domaine/rencontre'
import { compteEmbarque, nomEmbarque } from '@/lib/supabase/embarque'
import { createClient } from '@/lib/supabase/server'

/** Option de club porteur pour le formulaire de rencontre. */
export type OptionClub = { id: string; nom: string }

/** Rencontre listée pour l'écran de paramétrage, avec club porteur et dépendances. */
export type RencontreAvecDependances = {
  id: string
  dateRencontre: string
  saison: number
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
 * Liste les rencontres d'une saison (les plus récentes d'abord) avec le nom
 * du club porteur et le nombre d'équipes/épreuves rattachées (R27, R28 spec #3).
 * Par défaut filtre sur la saison de `aujourdhui` ; passer `saison` pour une
 * autre saison. À appeler derrière la garde admin.
 */
export async function listerRencontres(options: {
  aujourdhui: string
  saison?: number
}): Promise<RencontreAvecDependances[]> {
  const supabase = await createClient()
  const annee = options.saison ?? anneeSaison(options.aujourdhui)
  const bornes = bornesSaison(annee)

  // Une requête : club porteur embarqué, équipes et épreuves comptées par la
  // base (une lecture des lignes, toutes saisons, serait plafonnée à 1000).
  const { data, error } = await supabase
    .from('rencontre')
    .select(
      'id, date_rencontre, categorie, phase, club_porteur_id, club:club_porteur_id(nom), equipe(count), epreuve(count)',
    )
    .gte('date_rencontre', bornes.debut)
    .lte('date_rencontre', bornes.fin)
    .order('date_rencontre', { ascending: false })
  if (error) throw error

  return (data ?? []).map((r) => {
    const dateRencontre = r.date_rencontre as string
    return {
      id: r.id as string,
      dateRencontre,
      saison: anneeSaison(dateRencontre),
      categorie: r.categorie as Categorie,
      phase: r.phase as Phase,
      clubPorteurId: r.club_porteur_id as string,
      clubPorteurNom: nomEmbarque(r.club) ?? '(club inconnu)',
      nbEquipes: compteEmbarque(r.equipe),
      nbEpreuves: compteEmbarque(r.epreuve),
    }
  })
}

/** État renvoyé aux formulaires de rencontre (pour `useActionState`). */
export type EtatRencontre = { erreur?: string; succes?: string } | undefined
