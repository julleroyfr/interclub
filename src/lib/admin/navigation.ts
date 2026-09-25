import { type LienNav } from '@/composants'

/**
 * Bandeau de navigation de l'espace admin (spec #12 R1/R19). **Centralisé** et
 * **identique sur toutes les pages `/admin/**`** : contrairement à l'ancien
 * `const liens` défini page par page (qui n'affichait que « Accueil + section
 * courante »), toutes les destinations admin sont accessibles depuis n'importe
 * quel écran. Symétrique de `liensCoach` pour l'espace coach.
 */
export function liensAdmin(): LienNav[] {
  return [
    { href: '/', label: 'Accueil' },
    { href: '/admin', label: 'Tableau de bord' },
    { href: '/admin/rencontres', label: 'Rencontres' },
    { href: '/admin/clubs', label: 'Clubs' },
    { href: '/admin/grimpeurs', label: 'Grimpeurs' },
    { href: '/admin/gabarit', label: 'Gabarit' },
    { href: '/admin/jetons', label: 'Jetons' },
    { href: '/admin/mapping', label: 'Rôles' },
  ]
}
