import type { Metadata } from 'next'
import Link from 'next/link'

import { Carte, EnTetePage } from '@/composants'
import { resoudreInvitation } from '@/lib/invitations/invitations'

import { FormulaireInscription } from './formulaire-inscription'

export const metadata: Metadata = {
  title: 'Inscription coach — Interclub',
}

export default async function PageInscription({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>
}) {
  const { invitation: valeur } = await searchParams
  // R30 : une invitation active mène au formulaire ; révoquée / inexistante →
  // aucune inscription (message d'erreur, aucun compte créé — R33).
  const invitation = valeur ? await resoudreInvitation(valeur) : null

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8">
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
        )}
      </Carte>
    </div>
  )
}
