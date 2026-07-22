import type { Metadata } from 'next'

import { FormulaireConnexion } from './formulaire-connexion'

export const metadata: Metadata = {
  title: 'Connexion — Interclub',
}

export default function PageConnexion() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Connexion</h1>
      <FormulaireConnexion />
    </main>
  )
}
