import 'server-only'

import { type Categorie, type Phase } from '@/domaine/rencontre'
import {
  getSaisieRencontre,
  type BlocConfig,
  type GrimpeurSaisie,
  type VoieOption,
} from '@/lib/coach/resultats'
import { createAdminClient } from '@/lib/supabase/admin'

// Assemblage de la saisie des résultats pour l'ADMIN (spec #9) : TOUS les clubs
// engagés d'une rencontre. Réutilise le loader coach `getSaisieRencontre` par club
// (sous session admin, la RLS `est_admin()` donne accès à tous les clubs) — même
// approche que `chargerEngagementTousClubs`. Le client `service_role` ne sert
// qu'à énumérer les clubs engagés (catalogue transverse, ADR 0002/0003).

/** Grimpeurs engagés d'un club, pour la liste maître (R10). */
export type SaisieClub = {
  clubId: string
  clubNom: string
  grimpeurs: GrimpeurSaisie[]
}

/** Saisie admin d'une rencontre : structure + grimpeurs regroupés par club. */
export type SaisieAdminRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  /** Vrai en ③ compétition OU ④ clôture : l'admin peut écrire (R5). */
  ouverteSaisie: boolean
  voiesEpreuve: VoieOption[]
  blocsConfig: BlocConfig[]
  clubs: SaisieClub[]
}

/**
 * Charge la saisie de tous les clubs d'une rencontre pour l'admin. Renvoie `null`
 * si la rencontre est introuvable. À appeler derrière la garde admin. Les clubs
 * sans grimpeur engagé sont omis.
 */
export async function getSaisieAdminRencontre(
  rencontreId: string,
): Promise<SaisieAdminRencontre | null> {
  const admin = createAdminClient()

  const { data: rencontre } = await admin
    .from('rencontre')
    .select('id, date_rencontre, categorie, phase')
    .eq('id', rencontreId)
    .maybeSingle()
  if (!rencontre) return null

  const phase = rencontre.phase as Phase

  // Clubs engagés (via leurs équipes), avec nom.
  const { data: equipes } = await admin
    .from('equipe')
    .select('club_id')
    .eq('rencontre_id', rencontreId)
  const clubIds = [...new Set((equipes ?? []).map((e) => e.club_id as string))]
  const nomClub = new Map<string, string>()
  if (clubIds.length) {
    const { data } = await admin.from('club').select('id, nom').in('id', clubIds)
    for (const c of data ?? []) nomClub.set(c.id as string, c.nom as string)
  }

  // Par club : réutilise le loader coach (session admin → RLS ouvre tous les clubs).
  let voiesEpreuve: VoieOption[] = []
  let blocsConfig: BlocConfig[] = []
  const clubs: SaisieClub[] = []
  for (const clubId of clubIds) {
    const saisie = await getSaisieRencontre(rencontreId, clubId)
    if (!saisie) continue
    // La structure (voies/blocs) est identique quel que soit le club.
    if (!voiesEpreuve.length) voiesEpreuve = saisie.voiesEpreuve
    if (!blocsConfig.length) blocsConfig = saisie.blocsConfig
    if (saisie.grimpeurs.length) {
      clubs.push({
        clubId,
        clubNom: nomClub.get(clubId) ?? '(club inconnu)',
        grimpeurs: saisie.grimpeurs,
      })
    }
  }
  clubs.sort((a, b) => a.clubNom.localeCompare(b.clubNom, 'fr'))

  return {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie: rencontre.categorie as Categorie,
    phase,
    ouverteSaisie: phase === 'competition' || phase === 'cloture',
    voiesEpreuve,
    blocsConfig,
    clubs,
  }
}
