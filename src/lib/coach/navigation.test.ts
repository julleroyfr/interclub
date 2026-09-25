import { describe, expect, it } from 'vitest'

import { liensCoach } from './navigation'

/**
 * Navigation de l'espace coach (spec #12 R10/R11, spec #5).
 * Fonction pure : testable sans Supabase.
 */
describe('liensCoach', () => {
  it('coach permanent : Accueil, Mes rencontres, Jetons (R10, C1)', () => {
    const liens = liensCoach({ type: 'permanent', clubId: 'club-1' })
    expect(liens).toEqual([
      { href: '/', label: 'Accueil' },
      { href: '/coach', label: 'Mes rencontres' },
      { href: '/coach/jetons', label: 'Jetons' },
    ])
  })

  it('coach permanent : expose « Jetons » (seul accès depuis que l\'accueil n\'y mène plus, C1)', () => {
    const liens = liensCoach({ type: 'permanent', clubId: 'club-1' })
    expect(liens.some((l) => l.href === '/coach/jetons')).toBe(true)
  })

  it('coach temporaire : Accueil, Ma rencontre, Classement bornés à sa rencontre (R11)', () => {
    const liens = liensCoach({
      type: 'temporaire',
      clubId: 'club-1',
      rencontreId: 'rdv-42',
    })
    expect(liens).toEqual([
      { href: '/', label: 'Accueil' },
      { href: '/coach/rencontres/rdv-42', label: 'Ma rencontre' },
      { href: '/coach/rencontres/rdv-42/classement', label: 'Classement' },
    ])
  })

  it('coach temporaire : aucun lien vers la liste « Mes rencontres » (R8bis, borné)', () => {
    const liens = liensCoach({
      type: 'temporaire',
      clubId: 'club-1',
      rencontreId: 'rdv-42',
    })
    expect(liens.some((l) => l.href === '/coach')).toBe(false)
  })

  it('coach temporaire : le classement pointe bien vers SA rencontre (anti-traversée)', () => {
    const liens = liensCoach({
      type: 'temporaire',
      clubId: 'club-1',
      rencontreId: 'rdv-99',
    })
    const classement = liens.find((l) => l.label === 'Classement')
    expect(classement?.href).toBe('/coach/rencontres/rdv-99/classement')
  })
})
