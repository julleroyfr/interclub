import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Écran admin de gestion des prêts (spec #1 R35). Lecture des catalogues
// (rencontres, grimpeurs, clubs, prêts) via le client **service_role** — non
// ouverts en RLS `authenticated` (cf. ADR 0002/0003). À n'appeler que derrière
// une garde admin ; l'écriture, elle, passe par la RLS (client authenticated).

export type RencontreOption = { id: string; label: string }
export type GrimpeurOption = { id: string; label: string; clubId: string }
export type ClubOption = { id: string; nom: string }

export type PretExistant = {
  rencontreId: string
  grimpeurId: string
  rencontreLabel: string
  grimpeurNom: string
  clubOrigineNom: string
  clubAccueilNom: string
}

export type ContextePrets = {
  rencontres: RencontreOption[]
  grimpeurs: GrimpeurOption[]
  clubs: ClubOption[]
  prets: PretExistant[]
}

export type EtatPret = { erreur?: string; succes?: string } | undefined

const CATEGORIES_COURT: Record<string, string> = { enfant: 'Enfant', ado: 'Ado' }

/** Date ISO (AAAA-MM-JJ) → jj/mm/aaaa, sans dérive de fuseau. */
function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  return a && m && j ? `${j}/${m}/${a}` : iso
}

/**
 * Charge le contexte de l'écran de prêts (rencontres, grimpeurs, clubs, prêts
 * existants) via `service_role`. À n'appeler que derrière une garde admin.
 */
export async function chargerContextePrets(): Promise<ContextePrets> {
  const admin = createAdminClient()

  const [clubsRes, rencontresRes, grimpeursRes, pretsRes] = await Promise.all([
    admin.from('club').select('id, nom').order('nom'),
    admin
      .from('rencontre')
      .select('id, date_rencontre, categorie, club_porteur_id')
      .order('date_rencontre', { ascending: false }),
    admin.from('grimpeur').select('id, nom, prenom, club_id').order('nom').order('prenom'),
    admin.from('pret').select('rencontre_id, grimpeur_id, club_accueil_id'),
  ])
  if (clubsRes.error) throw clubsRes.error
  if (rencontresRes.error) throw rencontresRes.error
  if (grimpeursRes.error) throw grimpeursRes.error
  if (pretsRes.error) throw pretsRes.error

  const nomClub = new Map<string, string>(
    (clubsRes.data ?? []).map((c) => [c.id as string, c.nom as string]),
  )

  const clubs: ClubOption[] = (clubsRes.data ?? []).map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
  }))

  const labelRencontre = new Map<string, string>()
  const rencontres: RencontreOption[] = (rencontresRes.data ?? []).map((r) => {
    const cat = CATEGORIES_COURT[r.categorie as string] ?? (r.categorie as string)
    const label = `${formaterDate(r.date_rencontre as string)} — ${nomClub.get(r.club_porteur_id as string) ?? '?'} (${cat})`
    labelRencontre.set(r.id as string, label)
    return { id: r.id as string, label }
  })

  const infoGrimpeur = new Map<string, { nom: string; clubId: string }>()
  const grimpeurs: GrimpeurOption[] = (grimpeursRes.data ?? []).map((g) => {
    const nomComplet = `${g.prenom as string} ${g.nom as string}`
    infoGrimpeur.set(g.id as string, { nom: nomComplet, clubId: g.club_id as string })
    return {
      id: g.id as string,
      label: `${nomComplet} — ${nomClub.get(g.club_id as string) ?? '?'}`,
      clubId: g.club_id as string,
    }
  })

  const prets: PretExistant[] = (pretsRes.data ?? []).map((p) => {
    const g = infoGrimpeur.get(p.grimpeur_id as string)
    return {
      rencontreId: p.rencontre_id as string,
      grimpeurId: p.grimpeur_id as string,
      rencontreLabel: labelRencontre.get(p.rencontre_id as string) ?? '?',
      grimpeurNom: g?.nom ?? '?',
      clubOrigineNom: g ? (nomClub.get(g.clubId) ?? '?') : '?',
      clubAccueilNom: nomClub.get(p.club_accueil_id as string) ?? '?',
    }
  })

  return { rencontres, grimpeurs, clubs, prets }
}
