import { describe, expect, it } from 'vitest'

import { lireReponseEnregistrement } from './reponse-enregistrement'

// Spec #6 R20 (rév. 2026-10-09) : l'enregistrement renvoie les résultats du
// grimpeur avec leurs barèmes ; le score en est déduit par le domaine (spec #7).

describe('spec #6 — Score déduit de la réponse de l’enregistrement (R20)', () => {
  it('somme voies (selon l’issue et le barème), blocs (palier) et vitesse', () => {
    const r = lireReponseEnregistrement({
      voies: [
        { issue: 'top', points: 10, points_prise_valorisee: 5, points_zone1: null, points_zone2: null },
        { issue: 'prise_valorisee', points: 12, points_prise_valorisee: 6, points_zone1: null, points_zone2: null },
        { issue: 'echec', points: 14, points_prise_valorisee: 7, points_zone1: null, points_zone2: null },
      ],
      blocs: [
        { issue: 'palier', points_palier: 4 },
        { issue: 'echec', points_palier: null },
      ],
      points_vitesse: 9,
    })
    expect(r).toEqual({ score: 10 + 6 + 0 + 4 + 0 + 9, pointsVitesse: 9 })
  })

  it('ado : zones selon le barème de la voie', () => {
    const r = lireReponseEnregistrement({
      voies: [{ issue: 'zone2', points: 8, points_prise_valorisee: null, points_zone1: 2, points_zone2: 4 }],
      blocs: [],
      points_vitesse: 0,
    })
    expect(r.score).toBe(4)
  })

  it('aucun résultat : score nul', () => {
    expect(lireReponseEnregistrement({ voies: [], blocs: [], points_vitesse: 0 })).toEqual({
      score: 0,
      pointsVitesse: 0,
    })
  })

  it('réponse illisible : lève une erreur plutôt qu’un score faux', () => {
    expect(() => lireReponseEnregistrement(null)).toThrow()
    expect(() => lireReponseEnregistrement({ voies: 'x' })).toThrow()
  })
})
