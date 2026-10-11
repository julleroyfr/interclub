import { describe, expect, it } from 'vitest'

import { pagesMaquetteDisponibles } from './maquettes'

/** Pages de maquette servies en développement local seulement (spec #12 R24). */
describe('pagesMaquetteDisponibles (spec #12 R24)', () => {
  it('servies en développement local (`next dev`)', () => {
    expect(pagesMaquetteDisponibles('development')).toBe(true)
  })

  it('absentes d’un build de production — recette et prod (R24)', () => {
    expect(pagesMaquetteDisponibles('production')).toBe(false)
  })

  it('absentes si l’environnement est inconnu ou non renseigné (fail-closed)', () => {
    expect(pagesMaquetteDisponibles('test')).toBe(false)
    expect(pagesMaquetteDisponibles(undefined)).toBe(false)
  })
})
