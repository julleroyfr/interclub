import 'server-only'

import { anneeSaison, type Categorie } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { lireGrimpeursEligibles } from '@/lib/grimpeurs/eligibles'
import { lireClubsAdmin, lirePretsAdmin, lireRencontreAdmin } from '@/lib/rencontres/lectures-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'

// Écran admin de gestion des prêts (spec #1 R35). Lecture des catalogues
// (rencontres, grimpeurs, clubs, prêts) via le client **service_role** — non
// ouverts en RLS `authenticated` (cf. ADR 0002/0003). À n'appeler que derrière
// une garde admin ; l'écriture, elle, passe par la RLS (client authenticated).

export type GrimpeurOption = { id: string; prenom: string; nom: string; clubId: string }
export type ClubOption = { id: string; nom: string }

export type PretExistant = {
  rencontreId: string
  grimpeurId: string
  grimpeurNom: string
  clubOrigineNom: string
  clubAccueilNom: string
}

/** Contexte du panneau « Prêts » d'UNE rencontre (rencontre implicite). */
export type ContextePretsRencontre = {
  grimpeurs: GrimpeurOption[]
  clubs: ClubOption[]
  prets: PretExistant[]
}

export type EtatPret = { erreur?: string; succes?: string } | undefined

/**
 * Charge le contexte du panneau de prêts d'une rencontre (grimpeurs, clubs, prêts
 * de cette rencontre) via `service_role`. À n'appeler que derrière une garde admin.
 */
export async function chargerPretsRencontre(
  rencontreId: string,
): Promise<ContextePretsRencontre> {
  await exigerLectureAdmin('prêts de la rencontre')
  const admin = createAdminClient()

  // Rencontre, clubs et prêts : lectures partagées avec les autres panneaux du
  // tableau de bord (mémoïsées sur le rendu, lot 4 du plan « appels Supabase »).
  // Le grimpeur de chaque prêt est embarqué : son nom ne dépend pas de la
  // lecture (filtrée par catégorie) des grimpeurs prêtables ci-dessous.
  const [rencontre, clubsLus, pretsLus, compoRes] = await Promise.all([
    lireRencontreAdmin(rencontreId),
    lireClubsAdmin(),
    lirePretsAdmin(rencontreId),
    // Grimpeurs déjà engagés (toutes équipes) dans cette rencontre : indisponibles
    // au prêt (un grimpeur ne joue que pour une équipe/rencontre, R14).
    admin.from('composition').select('grimpeur_id').eq('rencontre_id', rencontreId),
  ])
  const composLues = verifierLecture(compoRes, 'des compositions') ?? []

  // Catégorie de la rencontre : on ne propose au prêt que les grimpeurs éligibles
  // à cette tranche d'âge (R34). Lecture partagée avec le panneau Équipes.
  const grimpeursLus = rencontre
    ? await lireGrimpeursEligibles(
        rencontre.categorie as Categorie,
        anneeSaison(rencontre.date_rencontre as string),
      )
    : []

  // Grimpeurs indisponibles au prêt : déjà engagés (R14) OU déjà prêtés.
  const indisponibles = new Set<string>([
    ...composLues.map((c) => c.grimpeur_id as string),
    ...pretsLus.map((p) => p.grimpeur_id as string),
  ])

  const nomClub = new Map<string, string>(
    clubsLus.map((c) => [c.id as string, c.nom as string]),
  )

  const clubs: ClubOption[] = clubsLus.map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
  }))

  const grimpeurs: GrimpeurOption[] = grimpeursLus
    .filter((g) => !indisponibles.has(g.id))
    .map((g) => ({ id: g.id, prenom: g.prenom, nom: g.nom, clubId: g.clubId }))

  const prets: PretExistant[] = pretsLus.map((p) => {
    const brut = p.grimpeur as unknown
    const g = (Array.isArray(brut) ? brut[0] : brut) as
      | { nom: string; prenom: string; club_id: string }
      | null
      | undefined
    return {
      rencontreId: p.rencontre_id as string,
      grimpeurId: p.grimpeur_id as string,
      grimpeurNom: g ? `${g.prenom} ${g.nom}` : '?',
      clubOrigineNom: g ? (nomClub.get(g.club_id) ?? '?') : '?',
      clubAccueilNom: nomClub.get(p.club_accueil_id as string) ?? '?',
    }
  })

  return { grimpeurs, clubs, prets }
}
