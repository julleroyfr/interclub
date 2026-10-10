import 'server-only'

import { cache } from 'react'

import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'

// Lectures communes aux panneaux du tableau de bord d'une rencontre admin
// (structure, prêts, équipes, contrôle) — lot 4 du plan « appels Supabase ».
// Mémoïsées sur la durée d'un rendu (`cache`) : chaque table n'est lue qu'une
// fois, même quand plusieurs panneaux la demandent en parallèle (la promesse
// est partagée). Lecture `service_role` (ADR 0002/0003) : réservée à l'admin.

/** Ligne brute d'une lecture PostgREST. */
type Ligne = Record<string, unknown>

/**
 * Rencontre (avec le nom de son club porteur embarqué en `club`), ou `null` si
 * introuvable.
 */
export const lireRencontreAdmin = cache(async (rencontreId: string): Promise<Ligne | null> => {
  await exigerLectureAdmin('rencontre')
  const admin = createAdminClient()
  return verifierLecture(
    await admin
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id, club:club_porteur_id(nom)')
      .eq('id', rencontreId)
      .maybeSingle(),
    'de la rencontre',
  )
})

/** Catalogue des clubs, trié par nom. */
export const lireClubsAdmin = cache(async (): Promise<Ligne[]> => {
  await exigerLectureAdmin('clubs')
  const admin = createAdminClient()
  return verifierLecture(await admin.from('club').select('id, nom').order('nom'), 'des clubs') ?? []
})

/** Prêts de la rencontre, grimpeur prêté embarqué (nom, club d'origine, âge). */
export const lirePretsAdmin = cache(async (rencontreId: string): Promise<Ligne[]> => {
  await exigerLectureAdmin('prêts de la rencontre')
  const admin = createAdminClient()
  return (
    verifierLecture(
      await admin
        .from('pret')
        .select(
          'rencontre_id, grimpeur_id, club_accueil_id, grimpeur:grimpeur_id(id, nom, prenom, club_id, annee_naissance)',
        )
        .eq('rencontre_id', rencontreId),
      'des prêts',
    ) ?? []
  )
})
