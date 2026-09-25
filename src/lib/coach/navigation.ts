import { type LienNav } from '@/composants'
import { type ContexteCoach } from '@/lib/auth/session'

/**
 * Liens de navigation de l'espace coach (spec #5, spec #12 R10/R11). Le coach
 * **permanent** voit « Mes rencontres » (R6) et ses « Jetons » QR (accès interne,
 * spec #12 R10 — l'accueil n'y mène plus, C1) ; le coach **temporaire**, dont la
 * session est bornée à une seule rencontre (R8bis, spec #1 R27/R28), a un accès
 * direct à sa rencontre et à son **classement en lecture** (spec #12 R11).
 */
export function liensCoach(contexte: ContexteCoach): LienNav[] {
  if (contexte.type === 'temporaire') {
    return [
      { href: '/', label: 'Accueil' },
      { href: `/coach/rencontres/${contexte.rencontreId}`, label: 'Ma rencontre' },
      { href: `/coach/rencontres/${contexte.rencontreId}/classement`, label: 'Classement' },
    ]
  }
  return [
    { href: '/', label: 'Accueil' },
    { href: '/coach', label: 'Mes rencontres' },
    { href: '/coach/jetons', label: 'Jetons' },
  ]
}
