import { type LienNav } from '@/composants'
import { type ContexteCoach } from '@/lib/auth/session'

/**
 * Liens de navigation de l'espace coach (spec #5). Le coach **permanent** voit la
 * liste « Mes rencontres » (R6) ; le coach **temporaire**, dont la session est
 * bornée à une seule rencontre (R8bis, spec #1 R27/R28), n'a pas de liste mais un
 * **accès direct à sa rencontre**.
 */
export function liensCoach(contexte: ContexteCoach): LienNav[] {
  if (contexte.type === 'temporaire') {
    return [
      { href: '/', label: 'Accueil' },
      { href: `/coach/rencontres/${contexte.rencontreId}`, label: 'Ma rencontre' },
    ]
  }
  return [
    { href: '/', label: 'Accueil' },
    { href: '/coach', label: 'Mes rencontres' },
  ]
}
