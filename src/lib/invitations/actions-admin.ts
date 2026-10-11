'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { peutGererInvitationAdmin } from '@/domaine/invitation-admin'
import {
  InvitationCoachInvalideError,
  messageEchecCreationCompte,
  validerInscriptionCoach,
} from '@/domaine/invitation-coach'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import type { EtatInscription } from './actions'
import { resoudreInvitationAdmin } from './invitations-admin'

const CHEMIN = '/admin/mapping'

/** Rafraîchit l'écran « Mapping de rôle » puis y revient (avec une erreur éventuelle). */
function retour(erreur?: string): never {
  revalidatePath(CHEMIN)
  redirect(erreur ? `${CHEMIN}?erreur=${erreur}` : CHEMIN)
}

/**
 * Génère une invitation administrateur (spec #2 R35–R37) : désactive d'abord
 * l'invitation active éventuelle (au plus une valable, R37), puis en crée une
 * nouvelle — valeur, échéance à 15 minutes : défauts SQL. Garde applicative
 * (admin) ; les écritures passent par la RLS (policies admin), vraie frontière.
 */
export async function genererInvitationAdmin(): Promise<void> {
  const utilisateur = await getUtilisateurCourant()
  if (!peutGererInvitationAdmin({ role: utilisateur?.role ?? null })) retour('refuse')

  const supabase = await createClient()
  const { error: eRevoke } = await supabase
    .from('invitation_admin')
    .update({ actif: false })
    .eq('actif', true)
  if (eRevoke) retour('generation')

  const { error: eInsert } = await supabase.from('invitation_admin').insert({})
  if (eInsert) retour('generation')
  retour()
}

/** Révoque l'invitation administrateur avant son expiration (R37). */
export async function revoquerInvitationAdmin(formData: FormData): Promise<void> {
  const utilisateur = await getUtilisateurCourant()
  if (!peutGererInvitationAdmin({ role: utilisateur?.role ?? null })) retour('refuse')

  const supabase = await createClient()
  const { error } = await supabase
    .from('invitation_admin')
    .update({ actif: false })
    .eq('id', String(formData.get('invitationId') ?? ''))
  if (error) retour('revocation')
  retour()
}

const MESSAGE_INVITATION_INVALIDE =
  "Cette invitation a expiré ou a déjà été utilisée. Demandez-en une nouvelle à l'administrateur."

/**
 * Inscription d'un administrateur via une invitation (R36, R38, R39). Server
 * Action publique, gardée par la **validité de l'invitation** (pas par un rôle) :
 * 1. valide les identifiants (domaine, mot de passe saisi deux fois) ;
 * 2. vérifie que l'invitation est valable — message clair avant toute création ;
 * 3. crée le compte Supabase ; un e-mail déjà utilisé est refusé (R32, R39) ;
 * 4. consomme l'invitation et crée le mapping admin en une opération (RPC
 *    `finaliser_inscription_admin`) : validité revérifiée À L'ENVOI (R39), une
 *    seule inscription par invitation (R38). En cas d'échec, le compte tout
 *    juste créé est supprimé (aucun compte sans rôle).
 */
export async function inscrireAdmin(
  _etatPrecedent: EtatInscription,
  formData: FormData,
): Promise<EtatInscription> {
  const valeur = String(formData.get('invitationAdmin') ?? '')

  let identifiants
  try {
    identifiants = validerInscriptionCoach({
      email: String(formData.get('email') ?? ''),
      motDePasse: String(formData.get('motDePasse') ?? ''),
      confirmationMotDePasse: String(formData.get('confirmationMotDePasse') ?? ''),
    })
  } catch (e) {
    if (e instanceof InvitationCoachInvalideError) return { erreur: e.message }
    throw e
  }

  if (!(await resoudreInvitationAdmin(valeur))) return { erreur: MESSAGE_INVITATION_INVALIDE }

  const admin = createAdminClient()
  const { data: cree, error: eCreate } = await admin.auth.admin.createUser({
    email: identifiants.email,
    password: identifiants.motDePasse,
    email_confirm: true,
  })
  if (eCreate || !cree?.user) {
    return { erreur: messageEchecCreationCompte(eCreate?.code) }
  }

  const { error: eMapping } = await admin.rpc('finaliser_inscription_admin', {
    p_valeur: valeur,
    p_utilisateur_id: cree.user.id,
  })
  if (eMapping) {
    // Fail-closed : invitation consommée entre-temps ou expirée → pas de compte orphelin.
    await admin.auth.admin.deleteUser(cree.user.id)
    return { erreur: MESSAGE_INVITATION_INVALIDE }
  }

  redirect('/connexion?inscrit=1')
}
