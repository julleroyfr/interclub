import { describe, it, expect } from 'vitest'

import {
  CATEGORIES,
  PHASES,
  SaisieRencontreInvalideError,
  anneeSaison,
  bornesSaison,
  estEligibleCategorie,
  estPhaseJourJ,
  labelSaison,
  normaliserSaisieRencontre,
  peutEntrerEnPhase,
  phasePrecedente,
  phasePrecedenteEffective,
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

describe('Cycle de vie en cinq phases (R5, rév. 2026-09-01)', () => {
  it('ordonne les phases : pré-compétition → préparation → compétition → clôture → résultats publics', () => {
    expect(PHASES.map((p) => p.value)).toEqual([
      'pre_competition',
      'preparation',
      'competition',
      'cloture',
      'resultats_publics',
    ])
  })

  it('avance à la phase suivante, préparation insérée avant la compétition', () => {
    expect(phaseSuivante('pre_competition')).toBe('preparation')
    expect(phaseSuivante('preparation')).toBe('competition')
    expect(phaseSuivante('competition')).toBe('cloture')
    expect(phaseSuivante('cloture')).toBe('resultats_publics')
  })

  it('n’avance pas au-delà de la dernière phase', () => {
    expect(phaseSuivante('resultats_publics')).toBeNull()
  })

  it('revient à la phase précédente', () => {
    expect(phasePrecedente('resultats_publics')).toBe('cloture')
    expect(phasePrecedente('cloture')).toBe('competition')
    expect(phasePrecedente('competition')).toBe('preparation')
    expect(phasePrecedente('preparation')).toBe('pre_competition')
  })

  it('ne recule pas avant la première phase', () => {
    expect(phasePrecedente('pre_competition')).toBeNull()
  })
})

describe('Garde-fou « jour J » — préparation ET compétition (R5, rév. 2026-09-02)', () => {
  it('marque préparation et compétition comme phases jour J', () => {
    expect(estPhaseJourJ('preparation')).toBe(true)
    expect(estPhaseJourJ('competition')).toBe(true)
    expect(estPhaseJourJ('pre_competition')).toBe(false)
    expect(estPhaseJourJ('cloture')).toBe(false)
    expect(estPhaseJourJ('resultats_publics')).toBe(false)
  })

  it('autorise l’entrée en préparation/compétition le jour de la rencontre', () => {
    expect(peutEntrerEnPhase('preparation', '2026-10-12', '2026-10-12')).toBe(true)
    expect(peutEntrerEnPhase('competition', '2026-10-12', '2026-10-12')).toBe(true)
  })

  it('refuse l’entrée en préparation/compétition hors du jour J', () => {
    expect(peutEntrerEnPhase('preparation', '2026-10-12', '2026-10-11')).toBe(false)
    expect(peutEntrerEnPhase('competition', '2026-10-12', '2026-10-13')).toBe(false)
  })

  it('n’impose pas de date pour les phases hors jour J', () => {
    expect(peutEntrerEnPhase('pre_competition', '2026-10-12', '2026-01-01')).toBe(true)
    expect(peutEntrerEnPhase('cloture', '2026-10-12', '2026-12-31')).toBe(true)
    expect(peutEntrerEnPhase('resultats_publics', '2026-10-12', '2026-12-31')).toBe(true)
  })
})

describe('Éligibilité d’un grimpeur à la catégorie d’une rencontre (R34)', () => {
  // Saison 2026 (rencontre entre sept. 2026 et août 2027). Âge = 2026 − année.
  const SAISON = 2026

  it('enfant : accepte « moins de 13 ans » et le pivot (13 ans)', () => {
    expect(estEligibleCategorie(2015, 'enfant', SAISON)).toBe(true) // 11 ans
    expect(estEligibleCategorie(2013, 'enfant', SAISON)).toBe(true) // 13 ans (pivot)
  })

  it('enfant : refuse 14 ans et plus', () => {
    expect(estEligibleCategorie(2012, 'enfant', SAISON)).toBe(false) // 14 ans
  })

  it('ado : accepte le pivot (13 ans) jusqu’à 19 ans', () => {
    expect(estEligibleCategorie(2013, 'ado', SAISON)).toBe(true) // 13 ans (pivot)
    expect(estEligibleCategorie(2007, 'ado', SAISON)).toBe(true) // 19 ans
  })

  it('ado : refuse « moins de 13 ans » et « plus de 19 ans »', () => {
    expect(estEligibleCategorie(2015, 'ado', SAISON)).toBe(false) // 11 ans
    expect(estEligibleCategorie(2006, 'ado', SAISON)).toBe(false) // 20 ans
  })

  it('le pivot (13 ans) est éligible aux deux catégories (R34)', () => {
    expect(estEligibleCategorie(2013, 'enfant', SAISON)).toBe(true)
    expect(estEligibleCategorie(2013, 'ado', SAISON)).toBe(true)
  })
})

describe('Retour arrière effectif depuis la compétition (R5, rév. 2026-09-02)', () => {
  it('le jour J : compétition → préparation', () => {
    expect(phasePrecedenteEffective('competition', '2026-10-12', '2026-10-12')).toBe(
      'preparation',
    )
  })

  it('hors jour J : compétition → pré-compétition (saute la préparation jour-J)', () => {
    expect(phasePrecedenteEffective('competition', '2026-10-12', '2026-10-13')).toBe(
      'pre_competition',
    )
  })

  it('préparation → pré-compétition (quelle que soit la date)', () => {
    expect(phasePrecedenteEffective('preparation', '2026-10-12', '2026-10-13')).toBe(
      'pre_competition',
    )
  })

  it('clôture → compétition (retour normal ; l’entrée reste gardée par la date)', () => {
    expect(phasePrecedenteEffective('cloture', '2026-10-12', '2026-10-13')).toBe(
      'competition',
    )
  })
})
