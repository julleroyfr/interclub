'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import QRCode from 'qrcode'

import {
  construireUrlInvitation,
  creerInvitationCoach,
  InvitationCoachInvalideError,
  messageEchecCreationCompte,
  peutGererInvitation,
  validerInscriptionCoach,
} from '@/domaine/invitation-coach'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { cheminDeRetour } from '@/lib/chemin-retour'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

import { resoudreInvitation } from './invitations'
import type { InvitationVue } from './invitations'

/** Rafraîchit l'écran des clubs puis revient sur `chemin`. */
function retour(chemin: string): never {
  revalidatePath('/admin/clubs')
  redirect(chemin || '/admin/clubs')
}

/**
 * Génère l'invitation coach et la retourne directement (sans redirect) pour
 * afficher le QR inline dans l'écran admin. Utilisé avec `useActionState`.
 * Invalide le cache `/admin/clubs` pour que les prochains chargements soient frais.
 */
export async function genererInvitationInline(
  _prev: InvitationVue | null,
  formData: FormData,
): Promise<InvitationVue | null> {
  const utilisateur = await getUtilisateurCourant()
  if (!peutGererInvitation({ role: utilisateur?.role ?? null })) return null

  let domaine
  try {
    domaine = creerInvitationCoach({
      clubId: String(formData.get('clubId') ?? ''),
    })
  } catch (e) {
    if (e instanceof InvitationCoachInvalideError) return null
    throw e
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invitation_coach')
    .insert({ club_id: domaine.clubId })
    .select('id, club_id, valeur')
    .single()

  if (error || !data) return null

  revalidatePath('/admin/clubs')

  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const url = construireUrlInvitation(`${proto}://${host}`, data.valeur as string)
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })

  return {
    id: data.id as string,
    clubId: data.club_id as string,
    valeur: data.valeur as string,
    url,
    qrDataUrl,
  }
}

/**
 * Génère l'invitation coach permanent d'un club (R26, R28). Garde applicative
 * `peutGererInvitation` (admin) + validation du périmètre ; l'`insert` passe par
 * la RLS (client authenticated) — vraie frontière (policy admin R29), et l'index
 * unique partiel garantit « au plus une active par club » (R28).
 */
export async function genererInvitation(formData: FormData): Promise<void> {
  const chemin = cheminDeRetour(formData.get('chemin'), '/admin/clubs')
  const utilisateur = await getUtilisateurCourant()

  if (!peutGererInvitation({ role: utilisateur?.role ?? null })) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=refuse`)
  }

  let invitation
  try {
    invitation = creerInvitationCoach({
      clubId: String(formData.get('clubId') ?? ''),
    })
  } catch (e) {
    if (e instanceof InvitationCoachInvalideError) {
      redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=invalide`)
    }
    throw e
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invitation_coach')
    .insert({ club_id: invitation.clubId })
  if (error) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=generation`)
  }
  retour(chemin)
}

/** Lit une invitation via la RLS (null si non visible) et vérifie le droit. */
async function invitationGerable(invitationId: string) {
  const utilisateur = await getUtilisateurCourant()
  if (!peutGererInvitation({ role: utilisateur?.role ?? null })) return null

  const supabase = await createClient()
  const data = verifierLecture(
    await supabase
      .from('invitation_coach')
      .select('id, club_id')
      .eq('id', invitationId)
      .maybeSingle(),
    "de l'invitation",
  )
  return data ?? null
}

/** Révoque une invitation : elle devient inactive immédiatement (R29). */
export async function revoquerInvitation(formData: FormData): Promise<void> {
  const chemin = cheminDeRetour(formData.get('chemin'), '/admin/clubs')
  const invitationId = String(formData.get('invitationId') ?? '')

  if (!(await invitationGerable(invitationId))) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=refuse`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invitation_coach')
    .update({ actif: false })
    .eq('id', invitationId)
  if (error) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=revocation`)
  }
  retour(chemin)
}

/**
 * Régénère l'invitation d'un club (R29) : révoque l'ancienne PUIS crée une
 * nouvelle (valeur distincte via le défaut SQL). L'ordre importe : révoquer
 * d'abord libère l'index unique « une active par club » avant l'insert.
 */
export async function regenererInvitation(formData: FormData): Promise<void> {
  const chemin = cheminDeRetour(formData.get('chemin'), '/admin/clubs')
  const invitationId = String(formData.get('invitationId') ?? '')

  const invitation = await invitationGerable(invitationId)
  if (!invitation) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=refuse`)
  }

  const supabase = await createClient()
  const { error: eRevoke } = await supabase
    .from('invitation_coach')
    .update({ actif: false })
    .eq('id', invitationId)
  if (eRevoke) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=regeneration`)
  }

  const { error: eInsert } = await supabase
    .from('invitation_coach')
    .insert({ club_id: invitation.club_id })
  if (eInsert) {
    redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=regeneration`)
  }
  retour(chemin)
}

/** État renvoyé au formulaire d'inscription (pour `useActionState`). */
export type EtatInscription = { erreur?: string } | undefined

/**
 * Inscription d'un coach permanent via une invitation (R30–R33). Server Action
 * publique, gardée par la **validité de l'invitation** (pas par un rôle) :
 * 1. valide les identifiants (domaine) ;
 * 2. vérifie l'invitation **active** — sinon aucun compte n'est créé (R30, R33) ;
 * 3. crée le compte Supabase (email + mot de passe) ; un email déjà utilisé est
 *    refusé sans doublon (R32) ;
 * 4. crée le mapping coach du club via la RPC `finaliser_inscription_coach` (R31).
 *    En cas d'échec du mapping, on supprime le compte tout juste créé (fail-closed).
 * En cas de succès, redirige vers la connexion.
 */
export async function inscrireCoach(
  _etatPrecedent: EtatInscription,
  formData: FormData,
): Promise<EtatInscription> {
  const valeur = String(formData.get('invitation') ?? '')

  let identifiants
  try {
    identifiants = validerInscriptionCoach({
      email: String(formData.get('email') ?? ''),
      motDePasse: String(formData.get('motDePasse') ?? ''),
    })
  } catch (e) {
    if (e instanceof InvitationCoachInvalideError) return { erreur: e.message }
    throw e
  }

  // R30/R33 : l'invitation doit être active AVANT toute création de compte.
  const invitation = await resoudreInvitation(valeur)
  if (!invitation) {
    return { erreur: "Cette invitation n'est plus valide. Demandez-en une nouvelle." }
  }

  const admin = createAdminClient()
  const { data: cree, error: eCreate } = await admin.auth.admin.createUser({
    email: identifiants.email,
    password: identifiants.motDePasse,
    email_confirm: true,
  })
  if (eCreate || !cree?.user) {
    // R32 : seul un e-mail déjà associé à un compte invite à se connecter ; les
    // autres refus (mot de passe, panne) ont leur propre message (m6).
    return { erreur: messageEchecCreationCompte(eCreate?.code) }
  }

  const { error: eMapping } = await admin.rpc('finaliser_inscription_coach', {
    p_valeur: valeur,
    p_utilisateur_id: cree.user.id,
  })
  if (eMapping) {
    // Fail-closed : pas de mapping → pas de compte orphelin sans rôle (R33).
    await admin.auth.admin.deleteUser(cree.user.id)
    return { erreur: "L'inscription a échoué. Réessayez ou demandez une nouvelle invitation." }
  }

  redirect('/connexion?inscrit=1')
}
