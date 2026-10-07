import 'server-only'

import { cache } from 'react'

import { bornesAnneeNaissance, type Categorie } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'
import { lireToutesLesPages } from '@/lib/supabase/pagination'

// Grimpeurs éligibles à une catégorie pour une saison (spec #1 R34), TOUS clubs,
// triés par nom puis prénom. Partagé par les panneaux Prêts et Équipes du tableau
// de bord admin : mémoïsé sur la durée d'un rendu (`cache`), la lecture n'est
// faite qu'une fois même si les deux panneaux la demandent en parallèle.
// Lecture `service_role` (catalogue transverse, ADR 0002/0003) : réservée à
// l'admin.

export type GrimpeurEligible = {
  id: string
  nom: string
  prenom: string
  clubId: string
  anneeNaissance: number
}

export const lireGrimpeursEligibles = cache(
  async (categorie: Categorie, saison: number): Promise<GrimpeurEligible[]> => {
    await exigerLectureAdmin('grimpeurs éligibles')
    const admin = createAdminClient()
    const { min, max } = bornesAnneeNaissance(categorie, saison)
    const lignes = await lireToutesLesPages((debut, fin) => {
      let q = admin
        .from('grimpeur')
        .select('id, nom, prenom, club_id, annee_naissance')
        .gte('annee_naissance', min)
      if (max !== null) q = q.lte('annee_naissance', max)
      return q.order('nom').order('prenom').order('id').range(debut, fin)
    }, 'des grimpeurs éligibles')
    return lignes.map((g) => ({
      id: g.id as string,
      nom: g.nom as string,
      prenom: g.prenom as string,
      clubId: g.club_id as string,
      anneeNaissance: g.annee_naissance as number,
    }))
  },
)
