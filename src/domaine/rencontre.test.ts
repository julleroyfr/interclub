import { describe, it, expect } from 'vitest'

import {
  CATEGORIES,
  PHASES,
  SaisieRencontreInvalideError,
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
