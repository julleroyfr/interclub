import { type LienNav } from '@/composants'
import type { Categorie, Phase } from '@/domaine/rencontre'
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

/** Phases où la composition est encore ouverte : rien à saisir ni à classer. */
const avantCompetition = (phase: Phase) => phase === 'pre_competition' || phase === 'preparation'

/**
 * Lien de suite de l'écran d'une rencontre côté coach, ou `null` avant la ③.
 * Enfant/ado : « Saisir / voir les résultats » en ③ (spec #6), « Voir les
 * résultats » en ④/⑤ où la saisie est close. Adulte : directement le classement,
 * le coach n'ayant pas d'écran de résultats (spec #20 R19bis).
 */
export function lienSuiteRencontreCoach(
  rencontreId: string,
  categorie: Categorie,
  phase: Phase,
): { href: string; label: string } | null {
  if (avantCompetition(phase)) return null
  if (categorie === 'adulte') {
    return { href: `/coach/rencontres/${rencontreId}/classement`, label: 'Voir le classement →' }
  }
  return {
    href: `/coach/rencontres/${rencontreId}/resultats`,
    label: phase === 'competition' ? 'Saisir / voir les résultats →' : 'Voir les résultats →',
  }
}

/**
 * Cible de la carte d'une rencontre sur l'accueil coach (spec #5 R7) : saisie
 * des résultats en ③, écran d'engagement ailleurs ; en adulte, classement dès la
 * ③ (spec #20 R19bis).
 */
export function cibleCarteRencontreCoach(rencontreId: string, categorie: Categorie, phase: Phase): string {
  if (categorie === 'adulte' && !avantCompetition(phase)) return `/coach/rencontres/${rencontreId}/classement`
  if (phase === 'competition') return `/coach/rencontres/${rencontreId}/resultats`
  return `/coach/rencontres/${rencontreId}`
}
