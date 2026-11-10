import 'server-only'

import { compteEmbarque } from '@/lib/supabase/embarque'
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

  // Compteurs agrégés côté base (count embarqué PostgREST, équivalent d'un
  // `left join … group by`) : une seule requête, et pas de lecture des lignes
  // `grimpeur`, qui serait plafonnée à 1000.
  const { data, error } = await supabase
    .from('club')
    .select('id, nom, rencontre(count), grimpeur(count)')
    .order('nom')
  if (error) throw error

  return (data ?? []).map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
    nbRencontres: compteEmbarque(c.rencontre),
    nbGrimpeurs: compteEmbarque(c.grimpeur),
  }))
}

/** État renvoyé aux formulaires de club (pour `useActionState`). */
export type EtatClub = { erreur?: string; succes?: string } | undefined
