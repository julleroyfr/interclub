import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** Option de club pour le formulaire de grimpeur. */
export type OptionClub = { id: string; nom: string }

/** Grimpeur listé pour l'écran de paramétrage, avec club et dépendances. */
export type GrimpeurAvecDependances = {
  id: string
  nom: string
  prenom: string
  anneeNaissance: number
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

/**
 * Liste les grimpeurs (triés par club, nom, prénom) avec le nom du club et le
 * nombre d'engagements en composition — pour informer la suppression
 * (`composition`/`resultat`/`temps_vitesse` référencent le grimpeur en
 * `on delete cascade` : la suppression emporterait ces enregistrements).
 * Lecture via le client `authenticated` ; l'admin voit tout le roster. À
 * appeler derrière la garde admin de l'écran.
 */
export async function listerGrimpeurs(): Promise<GrimpeurAvecDependances[]> {
  const supabase = await createClient()

  const [grimpRes, clubsRes, compRes] = await Promise.all([
    supabase
      .from('grimpeur')
      .select('id, nom, prenom, annee_naissance, club_id')
      .order('nom')
      .order('prenom'),
    supabase.from('club').select('id, nom'),
    supabase.from('composition').select('grimpeur_id'),
  ])

  if (grimpRes.error) throw grimpRes.error
  if (clubsRes.error) throw clubsRes.error
  if (compRes.error) throw compRes.error

  const nomParClub = new Map<string, string>()
  for (const c of clubsRes.data ?? []) {
    nomParClub.set(c.id as string, c.nom as string)
  }

  const parGrimpeur = new Map<string, number>()
  for (const r of compRes.data ?? []) {
    const id = r.grimpeur_id as string
    parGrimpeur.set(id, (parGrimpeur.get(id) ?? 0) + 1)
  }

  return (grimpRes.data ?? [])
    .map((g) => {
      const clubId = g.club_id as string
      return {
        id: g.id as string,
        nom: g.nom as string,
        prenom: g.prenom as string,
        anneeNaissance: g.annee_naissance as number,
        clubId,
        clubNom: nomParClub.get(clubId) ?? '(club inconnu)',
        nbEngagements: parGrimpeur.get(g.id as string) ?? 0,
      }
    })
    .sort((a, b) => a.clubNom.localeCompare(b.clubNom, 'fr'))
}

/** État renvoyé aux formulaires de grimpeur (pour `useActionState`). */
export type EtatGrimpeur = { erreur?: string; succes?: string } | undefined
