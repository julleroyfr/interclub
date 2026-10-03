'use client' // Les frontières d'erreur sont des Client Components.

import { EcranErreur } from '@/composants'

/**
 * Erreur technique pendant le rendu d'une page (spec #12 R25) : lecture en
 * échec, lecture refusée par un loader (ADR 0005), panne. Next journalise
 * l'erreur côté serveur et ne transmet au client qu'un message générique en
 * production ; l'écran n'en affiche aucun détail. Les refus d'accès (R2/R3)
 * restent des redirections / 404, pas des erreurs.
 */
export default function Erreur({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <EcranErreur onReessayer={() => unstable_retry()} />
}
