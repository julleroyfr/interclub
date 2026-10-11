import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Carte, EnTetePage } from '@/composants'
import { redirigerSiConnecte } from '@/lib/auth/session'
import { resoudreInvitation } from '@/lib/invitations/invitations'
import { resoudreInvitationAdmin } from '@/lib/invitations/invitations-admin'

import { FormulaireInscription } from './formulaire-inscription'

export const metadata: Metadata = {
  title: 'Inscription — Interclub',
}

export default async function PageInscription({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string; invitation_admin?: string }>
}) {
  // Déjà connecté avec un rôle → renvoi vers son espace (R8).
  await redirigerSiConnecte()

  const { invitation: valeur, invitation_admin: valeurAdmin } = await searchParams

  // Invitation administrateur (R35–R39) : valable ⇒ formulaire ; utilisée,
  // expirée ou révoquée ⇒ aucune inscription.
  if (valeurAdmin !== undefined) {
    const valable = await resoudreInvitationAdmin(valeurAdmin)
    return (
      <Cadre>
        {valable ? (
          <>
            <EnTetePage
              titre="Créer votre compte administrateur"
              sousTitre="Cette invitation est à usage unique et expire 15 minutes après sa création."
            />
            <FormulaireInscription invitation={valeurAdmin} type="admin" />
          </>
        ) : (
          <InvitationInvalide />
        )}
      </Cadre>
    )
  }

  // R30 : une invitation active mène au formulaire ; révoquée / inexistante →
  // aucune inscription (message d'erreur, aucun compte créé — R33).
  const invitation = valeur ? await resoudreInvitation(valeur) : null

  return (
    <Cadre>
      {invitation ? (
        <>
          <EnTetePage
            titre="Créer votre compte coach"
            sousTitre={
              invitation.clubNom
                ? `Vous rejoindrez le club ${invitation.clubNom}.`
                : 'Vous rejoindrez votre club.'
            }
          />
          <FormulaireInscription invitation={valeur ?? ''} />
        </>
      ) : (
        <InvitationInvalide />
      )}
    </Cadre>
  )
}

function Cadre({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8">{children}</Carte>
    </div>
  )
}

function InvitationInvalide() {
  return (
    <>
      <EnTetePage
        titre="Invitation invalide"
        sousTitre="Cette invitation n’est plus valide ou n’existe pas."
      />
      <p className="mt-6 text-sm text-texte-attenue">
        Demandez une nouvelle invitation à votre administrateur, ou{' '}
        <Link href="/connexion" className="text-accent hover:underline">
          connectez-vous
        </Link>{' '}
        si vous avez déjà un compte.
      </p>
    </>
  )
}
