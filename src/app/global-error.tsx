'use client' // Les frontières d'erreur sont des Client Components.

import { EcranErreur } from '@/composants'

import './globals.css'

/**
 * Erreur dans la mise en page RACINE (spec #12 R25) : remplace `app/layout.tsx`
 * quand il est en échec, donc fournit ses propres `<html>` / `<body>` et les
 * styles globaux. Même écran que `app/error.tsx`, sans le bandeau.
 */
export default function ErreurGlobale({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <title>Erreur — Interclub</title>
        <EcranErreur onReessayer={() => unstable_retry()} />
      </body>
    </html>
  )
}
