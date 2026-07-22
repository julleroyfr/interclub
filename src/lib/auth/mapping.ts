import 'server-only'

import { type RoleApplicatif } from '@/domaine/mapping-de-role'
import { createAdminClient } from '@/lib/supabase/admin'

/** Compte Supabase existant, cible potentielle d'un mapping. */
export type CompteSupabase = { id: string; email: string | null }

/** Club sélectionnable pour un mapping coach. */
export type ClubOption = { id: string; nom: string }

/** Mapping déjà attribué, pour affichage. */
export type MappingExistant = {
  utilisateurId: string
  email: string | null
  role: RoleApplicatif
  clubNom: string | null
}

/** Données nécessaires à l'écran d'administration du mapping. */
export type ContexteMapping = {
  comptes: CompteSupabase[]
  clubs: ClubOption[]
  mappings: MappingExistant[]
}

/**
 * Charge le contexte de l'écran de mapping (comptes Supabase, clubs, mappings
 * existants). Lecture via le client **service_role** : la liste des comptes
 * (`auth.admin`) et le catalogue `club` ne sont pas accessibles en RLS
 * `authenticated` (cf. ADR 0002, T6). À n'appeler que derrière une garde admin.
 */
export async function chargerContexteMapping(): Promise<ContexteMapping> {
  const admin = createAdminClient()

  const [comptesRes, clubsRes, mappingsRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('club').select('id, nom').order('nom'),
    admin.from('compte').select('utilisateur_id, role, club:club_id (nom)'),
  ])

  if (comptesRes.error) throw comptesRes.error
  if (clubsRes.error) throw clubsRes.error
  if (mappingsRes.error) throw mappingsRes.error

  const emailParId = new Map(
    comptesRes.data.users.map((u) => [u.id, u.email ?? null]),
  )

  const comptes: CompteSupabase[] = comptesRes.data.users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
  }))

  const clubs: ClubOption[] = (clubsRes.data ?? []).map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
  }))

  const mappings: MappingExistant[] = (mappingsRes.data ?? []).map((m) => {
    // `club:club_id (nom)` : jointure to-one — un objet (ou null pour un admin).
    // Selon la version du client, une jointure peut être typée/renvoyée en
    // tableau : on aplati les deux formes.
    const brut = m.club as
      | { nom: string }
      | { nom: string }[]
      | null
    const club = Array.isArray(brut) ? (brut[0] ?? null) : brut
    return {
      utilisateurId: m.utilisateur_id as string,
      email: emailParId.get(m.utilisateur_id as string) ?? null,
      role: m.role as RoleApplicatif,
      clubNom: club?.nom ?? null,
    }
  })

  return { comptes, clubs, mappings }
}

/** État renvoyé au formulaire de mapping (pour `useActionState`). */
export type EtatMapping = { erreur?: string; succes?: string } | undefined
