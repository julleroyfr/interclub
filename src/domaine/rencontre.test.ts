import { describe, it, expect } from 'vitest'

import {
  CATEGORIES,
  PHASES,
  SaisieRencontreInvalideError,
  anneeSaison,
  bornesSaison,
  labelSaison,
  normaliserSaisieRencontre,
  phasePrecedente,
  phaseSuivante,
} from './rencontre'

// Spec #1 « Rôles & autorisations » — CRUD rencontre réservé à l'admin (R12).
// Domaine pur : valide la saisie (date, club porteur, catégorie) avant toute
// écriture Supabase, et modélise le cycle de vie en trois phases successives
// (R5). Aucune dépendance Supabase ici — uniquement les invariants.

describe('Saisie d’une rencontre (R12)', () => {
  const valide = {
    dateRencontre: '2026-11-14',
    clubPorteurId: '11111111-1111-1111-1111-111111111111',
    categorie: 'enfant',
  }

  it('normalise une saisie valide (date/club/catégorie)', () => {
    expect(normaliserSaisieRencontre(valide)).toEqual({
      dateRencontre: '2026-11-14',
      clubPorteurId: '11111111-1111-1111-1111-111111111111',
      categorie: 'enfant',
    })
  })

  it('accepte la catégorie ado', () => {
    expect(
      normaliserSaisieRencontre({ ...valide, categorie: 'ado' }).categorie,
    ).toBe('ado')
  })

  it('retire les espaces de bord de la date et de l’identifiant', () => {
    const r = normaliserSaisieRencontre({
      ...valide,
      dateRencontre: '  2026-11-14  ',
      clubPorteurId: '  11111111-1111-1111-1111-111111111111  ',
    })
    expect(r.dateRencontre).toBe('2026-11-14')
    expect(r.clubPorteurId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('rejette une date vide', () => {
    expect(() =>
      normaliserSaisieRencontre({ ...valide, dateRencontre: '  ' }),
    ).toThrow(SaisieRencontreInvalideError)
  })

  it('rejette une date au mauvais format', () => {
    expect(() =>
      normaliserSaisieRencontre({ ...valide, dateRencontre: '14/11/2026' }),
    ).toThrow(SaisieRencontreInvalideError)
  })

  it('rejette une date calendaire impossible', () => {
    expect(() =>
      normaliserSaisieRencontre({ ...valide, dateRencontre: '2026-02-30' }),
    ).toThrow(SaisieRencontreInvalideError)
  })

  it('rejette un club porteur manquant', () => {
    expect(() =>
      normaliserSaisieRencontre({ ...valide, clubPorteurId: '' }),
    ).toThrow(SaisieRencontreInvalideError)
  })

  it('rejette une catégorie hors référentiel', () => {
    expect(() =>
      normaliserSaisieRencontre({ ...valide, categorie: 'senior' }),
    ).toThrow(SaisieRencontreInvalideError)
  })

  it('expose les deux catégories du référentiel', () => {
    expect(CATEGORIES.map((c) => c.value)).toEqual(['enfant', 'ado'])
  })
})

describe('Saison sportive (R37)', () => {
  describe('anneeSaison — calcul depuis la date de la rencontre', () => {
    it('rencontre en septembre → année de début de saison = année de la date (R37)', () => {
      expect(anneeSaison('2025-09-01')).toBe(2025)
    })

    it('rencontre en décembre → année de début de saison = année de la date (R37)', () => {
      expect(anneeSaison('2025-12-31')).toBe(2025)
    })

    it('rencontre en janvier → année de début de saison = année de la date − 1 (R37)', () => {
      expect(anneeSaison('2026-01-01')).toBe(2025)
    })

    it('rencontre en août → année de début de saison = année de la date − 1 (R37)', () => {
      expect(anneeSaison('2026-08-31')).toBe(2025)
    })

    it('1er septembre de l’année suivante → nouvelle saison (R37)', () => {
      expect(anneeSaison('2026-09-01')).toBe(2026)
    })
  })

  describe('bornesSaison — plage de dates SQL pour filtrer (R37)', () => {
    it('saison 2025 va du 2025-09-01 au 2026-08-31 (R37)', () => {
      expect(bornesSaison(2025)).toEqual({ debut: '2025-09-01', fin: '2026-08-31' })
    })

    it('saison 2024 va du 2024-09-01 au 2025-08-31 (R37)', () => {
      expect(bornesSaison(2024)).toEqual({ debut: '2024-09-01', fin: '2025-08-31' })
    })
  })

  describe('labelSaison — affichage lisible (R37)', () => {
    it('saison 2025 → libellé "2025–2026"', () => {
      expect(labelSaison(2025)).toBe('2025–2026')
    })
  })
})

describe('Cycle de vie en trois phases (R5)', () => {
  it('ordonne les phases : pré-compétition → compétition → résultats publics', () => {
    expect(PHASES.map((p) => p.value)).toEqual([
      'pre_competition',
      'competition',
      'resultats_publics',
    ])
  })

  it('avance à la phase suivante', () => {
    expect(phaseSuivante('pre_competition')).toBe('competition')
    expect(phaseSuivante('competition')).toBe('resultats_publics')
  })

  it('n’avance pas au-delà de la dernière phase', () => {
    expect(phaseSuivante('resultats_publics')).toBeNull()
  })

  it('revient à la phase précédente', () => {
    expect(phasePrecedente('resultats_publics')).toBe('competition')
    expect(phasePrecedente('competition')).toBe('pre_competition')
  })

  it('ne recule pas avant la première phase', () => {
    expect(phasePrecedente('pre_competition')).toBeNull()
  })
})
