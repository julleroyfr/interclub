'use server'

import { revalidatePath } from 'next/cache'

import {
  creerMappingDeRole,
  MappingDeRoleInvalideError,
  type RoleApplicatif,
  SuppressionCompteRefuseeError,
  verifierSuppressionCompte,
} from '@/domaine/mapping-de-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { type EtatMapping } from './mapping'
import { getUtilisateurCourant } from './session'

/**
 * Attribue (ou met à jour) le rôle applicatif d'un compte permanent, et son club
 * pour un coach (spec #2 R4). Server Action : joignable par POST direct, on ne se
 * fie pas à l'UI.
 *
 * Défense en profondeur : on vérifie ici que l'appelant est admin (message
 * clair), MAIS la vraie frontière reste la **RLS** — l'`upsert` passe par le
 * client `authenticated`, et les policies « admin crée/modifie un mapping »
 * (R4) rejetteraient l'écriture d'un non-admin de toute façon.
 */
export async function attribuerMapping(
  _etatPrecedent: EtatMapping,
  formData: FormData,
): Promise<EtatMapping> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut attribuer un rôle.' }
  }

  let mapping
  try {
    mapping = creerMappingDeRole({
      utilisateurId: String(formData.get('utilisateurId') ?? ''),
      role: String(formData.get('role') ?? '') as RoleApplicatif,
      clubId: (formData.get('clubId') as string | null) || null,
    })
  } catch (e) {
    if (e instanceof MappingDeRoleInvalideError) return { erreur: e.message }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase.from('compte').upsert(
    {
      utilisateur_id: mapping.utilisateurId,
      role: mapping.role,
      club_id: mapping.clubId,
    },
    { onConflict: 'utilisateur_id' },
  )

  if (error) {
    return { erreur: "L'attribution a échoué. Réessayez." }
  }

  // Le mapping courant a pu changer : rafraîchir l'écran (liste + session).
  revalidatePath('/admin/mapping')
  revalidatePath('/', 'layout')
  return { succes: 'Rôle attribué.' }
}

/**
 * Supprime **définitivement** un compte permanent (spec #2 R41–R45). Server
 * Action : joignable par POST direct, l'autorisation est revérifiée ici.
 *
 * Seul cas d'écriture via `service_role` de l'écran (ADR 0005, exceptions) : la
 * suppression d'un compte Supabase Auth n'existe que dans l'API d'administration
 * Auth. La garde est donc ici, AVANT tout appel : demandeur admin et cible
 * différente de lui-même (`verifierSuppressionCompte`). La base fait le reste
 * (R43, R44) : mapping et sessions QR supprimés en cascade, auteurs des saisies
 * passés à `null`.
 */
export async function supprimerCompte(
  _etatPrecedent: EtatMapping,
  formData: FormData,
): Promise<EtatMapping> {
  const utilisateur = await getUtilisateurCourant()

  let cibleId
  try {
    cibleId = verifierSuppressionCompte({
      demandeur: utilisateur ? { id: utilisateur.id, role: utilisateur.role } : null,
      cibleId: String(formData.get('utilisateurId') ?? ''),
    })
  } catch (e) {
    if (e instanceof SuppressionCompteRefuseeError) return { erreur: e.message }
    throw e
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(cibleId)
  if (error) {
    // Compte déjà supprimé (deux admins en même temps) ou identifiant inconnu (R45).
    if (error.status === 404) {
      return { erreur: 'Compte introuvable : il a peut-être déjà été supprimé.' }
    }
    return { erreur: 'La suppression a échoué. Réessayez.' }
  }

  revalidatePath('/admin/mapping')
  return { succes: 'Compte supprimé.' }
}
