import 'server-only'

import { anneeSaison, bornesAnneeNaissance, type Categorie } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'

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

  const [rencRes, clubsRes, pretsRes, compoRes] = await Promise.all([
    admin.from('rencontre').select('categorie, date_rencontre').eq('id', rencontreId).maybeSingle(),
    admin.from('club').select('id, nom').order('nom'),
    // Le grimpeur de chaque prêt est embarqué : son nom ne dépend pas de la
    // lecture (filtrée par catégorie) des grimpeurs prêtables ci-dessous.
    admin
      .from('pret')
      .select('rencontre_id, grimpeur_id, club_accueil_id, grimpeur:grimpeur_id(nom, prenom, club_id)')
      .eq('rencontre_id', rencontreId),
    // Grimpeurs déjà engagés (toutes équipes) dans cette rencontre : indisponibles
    // au prêt (un grimpeur ne joue que pour une équipe/rencontre, R14).
    admin.from('composition').select('grimpeur_id').eq('rencontre_id', rencontreId),
  ])
  const rencontre = verifierLecture(rencRes, 'de la rencontre')
  const clubsLus = verifierLecture(clubsRes, 'des clubs') ?? []
  const pretsLus = verifierLecture(pretsRes, 'des prêts') ?? []
  const composLues = verifierLecture(compoRes, 'des compositions') ?? []

  // Catégorie de la rencontre : on ne propose au prêt que les grimpeurs éligibles
  // à cette tranche d'âge (R34) — filtrée dès la lecture, paginée car le fichier
  // des licenciés dépasse le plafond de lignes d'une réponse de l'API.
  const bornes = rencontre
    ? bornesAnneeNaissance(
        rencontre.categorie as Categorie,
        anneeSaison(rencontre.date_rencontre as string),
      )
    : null
  const grimpeursLus = await lireToutesLesPages((debut, fin) => {
    let q = admin.from('grimpeur').select('id, nom, prenom, club_id')
    if (bornes) {
      q = q.gte('annee_naissance', bornes.min)
      if (bornes.max !== null) q = q.lte('annee_naissance', bornes.max)
    }
    return q.order('nom').order('prenom').order('id').range(debut, fin)
  }, 'des grimpeurs')

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
    .filter((g) => !indisponibles.has(g.id as string))
    .map((g) => ({
      id: g.id as string,
      prenom: g.prenom as string,
      nom: g.nom as string,
      clubId: g.club_id as string,
    }))

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
