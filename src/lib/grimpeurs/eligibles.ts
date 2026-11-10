import 'server-only'

import { cache } from 'react'

import { bornesAnneeNaissance, type Categorie } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { lireBornesAge } from '@/lib/rencontres/bornes-age'
import { createAdminClient } from '@/lib/supabase/admin'
import { lireToutesLesPages } from '@/lib/supabase/pagination'

// Grimpeurs éligibles à une catégorie pour une saison (spec #1 R34), TOUS clubs,
// triés par nom puis prénom. En ado, les surclassés de la saison s'ajoutent à la
// tranche d'âge (spec #21 R7, R9). Partagé par les panneaux Prêts et Équipes du tableau
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
  /** Vrai si éligible au titre d'un surclassement actif de la saison (spec #21). */
  surclasse: boolean
}

export const lireGrimpeursEligibles = cache(
  async (categorie: Categorie, saison: number): Promise<GrimpeurEligible[]> => {
    await exigerLectureAdmin('grimpeurs éligibles')
    const admin = createAdminClient()
    const { min, max } = bornesAnneeNaissance(categorie, saison, lireBornesAge())
    const [lignes, surclasses] = await Promise.all([
      lireToutesLesPages((debut, fin) => {
        let q = admin.from('grimpeur').select('id, nom, prenom, club_id, annee_naissance')
        // Bornes `null` = sans borne (adulte : pas de borne basse, spec #20 R2).
        if (min !== null) q = q.gte('annee_naissance', min)
        if (max !== null) q = q.lte('annee_naissance', max)
        return q.order('nom').order('prenom').order('id').range(debut, fin)
      }, 'des grimpeurs éligibles'),
      // Le surclassement n'ouvre que l'ado (spec #21 R8).
      categorie === 'ado'
        ? lireToutesLesPages(
            (debut, fin) =>
              admin
                .from('surclassement')
                .select('grimpeur:grimpeur_id!inner(id, nom, prenom, club_id, annee_naissance)')
                .eq('saison', saison)
                .is('revoque_le', null)
                .order('id')
                .range(debut, fin),
            'des grimpeurs surclassés',
          )
        : Promise.resolve([]),
    ])
    const versEligible = (g: Record<string, unknown>, surclasse: boolean): GrimpeurEligible => ({
      id: g.id as string,
      nom: g.nom as string,
      prenom: g.prenom as string,
      clubId: g.club_id as string,
      anneeNaissance: g.annee_naissance as number,
      surclasse,
    })
    const parAge = lignes.map((g) => versEligible(g, false))
    const dejaLus = new Set(parAge.map((g) => g.id))
    const parSurclassement = surclasses
      .map((s) => (Array.isArray(s.grimpeur) ? s.grimpeur[0] : s.grimpeur) as Record<string, unknown> | null)
      .filter((g): g is Record<string, unknown> => !!g && !dejaLus.has(g.id as string))
      .map((g) => versEligible(g, true))
    if (parSurclassement.length === 0) return parAge
    return [...parAge, ...parSurclassement].sort(
      (a, b) =>
        a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom) || a.id.localeCompare(b.id),
    )
  },
)
