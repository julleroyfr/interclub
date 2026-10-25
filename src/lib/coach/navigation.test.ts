import { describe, expect, it } from 'vitest'

import {
  cibleCarteRencontreCoach,
  lienSuiteRencontreCoach,
  liensCoach,
  resumeCarteRencontreCoach,
} from './navigation'

/**
 * Navigation de l'espace coach (spec #12 R10/R11, spec #5).
 * Fonction pure : testable sans Supabase.
 */
describe('liensCoach', () => {
  it('coach permanent : Mes rencontres, Jetons — sans « Accueil » (R10, R7)', () => {
    const liens = liensCoach({ type: 'permanent', clubId: 'club-1' })
    expect(liens).toEqual([
      { href: '/coach', label: 'Mes rencontres' },
      { href: '/coach/jetons', label: 'Jetons' },
    ])
  })

  it('aucun lien vers « / » : la racine n\'est plus un écran (R7)', () => {
    const perm = liensCoach({ type: 'permanent', clubId: 'club-1' })
    const temp = liensCoach({ type: 'temporaire', clubId: 'club-1', rencontreId: 'r1' })
    expect(perm.some((l) => l.href === '/')).toBe(false)
    expect(temp.some((l) => l.href === '/')).toBe(false)
  })

  it('coach permanent : expose « Jetons » (seul accès depuis que l\'accueil n\'y mène plus, C1)', () => {
    const liens = liensCoach({ type: 'permanent', clubId: 'club-1' })
    expect(liens.some((l) => l.href === '/coach/jetons')).toBe(true)
  })

  it('coach temporaire : Ma rencontre, Classement bornés à sa rencontre (R11)', () => {
    const liens = liensCoach({
      type: 'temporaire',
      clubId: 'club-1',
      rencontreId: 'rdv-42',
    })
    expect(liens).toEqual([
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

describe('lienSuiteRencontreCoach — lien de l’écran de la rencontre', () => {
  it.each(['pre_competition', 'preparation'] as const)('aucun lien en %s', (phase) => {
    expect(lienSuiteRencontreCoach('r1', 'ado', phase)).toBeNull()
    expect(lienSuiteRencontreCoach('r1', 'adulte', phase)).toBeNull()
  })

  it('enfant/ado en ③ : saisie et consultation des résultats (spec #6)', () => {
    expect(lienSuiteRencontreCoach('r1', 'enfant', 'competition')).toEqual({
      href: '/coach/rencontres/r1/resultats',
      label: 'Saisir / voir les résultats →',
    })
  })

  it.each(['cloture', 'resultats_publics'] as const)(
    'enfant/ado en %s : consultation seule, « Voir les résultats »',
    (phase) => {
      expect(lienSuiteRencontreCoach('r1', 'ado', phase)).toEqual({
        href: '/coach/rencontres/r1/resultats',
        label: 'Voir les résultats →',
      })
    },
  )

  it.each(['competition', 'cloture', 'resultats_publics'] as const)(
    'adulte en %s : directement le classement (spec #20 R19bis)',
    (phase) => {
      expect(lienSuiteRencontreCoach('r1', 'adulte', phase)).toEqual({
        href: '/coach/rencontres/r1/classement',
        label: 'Voir le classement →',
      })
    },
  )
})

describe('cibleCarteRencontreCoach — carte de l’accueil coach (spec #5 R7)', () => {
  it('enfant/ado : saisie en ③, engagement ailleurs', () => {
    expect(cibleCarteRencontreCoach('r1', 'enfant', 'competition')).toBe('/coach/rencontres/r1/resultats')
    expect(cibleCarteRencontreCoach('r1', 'ado', 'cloture')).toBe('/coach/rencontres/r1')
    expect(cibleCarteRencontreCoach('r1', 'ado', 'pre_competition')).toBe('/coach/rencontres/r1')
  })

  it('adulte : classement dès la ③, engagement avant (spec #20 R19bis)', () => {
    expect(cibleCarteRencontreCoach('r1', 'adulte', 'preparation')).toBe('/coach/rencontres/r1')
    for (const phase of ['competition', 'cloture', 'resultats_publics'] as const) {
      expect(cibleCarteRencontreCoach('r1', 'adulte', phase)).toBe('/coach/rencontres/r1/classement')
    }
  })
})

describe('resumeCarteRencontreCoach — effectifs de la carte (spec #5 R6)', () => {
  it('enfant/ado : équipes et grimpeurs du club, accordés', () => {
    expect(resumeCarteRencontreCoach('ado', 2, 9)).toBe('2 équipes · 9 grimpeurs')
    expect(resumeCarteRencontreCoach('enfant', 0, 0)).toBe('0 équipe · 0 grimpeur')
    expect(resumeCarteRencontreCoach('ado', 1, 1)).toBe('1 équipe · 1 grimpeur')
  })

  it('adulte : grimpeurs du club composés, sans nombre d’équipes (spec #20 R19ter)', () => {
    expect(resumeCarteRencontreCoach('adulte', 0, 3)).toBe('3 grimpeurs')
    expect(resumeCarteRencontreCoach('adulte', 0, 0)).toBe('0 grimpeur')
  })
})
