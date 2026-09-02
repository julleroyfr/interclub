import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Écran admin de gestion des prêts (spec #1 R35). Lecture des catalogues
// (rencontres, grimpeurs, clubs, prêts) via le client **service_role** — non
// ouverts en RLS `authenticated` (cf. ADR 0002/0003). À n'appeler que derrière
// une garde admin ; l'écriture, elle, passe par la RLS (client authenticated).

export type GrimpeurOption = { id: string; nom: string; clubId: string }
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
  const admin = createAdminClient()

  const [clubsRes, grimpeursRes, pretsRes] = await Promise.all([
    admin.from('club').select('id, nom').order('nom'),
    admin.from('grimpeur').select('id, nom, prenom, club_id').order('nom').order('prenom'),
    admin
      .from('pret')
      .select('rencontre_id, grimpeur_id, club_accueil_id')
      .eq('rencontre_id', rencontreId),
  ])
  if (clubsRes.error) throw clubsRes.error
  if (grimpeursRes.error) throw grimpeursRes.error
  if (pretsRes.error) throw pretsRes.error

  const nomClub = new Map<string, string>(
    (clubsRes.data ?? []).map((c) => [c.id as string, c.nom as string]),
  )

  const clubs: ClubOption[] = (clubsRes.data ?? []).map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
  }))

  const infoGrimpeur = new Map<string, { nom: string; clubId: string }>()
  const grimpeurs: GrimpeurOption[] = (grimpeursRes.data ?? []).map((g) => {
    const nomComplet = `${g.prenom as string} ${g.nom as string}`
    infoGrimpeur.set(g.id as string, { nom: nomComplet, clubId: g.club_id as string })
    return { id: g.id as string, nom: nomComplet, clubId: g.club_id as string }
  })

  const prets: PretExistant[] = (pretsRes.data ?? []).map((p) => {
    const g = infoGrimpeur.get(p.grimpeur_id as string)
    return {
      rencontreId: p.rencontre_id as string,
      grimpeurId: p.grimpeur_id as string,
      grimpeurNom: g?.nom ?? '?',
      clubOrigineNom: g ? (nomClub.get(g.clubId) ?? '?') : '?',
      clubAccueilNom: nomClub.get(p.club_accueil_id as string) ?? '?',
    }
  })

  return { grimpeurs, clubs, prets }
}
