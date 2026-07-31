import { describe, it, expect } from 'vitest'

import {
  NiveauVoieInvalideError,
  NIVEAUX_MOULINETTE,
  NIVEAUX_TETE,
  PointsInvalideError,
  construireEpreuvesDepuisGabarit,
  validerNiveauVoie,
  validerPoints,
  type GabaritEpreuve,
} from './gabarit'

// Fabrique une voie de difficulté complète (points par défaut) pour les tests.
function voie(
  o: Partial<GabaritEpreuve['voiesDifficulte'][number]> & {
    niveau: string
    ordre: number
  },
): GabaritEpreuve['voiesDifficulte'][number] {
  return {
    typeVoie: 'tete',
    cotation: '',
    points: 0,
    pointsPriseValorisee: null,
    pointsZone1: null,
    pointsZone2: null,
    ...o,
  }
}

// Spec #3 — Gabarit de rencontre.
// R37 : niveau d'une voie de difficulté contraint aux valeurs réglementaires.
// R30 : copie du gabarit → épreuves instanciées pour une rencontre.

describe('Validation du niveau de voie (R37)', () => {
  describe('Catégorie enfant — moulinette', () => {
    it('accepte tous les niveaux moulinette valides M1–M4 pour enfant (R37)', () => {
      for (const niveau of NIVEAUX_MOULINETTE) {
        expect(() => validerNiveauVoie(niveau, 'moulinette', 'enfant')).not.toThrow()
      }
    })

    it('refuse un niveau moulinette hors M1–M4 (R37)', () => {
      expect(() => validerNiveauVoie('M0', 'moulinette', 'enfant')).toThrow(NiveauVoieInvalideError)
      expect(() => validerNiveauVoie('M5', 'moulinette', 'enfant')).toThrow(NiveauVoieInvalideError)
      expect(() => validerNiveauVoie('T1', 'moulinette', 'enfant')).toThrow(NiveauVoieInvalideError)
      expect(() => validerNiveauVoie('', 'moulinette', 'enfant')).toThrow(NiveauVoieInvalideError)
    })
  })

  describe('Catégorie enfant — tête', () => {
    it('accepte tous les niveaux tête valides T1–T10 pour enfant (R37)', () => {
      for (const niveau of NIVEAUX_TETE) {
        expect(() => validerNiveauVoie(niveau, 'tete', 'enfant')).not.toThrow()
      }
    })

    it('refuse un niveau tête hors T1–T10 pour enfant (R37)', () => {
      expect(() => validerNiveauVoie('T0', 'tete', 'enfant')).toThrow(NiveauVoieInvalideError)
      expect(() => validerNiveauVoie('T11', 'tete', 'enfant')).toThrow(NiveauVoieInvalideError)
      expect(() => validerNiveauVoie('M1', 'tete', 'enfant')).toThrow(NiveauVoieInvalideError)
    })
  })

  describe('Catégorie ado', () => {
    it('accepte tous les niveaux tête valides T1–T10 pour ado (R37)', () => {
      for (const niveau of NIVEAUX_TETE) {
        expect(() => validerNiveauVoie(niveau, 'tete', 'ado')).not.toThrow()
      }
    })

    it('refuse toute voie moulinette pour ado, quel que soit le niveau (R37)', () => {
      for (const niveau of NIVEAUX_MOULINETTE) {
        expect(() => validerNiveauVoie(niveau, 'moulinette', 'ado')).toThrow(NiveauVoieInvalideError)
      }
    })

    it('refuse un niveau tête hors T1–T10 pour ado (R37)', () => {
      expect(() => validerNiveauVoie('T0', 'tete', 'ado')).toThrow(NiveauVoieInvalideError)
      expect(() => validerNiveauVoie('T11', 'tete', 'ado')).toThrow(NiveauVoieInvalideError)
    })
  })
})

describe('Validation des points (R38, R39)', () => {
  it('accepte 0 et les entiers positifs', () => {
    for (const n of [0, 1, 4, 22, 60]) {
      expect(() => validerPoints(n)).not.toThrow()
    }
  })

  it('refuse un nombre négatif', () => {
    expect(() => validerPoints(-1)).toThrow(PointsInvalideError)
  })

  it('refuse un non-entier', () => {
    expect(() => validerPoints(2.5)).toThrow(PointsInvalideError)
    expect(() => validerPoints(Number.NaN)).toThrow(PointsInvalideError)
  })
})

describe('Copie gabarit → épreuves de rencontre (R30)', () => {
  it('produit une liste vide depuis un gabarit vide (R35)', () => {
    expect(construireEpreuvesDepuisGabarit([])).toEqual([])
  })

  it('produit une épreuve pour chaque épreuve du gabarit (R30)', () => {
    const gabarit: GabaritEpreuve[] = [
      { type: 'voie', voiesDifficulte: [], blocs: [], voiesVitesse: [] },
      { type: 'bloc', voiesDifficulte: [], blocs: [], voiesVitesse: [] },
      { type: 'vitesse', voiesDifficulte: [], blocs: [], voiesVitesse: [] },
    ]
    const resultat = construireEpreuvesDepuisGabarit(gabarit)
    expect(resultat).toHaveLength(3)
    expect(resultat.map((e) => e.type)).toEqual(['voie', 'bloc', 'vitesse'])
  })

  it('copie les voies de difficulté avec leurs attributs et leurs points (R30, R38)', () => {
    const gabarit: GabaritEpreuve[] = [
      {
        type: 'voie',
        voiesDifficulte: [
          voie({ niveau: 'M1', typeVoie: 'moulinette', cotation: '4c', points: 1, ordre: 1 }),
          voie({ niveau: 'T5', typeVoie: 'tete', cotation: '6a', points: 9, pointsPriseValorisee: 5, ordre: 2 }),
          voie({ niveau: 'T5', typeVoie: 'tete', cotation: '6a+', points: 9, pointsPriseValorisee: 5, ordre: 3 }),
        ],
        blocs: [],
        voiesVitesse: [],
      },
    ]
    const [epreuve] = construireEpreuvesDepuisGabarit(gabarit)
    expect(epreuve.voiesDifficulte).toHaveLength(3)
    expect(epreuve.voiesDifficulte[0].points).toBe(1)
    expect(epreuve.voiesDifficulte[0].pointsPriseValorisee).toBeNull()
    expect(epreuve.voiesDifficulte[1].pointsPriseValorisee).toBe(5)
    // deux voies au même niveau T5 (doublée) — points identiques copiés
    expect(epreuve.voiesDifficulte[2]).toEqual(
      voie({ niveau: 'T5', typeVoie: 'tete', cotation: '6a+', points: 9, pointsPriseValorisee: 5, ordre: 3 }),
    )
  })

  it('copie les blocs avec leurs paliers de points (R30, R39)', () => {
    const gabarit: GabaritEpreuve[] = [
      {
        type: 'bloc',
        voiesDifficulte: [],
        blocs: [
          {
            code: 'B1',
            ordre: 1,
            paliers: [
              { libelle: '1er essai', points: 4, ordre: 1 },
              { libelle: '2e essai', points: 3, ordre: 2 },
            ],
          },
          { code: 'B2', ordre: 2, paliers: [] },
        ],
        voiesVitesse: [],
      },
    ]
    const [epreuve] = construireEpreuvesDepuisGabarit(gabarit)
    expect(epreuve.blocs[0].paliers).toEqual([
      { libelle: '1er essai', points: 4, ordre: 1 },
      { libelle: '2e essai', points: 3, ordre: 2 },
    ])
    expect(epreuve.blocs[1].paliers).toEqual([])
  })

  it('une copie de bloc est indépendante — modifier ses paliers ne touche pas le gabarit (R30)', () => {
    const gabarit: GabaritEpreuve[] = [
      {
        type: 'bloc',
        voiesDifficulte: [],
        blocs: [{ code: 'B1', ordre: 1, paliers: [{ libelle: 'Zone', points: 10, ordre: 1 }] }],
        voiesVitesse: [],
      },
    ]
    const [epreuve] = construireEpreuvesDepuisGabarit(gabarit)
    epreuve.blocs[0].paliers.push({ libelle: 'Complet', points: 30, ordre: 2 })
    expect(gabarit[0].blocs[0].paliers).toHaveLength(1)
  })

  it('copie les voies de vitesse avec leurs libellés (R30, R32)', () => {
    const gabarit: GabaritEpreuve[] = [
      {
        type: 'vitesse',
        voiesDifficulte: [],
        blocs: [],
        voiesVitesse: [
          { libelle: 'Filles', ordre: 1 },
          { libelle: 'Garçons', ordre: 2 },
        ],
      },
    ]
    const [epreuve] = construireEpreuvesDepuisGabarit(gabarit)
    expect(epreuve.voiesVitesse).toEqual([
      { libelle: 'Filles', ordre: 1 },
      { libelle: 'Garçons', ordre: 2 },
    ])
  })

  it("conserve l'ordre d'insertion des voies (R30)", () => {
    const gabarit: GabaritEpreuve[] = [
      {
        type: 'voie',
        voiesDifficulte: [
          voie({ niveau: 'T3', typeVoie: 'tete', cotation: '5b', ordre: 1 }),
          voie({ niveau: 'T1', typeVoie: 'tete', cotation: '4c', ordre: 2 }),
          voie({ niveau: 'T2', typeVoie: 'tete', cotation: '5a', ordre: 3 }),
        ],
        blocs: [],
        voiesVitesse: [],
      },
    ]
    const [epreuve] = construireEpreuvesDepuisGabarit(gabarit)
    expect(epreuve.voiesDifficulte.map((v) => v.ordre)).toEqual([1, 2, 3])
    expect(epreuve.voiesDifficulte.map((v) => v.niveau)).toEqual(['T3', 'T1', 'T2'])
  })

  it("une copie est indépendante du gabarit source — la modifier ne touche pas l'original (R30)", () => {
    const gabarit: GabaritEpreuve[] = [
      {
        type: 'voie',
        voiesDifficulte: [voie({ niveau: 'T1', typeVoie: 'tete', cotation: '4c', ordre: 1 })],
        blocs: [],
        voiesVitesse: [],
      },
    ]
    const resultat = construireEpreuvesDepuisGabarit(gabarit)
    resultat[0].voiesDifficulte.push(voie({ niveau: 'T2', typeVoie: 'tete', cotation: '5a', ordre: 2 }))
    expect(gabarit[0].voiesDifficulte).toHaveLength(1)
  })
})
