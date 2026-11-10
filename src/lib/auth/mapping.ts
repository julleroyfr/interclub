import 'server-only'

import { type RoleApplicatif } from '@/domaine/mapping-de-role'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'

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

/** Ligne renvoyée par la RPC `lister_comptes_permanents`. */
type CompteLu = { utilisateur_id: string; email: string | null; role: RoleApplicatif | null; club_nom: string | null }

/**
 * Charge le contexte de l'écran de mapping (comptes permanents, clubs, mappings
 * existants). Lecture via le client **service_role** : `auth.users` et le
 * catalogue `club` ne sont pas accessibles en RLS `authenticated` (cf. ADR 0002,
 * T6). À n'appeler que derrière une garde admin.
 *
 * Les comptes viennent de la RPC `lister_comptes_permanents` : la base exclut
 * les comptes anonymes des sessions QR (R46), joint le mapping et le club, et
 * trie par e-mail — sans le plafond d'une page `listUsers` (constat J6).
 */
export async function chargerContexteMapping(): Promise<ContexteMapping> {
  await exigerLectureAdmin('mapping des comptes')
  const admin = createAdminClient()

  const [comptesRes, clubsRes] = await Promise.all([
    lireToutesLesPages<CompteLu>(
      (debut, fin) => admin.rpc('lister_comptes_permanents').range(debut, fin),
      'des comptes permanents',
    ),
    admin.from('club').select('id, nom').order('nom'),
  ])
  const clubsLus = verifierLecture(clubsRes, 'des clubs') ?? []

  const listeComptes: CompteListe[] = comptesRes.map((c) => ({
    utilisateurId: c.utilisateur_id,
    email: c.email,
    role: c.role,
    clubNom: c.club_nom,
  }))
  const comptes: CompteSupabase[] = listeComptes.map((c) => ({ id: c.utilisateurId, email: c.email }))
  const clubs: ClubOption[] = clubsLus.map((c) => ({ id: c.id as string, nom: c.nom as string }))

  return { comptes, clubs, listeComptes }
}

/** État renvoyé au formulaire de mapping (pour `useActionState`). */
export type EtatMapping = { erreur?: string; succes?: string } | undefined
