import 'server-only'

import { anneeSaison, type Phase } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { lireGrimpeursEligibles } from '@/lib/grimpeurs/eligibles'
import { lireClubsAdmin, lireRencontreAdmin } from '@/lib/rencontres/lectures-admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

// Équipes d'une rencontre ADULTE pour l'écran admin (spec #20 R10–R15) : équipes
// sans club, composées de grimpeurs de tous les clubs. Lecture sous session admin
// (RLS `est_admin()`) ; catalogue des clubs et roster éligible en service_role
// (ADR 0002/0003), comme le panneau d'engagement enfant/ado.

export type MembreAdulte = {
  grimpeurId: string
  nom: string
  prenom: string
  clubNom: string
}

export type EquipeAdulte = {
  id: string
  nom: string
  membres: MembreAdulte[]
}

/** Grimpeur éligible (16 ans et plus) proposé à l'ajout, tous clubs (R2, R11). */
export type GrimpeurAdulteOption = {
  id: string
  nom: string
  prenom: string
  clubNom: string
  /** Vrai s'il est déjà composé dans une équipe de la rencontre (R13). */
  engage: boolean
}

export type EquipesAdultesRencontre = {
  rencontreId: string
  phase: Phase
  equipes: EquipeAdulte[]
  roster: GrimpeurAdulteOption[]
}

/**
 * Charge les équipes adultes et le roster éligible d'une rencontre. Renvoie
 * `null` si la rencontre n'existe pas ou n'est pas de catégorie adulte.
 */
export async function chargerEquipesAdultes(
  rencontreId: string,
): Promise<EquipesAdultesRencontre | null> {
  await exigerLectureAdmin('équipes adultes')
  const supabase = await createClient()

  const [rencontre, clubs, equipesRes] = await Promise.all([
    lireRencontreAdmin(rencontreId),
    lireClubsAdmin(),
    supabase
      .from('equipe')
      .select('id, nom, composition(grimpeur_id, grimpeur:grimpeur_id(nom, prenom, club_id))')
      .eq('rencontre_id', rencontreId)
      .is('club_id', null)
      .order('nom'),
  ])
  if (!rencontre || rencontre.categorie !== 'adulte') return null

  const roster = await lireGrimpeursEligibles('adulte', anneeSaison(rencontre.date_rencontre as string))
  const nomClub = new Map<string, string>(clubs.map((c) => [c.id as string, c.nom as string]))

  const engages = new Set<string>()
  const equipes: EquipeAdulte[] = (verifierLecture(equipesRes, 'des équipes') ?? []).map((e) => {
    const compo = (e.composition as Record<string, unknown>[] | null) ?? []
    const membres = compo
      .map((c) => {
        const g = premier(c.grimpeur)
        engages.add(c.grimpeur_id as string)
        return {
          grimpeurId: c.grimpeur_id as string,
          nom: (g?.nom as string) ?? '',
          prenom: (g?.prenom as string) ?? '',
          clubNom: nomClub.get(g?.club_id as string) ?? '',
        }
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'))
    return { id: e.id as string, nom: e.nom as string, membres }
  })

  return {
    rencontreId,
    phase: rencontre.phase as Phase,
    equipes,
    roster: roster.map((g) => ({
      id: g.id,
      nom: g.nom,
      prenom: g.prenom,
      clubNom: nomClub.get(g.clubId) ?? '',
      engage: engages.has(g.id),
    })),
  }
}

/** Relation embarquée : objet ou tableau selon l'inférence du client. */
function premier(v: unknown): Record<string, unknown> | null {
  const x = Array.isArray(v) ? v[0] : v
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}
