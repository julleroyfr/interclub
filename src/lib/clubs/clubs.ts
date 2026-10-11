import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** Club listé pour l'écran de paramétrage, avec ses dépendances (info suppression). */
export type ClubAvecDependances = {
  id: string
  nom: string
  nbRencontres: number
  nbGrimpeurs: number
}

/**
 * Liste les clubs (triés par nom) avec le nombre de rencontres portées et de
 * grimpeurs rattachés — pour informer la suppression (une rencontre référence
 * son club porteur en `on delete restrict` : la suppression échouerait). Lecture
 * via le client `authenticated` (RLS) : `club`/`rencontre` sont lisibles, et
 * l'admin voit tous les `grimpeur` (policy `est_admin()`). À appeler derrière la
 * garde admin de l'écran.
 */
export async function listerClubs(): Promise<ClubAvecDependances[]> {
  const supabase = await createClient()

  const [clubsRes, rencRes, grimpRes] = await Promise.all([
    supabase.from('club').select('id, nom').order('nom'),
    supabase.from('rencontre').select('club_porteur_id'),
    supabase.from('grimpeur').select('club_id'),
  ])

  if (clubsRes.error) throw clubsRes.error
  if (rencRes.error) throw rencRes.error
  if (grimpRes.error) throw grimpRes.error

  const tally = (rows: Array<Record<string, unknown>>, cle: string) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const id = r[cle] as string
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }

  const parRencontre = tally(rencRes.data ?? [], 'club_porteur_id')
  const parGrimpeur = tally(grimpRes.data ?? [], 'club_id')

  return (clubsRes.data ?? []).map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
    nbRencontres: parRencontre.get(c.id as string) ?? 0,
    nbGrimpeurs: parGrimpeur.get(c.id as string) ?? 0,
  }))
}

/** État renvoyé aux formulaires de club (pour `useActionState`). */
export type EtatClub = { erreur?: string; succes?: string } | undefined
