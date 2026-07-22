import type { Metadata } from 'next'

import { Carte, EnTetePage } from '@/composants'

import { FormulaireConnexion } from './formulaire-connexion'

export const metadata: Metadata = {
  title: 'Connexion — Interclub',
}

export default function PageConnexion() {
  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8">
        <EnTetePage
          titre="Connexion"
          sousTitre="Accédez à votre espace interclub."
        />
        <FormulaireConnexion />
      </Carte>
    </div>
  )
}
