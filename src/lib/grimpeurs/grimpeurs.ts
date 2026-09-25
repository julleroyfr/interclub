import 'server-only'

import type { Sexe } from '@/domaine/grimpeur'
import { createClient } from '@/lib/supabase/server'

/** Option de club pour le formulaire de grimpeur. */
export type OptionClub = { id: string; nom: string }

/** Grimpeur listé pour l'écran de paramétrage, avec club et dépendances. */
export type GrimpeurAvecDependances = {
  id: string
  nom: string
  prenom: string
  anneeNaissance: number
  sexe: Sexe
  licence: number
  clubId: string
  clubNom: string
  nbEngagements: number
}

/** Liste les clubs (id, nom) pour alimenter le sélecteur de club. */
export async function listerClubsOptions(): Promise<OptionClub[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('club').select('id, nom').order('nom')
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id as string, nom: c.nom as string }))
}

/** Nombre de grimpeurs affichés par page (pagination server-side, spec #3 R26). */
export const GRIMPEURS_PAR_PAGE = 50

/** Une page de résultats du roster + le total (tous grimpeurs correspondants). */
export type PageGrimpeurs = {
  grimpeurs: GrimpeurAvecDependances[]
  total: number
}

/**
 * Recherche paginée du roster (spec #3 R26) via la RPC `rechercher_grimpeurs` :
 * le filtre nom/prénom (insensible casse+accents, multi-termes) s'applique à
 * **tout** le roster côté base, PUIS la page est découpée — la recherche porte
 * donc sur l'ensemble des grimpeurs, pas seulement la page courante. Tri par nom
 * puis prénom. `total` = nombre total de grimpeurs correspondant à la recherche
 * (pour la pagination). L'admin voit tout le roster (RLS). À appeler derrière la
 * garde admin de l'écran.
 */
export async function rechercherGrimpeurs(
  recherche: string,
  page: number,
): Promise<PageGrimpeurs> {
  const supabase = await createClient()
  const pageSure = Math.max(1, Math.floor(page) || 1)

  const { data, error } = await supabase.rpc('rechercher_grimpeurs', {
    p_recherche: recherche ?? '',
    p_limit: GRIMPEURS_PAR_PAGE,
    p_offset: (pageSure - 1) * GRIMPEURS_PAR_PAGE,
  })
  if (error) throw error

  const lignes = (data ?? []) as Array<{
    id: string
    nom: string
    prenom: string
    annee_naissance: number
    sexe: Sexe
    licence: number
    club_id: string
    club_nom: string | null
    nb_engagements: number | string
    total: number | string
  }>

  return {
    grimpeurs: lignes.map((l) => ({
      id: l.id,
      nom: l.nom,
      prenom: l.prenom,
      anneeNaissance: l.annee_naissance,
      sexe: l.sexe,
      licence: l.licence,
      clubId: l.club_id,
      clubNom: l.club_nom ?? '(club inconnu)',
      nbEngagements: Number(l.nb_engagements),
    })),
    total: lignes.length > 0 ? Number(lignes[0].total) : 0,
  }
}

/** État renvoyé aux formulaires de grimpeur (pour `useActionState`). */
export type EtatGrimpeur = { erreur?: string; succes?: string } | undefined
