import { describe, expect, it } from 'vitest'

import { accorder, compter } from './accord'

// Accord en nombre des libellés affichés : pas de « (s) », le mot est au
// singulier pour 0 et 1, au pluriel au-delà (usage français).

describe('accorder', () => {
  it('singulier pour 0 et 1', () => {
    expect(accorder(0, 'grimpeur')).toBe('grimpeur')
    expect(accorder(1, 'équipe')).toBe('équipe')
  })

  it('pluriel régulier en « s » au-delà de 1', () => {
    expect(accorder(2, 'grimpeur')).toBe('grimpeurs')
    expect(accorder(12, 'épreuve')).toBe('épreuves')
  })

  it('pluriel fourni quand il est irrégulier', () => {
    expect(accorder(3, 'affiché', 'affichés')).toBe('affichés')
    expect(accorder(1, 'jeu', 'jeux')).toBe('jeu')
    expect(accorder(4, 'jeu', 'jeux')).toBe('jeux')
  })
})

describe('compter', () => {
  it('préfixe le nombre au mot accordé', () => {
    expect(compter(0, 'équipe')).toBe('0 équipe')
    expect(compter(1, 'grimpeuse')).toBe('1 grimpeuse')
    expect(compter(3, 'grimpeur')).toBe('3 grimpeurs')
  })
})
