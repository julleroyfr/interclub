import type { Metadata } from 'next'

import { Carte, EnTetePage } from '@/composants'
import { redirigerSiConnecte } from '@/lib/auth/session'

import { FormulaireConnexion } from './formulaire-connexion'

export const metadata: Metadata = {
  title: 'Connexion — Interclub',
}

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ inscrit?: string }>
}) {
  // Déjà connecté avec un rôle → on ne montre pas le formulaire (R8).
  await redirigerSiConnecte()

  const { inscrit } = await searchParams

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8">
        <EnTetePage
          titre="Connexion"
          sousTitre="Accédez à votre espace interclub."
        />
        {inscrit && (
          <p role="status" className="mt-4 text-sm text-secondaire">
            Votre compte a été créé. Connectez-vous avec vos identifiants.
          </p>
        )}
        <FormulaireConnexion />
      </Carte>
    </div>
  )
}
