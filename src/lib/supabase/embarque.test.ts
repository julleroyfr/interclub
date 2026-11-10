import { describe, expect, it } from 'vitest'

import { compteEmbarque, nomEmbarque } from './embarque'

describe('compteEmbarque — count embarqué PostgREST `relation(count)`', () => {
  it('lit le compte renvoyé sous forme de tableau', () => {
    expect(compteEmbarque([{ count: 1100 }])).toBe(1100)
  })

  it('vaut 0 pour une relation vide ou absente', () => {
    expect(compteEmbarque([{ count: 0 }])).toBe(0)
    expect(compteEmbarque([])).toBe(0)
    expect(compteEmbarque(null)).toBe(0)
    expect(compteEmbarque(undefined)).toBe(0)
  })

  it('accepte un objet seul', () => {
    expect(compteEmbarque({ count: 3 })).toBe(3)
  })
})

describe('nomEmbarque — relation to-one `club:club_id(nom)`', () => {
  it('lit un objet ou le premier élément d’un tableau', () => {
    expect(nomEmbarque({ nom: 'Club A' })).toBe('Club A')
    expect(nomEmbarque([{ nom: 'Club B' }])).toBe('Club B')
  })

  it('vaut null si la relation est absente', () => {
    expect(nomEmbarque(null)).toBeNull()
    expect(nomEmbarque([])).toBeNull()
  })
})
