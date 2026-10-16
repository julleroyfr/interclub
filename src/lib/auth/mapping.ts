import 'server-only'

import { comptesPermanents, type RoleApplicatif } from '@/domaine/mapping-de-role'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'

/** Compte Supabase existant, cible potentielle d'un mapping. */
export type CompteSupabase = { id: string; email: string | null }

/** Club sélectionnable pour un mapping coach. */
export type ClubOption = { id: string; nom: string }

/**
 * Compte permanent listé à l'écran, avec son mapping s'il en a un (`role` null =
 * sans rôle, R5). Base de l'action « Supprimer » (spec #2 R46).
 */
export type CompteListe = {
  utilisateurId: string
  email: string | null
  role: RoleApplicatif | null
  clubNom: string | null
}

/** Données nécessaires à l'écran d'administration du mapping. */
export type ContexteMapping = {
  comptes: CompteSupabase[]
  clubs: ClubOption[]
  listeComptes: CompteListe[]
}

/**
 * Charge le contexte de l'écran de mapping (comptes Supabase, clubs, mappings
 * existants). Lecture via le client **service_role** : la liste des comptes
 * (`auth.admin`) et le catalogue `club` ne sont pas accessibles en RLS
 * `authenticated` (cf. ADR 0002, T6). À n'appeler que derrière une garde admin.
 */
export async function chargerContexteMapping(): Promise<ContexteMapping> {
  await exigerLectureAdmin('mapping des comptes')
  const admin = createAdminClient()

  const [comptesRes, clubsRes, mappingsRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('club').select('id, nom').order('nom'),
    admin.from('compte').select('utilisateur_id, role, club:club_id (nom)'),
  ])

  if (comptesRes.error) throw comptesRes.error
  if (clubsRes.error) throw clubsRes.error
  if (mappingsRes.error) throw mappingsRes.error

  // Les comptes anonymes des sessions QR ne sont pas des comptes permanents :
  // ni listés, ni proposés à l'attribution (R46).
  const comptes: CompteSupabase[] = comptesPermanents(comptesRes.data.users)

  const clubs: ClubOption[] = (clubsRes.data ?? []).map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
  }))

  const mappingParId = new Map((mappingsRes.data ?? []).map((m) => {
    // `club:club_id (nom)` : jointure to-one — un objet (ou null pour un admin).
    // Selon la version du client, une jointure peut être typée/renvoyée en
    // tableau : on aplati les deux formes.
    const brut = m.club as
      | { nom: string }
      | { nom: string }[]
      | null
    const club = Array.isArray(brut) ? (brut[0] ?? null) : brut
    return [
      m.utilisateur_id as string,
      { role: m.role as RoleApplicatif, clubNom: club?.nom ?? null },
    ] as const
  }))

  const listeComptes: CompteListe[] = comptes
    .map((c) => ({
      utilisateurId: c.id,
      email: c.email,
      role: mappingParId.get(c.id)?.role ?? null,
      clubNom: mappingParId.get(c.id)?.clubNom ?? null,
    }))
    .sort((a, b) => (a.email ?? a.utilisateurId).localeCompare(b.email ?? b.utilisateurId))

  return { comptes, clubs, listeComptes }
}

/** État renvoyé au formulaire de mapping (pour `useActionState`). */
export type EtatMapping = { erreur?: string; succes?: string } | undefined
