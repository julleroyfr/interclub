import { type LienNav } from '@/composants'
import { type ContexteCoach } from '@/lib/auth/session'

/**
 * Liens de navigation de l'espace coach (spec #5, spec #12 R10/R11). Le coach
 * **permanent** voit « Mes rencontres » (R6) et ses « Jetons » QR (accès interne,
 * spec #12 R10) ; le coach **temporaire**, dont la session est bornée à une seule
 * rencontre (R8bis, spec #1 R27/R28), a un accès direct à sa rencontre et à son
 * **classement en lecture** (spec #12 R11). Pas de lien « Accueil » : `/` n'est
 * plus un écran (spec #12 R7). La sortie se fait par « Se déconnecter »
 * (permanent) ou « Terminer » (temporaire, fin de session R17/R22).
 */
export function liensCoach(contexte: ContexteCoach): LienNav[] {
  if (contexte.type === 'temporaire') {
    return [
      { href: `/coach/rencontres/${contexte.rencontreId}`, label: 'Ma rencontre' },
      { href: `/coach/rencontres/${contexte.rencontreId}/classement`, label: 'Classement' },
    ]
  }
  return [
    { href: '/coach', label: 'Mes rencontres' },
    { href: '/coach/jetons', label: 'Jetons' },
  ]
}
