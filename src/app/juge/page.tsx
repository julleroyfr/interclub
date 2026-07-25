import type { Metadata } from 'next'

import { Carte, EnTetePage } from '@/composants'

export const metadata: Metadata = {
  title: 'Espace juge — Interclub',
}

export default function PageJuge() {
  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8 text-center">
        <EnTetePage
          titre="Espace juge"
          sousTitre="Session ouverte — fonctionnalités à venir."
        />
      </Carte>
    </div>
  )
}
