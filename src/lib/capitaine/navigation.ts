import { type LienNav } from '@/composants'

/**
 * Liens de navigation de l'espace capitaine (spec #20 R18/R19, spec #12) : sa
 * saisie et le classement de la rencontre, en lecture. La sortie se fait par
 * « Terminer » (fin de session QR).
 */
export function liensCapitaine(): LienNav[] {
  return [
    { href: '/capitaine', label: 'Mon équipe' },
    { href: '/capitaine/classement', label: 'Classement' },
  ]
}
