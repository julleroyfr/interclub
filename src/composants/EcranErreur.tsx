'use client'

import Link from 'next/link'

import { Bouton } from './Bouton'
import { Carte } from './Carte'

/**
 * Écran d'erreur technique (spec #12 R25) : message en français SANS détail
 * technique, « Réessayer » (relance le rendu) et retour à l'accueil (`/`, qui
 * redirige selon le rôle, R7). Utilisé par `app/error.tsx` et
 * `app/global-error.tsx`. Mobile-first : actions empilées sur téléphone, cibles
 * de 44 px.
 */
export function EcranErreur({ onReessayer }: { onReessayer: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Carte className="flex flex-col gap-4 p-6" role="alert">
        <h1 className="text-xl font-bold text-texte-fort">Une erreur est survenue</h1>
        <p className="text-sm text-texte-attenue">
          La page n’a pas pu s’afficher. Réessayez dans un instant ; si le problème
          persiste, revenez à l’accueil.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Bouton variante="primaire" onClick={onReessayer} className="w-full sm:w-auto">
            Réessayer
          </Bouton>
          <Link
            href="/"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-bordure bg-surface px-4 text-sm font-semibold text-texte transition hover:bg-surface-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:w-auto"
          >
            Revenir à l’accueil
          </Link>
        </div>
      </Carte>
    </main>
  )
}
