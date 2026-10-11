import { describe, it, expect } from 'vitest'

import { creerPret, PretInvalideError } from './pret'

describe('Prêt de grimpeur — validation (spec #1 R35)', () => {
  const base = {
    rencontreId: 'renc-1',
    grimpeurId: 'g-1',
    clubAccueilId: 'club-A',
    clubGrimpeurId: 'club-B',
  }

  it('accepte un prêt vers un club différent du club d’origine', () => {
    expect(creerPret(base)).toEqual({
      rencontreId: 'renc-1',
      grimpeurId: 'g-1',
      clubAccueilId: 'club-A',
    })
  })

  it('refuse un prêt vers le club d’origine du grimpeur', () => {
    expect(() => creerPret({ ...base, clubAccueilId: 'club-B' })).toThrow(
      PretInvalideError,
    )
  })

  it('refuse une rencontre manquante', () => {
    expect(() => creerPret({ ...base, rencontreId: '' })).toThrow(PretInvalideError)
  })

  it('refuse un grimpeur manquant', () => {
    expect(() => creerPret({ ...base, grimpeurId: '' })).toThrow(PretInvalideError)
  })

  it('refuse un club d’accueil manquant', () => {
    expect(() => creerPret({ ...base, clubAccueilId: '' })).toThrow(PretInvalideError)
  })
})
