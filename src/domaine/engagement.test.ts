import { describe, it, expect } from 'vitest'

import {
  EFFECTIF_EQUIPE_MAX,
  GROUPES_DEPART,
  EngagementInvalideError,
  GroupeDepartInvalideError,
  filtrerGrimpeursRecherche,
  nomEquipeParDefaut,
  normaliserNomEquipe,
  equipesCiblesChangement,
  verifierChangementEquipe,
  verifierAjoutComposition,
  voiesDuGroupeDepart,
} from './engagement'

// Spec #5 « Espace Coach » — domaine pur de l'engagement en rencontre (équipes,
// compositions, groupe de départ). Aucune dépendance Supabase : uniquement les
// invariants métier vérifiés avant écriture (la RLS reste la frontière ultime).

describe('spec #5 — Nom d’équipe — normalisation (R4/R10)', () => {
  it('retire les espaces de bord et réduit les espaces internes (R4)', () => {
    expect(normaliserNomEquipe('  A  1  ')).toBe('A 1')
  })

  it('rejette un nom vide (R10)', () => {
    expect(() => normaliserNomEquipe('   ')).toThrow(EngagementInvalideError)
  })
})

describe('spec #5 — Nom d’équipe par défaut (R10bis)', () => {
  it('propose « <club> 1 » quand le club n’a aucune équipe', () => {
    expect(nomEquipeParDefaut('Vertical', [])).toBe('Vertical 1')
  })

  it('incrémente le plus grand numéro existant', () => {
    expect(nomEquipeParDefaut('Vertical', ['Vertical 1', 'Vertical 2'])).toBe('Vertical 3')
  })

  it('ne réutilise pas un numéro libéré (max + 1)', () => {
    expect(nomEquipeParDefaut('Vertical', ['Vertical 1', 'Vertical 3'])).toBe('Vertical 4')
  })

  it('ignore les équipes nommées hors motif', () => {
    expect(
      nomEquipeParDefaut('Vertical', ['Minimes', 'Vertical', 'Vertical 2b', 'Vertical 0', 'vertical 5']),
    ).toBe('Vertical 1')
  })

  it('compare après normalisation (R4) du nom de club et des équipes', () => {
    expect(nomEquipeParDefaut('  Grimp  Ouest ', ['Grimp Ouest  2 '])).toBe('Grimp Ouest 3')
  })

  it('traite les caractères spéciaux du nom de club littéralement', () => {
    expect(nomEquipeParDefaut('C.A.F (33)', ['CxAxF (33) 4', 'C.A.F (33) 2'])).toBe('C.A.F (33) 3')
  })
})

describe('spec #5 — Recherche dans le roster à l’ajout (R12bis)', () => {
  const roster = [
    { id: '1', prenom: 'Ana', nom: 'Alpha' },
    { id: '2', prenom: 'Éléonore', nom: 'Dupré' },
    { id: '3', prenom: 'Bob', nom: 'Alpha' },
  ]
  const ids = (q: string) => filtrerGrimpeursRecherche(roster, q).map((g) => g.id)

  it('une recherche vide (ou blanche) propose tout le roster', () => {
    expect(ids('')).toEqual(['1', '2', '3'])
    expect(ids('   ')).toEqual(['1', '2', '3'])
  })

  it('filtre sur le nom ou le prénom, insensible à la casse', () => {
    expect(ids('ALPHA')).toEqual(['1', '3'])
    expect(ids('bob')).toEqual(['3'])
  })

  it('est insensible aux accents, dans les deux sens', () => {
    expect(ids('eleonore')).toEqual(['2'])
    expect(ids('dupré')).toEqual(['2'])
  })

  it('exige chaque terme, dans n’importe quel ordre', () => {
    expect(ids('ana alp')).toEqual(['1'])
    expect(ids('alpha ANA')).toEqual(['1'])
    expect(ids('ana dupre')).toEqual([])
  })

  it('préserve l’ordre et renvoie les objets d’origine', () => {
    expect(filtrerGrimpeursRecherche(roster, 'a')[0]).toBe(roster[0])
  })
})

describe('spec #5 — Groupe de départ — liste sélectionnable (R19)', () => {
  it('propose l’échelle M1–M4 puis T1–T8, sans T9 ni T10', () => {
    expect(GROUPES_DEPART).toEqual([
      'M1', 'M2', 'M3', 'M4',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8',
    ])
  })

  it('exclut T9 et T10 (départs ne laissant pas 3 voies)', () => {
    expect(GROUPES_DEPART).not.toContain('T9')
    expect(GROUPES_DEPART).not.toContain('T10')
  })
})

describe('spec #5 — Groupe de départ — dérivation des 3 voies croissantes (R20)', () => {
  it('M2 ⇒ M2, M3, M4', () => {
    expect(voiesDuGroupeDepart('M2')).toEqual(['M2', 'M3', 'M4'])
  })

  it('M4 ⇒ M4, T1, T2 (franchit moulinette → tête)', () => {
    expect(voiesDuGroupeDepart('M4')).toEqual(['M4', 'T1', 'T2'])
  })

  it('T8 ⇒ T8, T9, T10 (dernier départ possible)', () => {
    expect(voiesDuGroupeDepart('T8')).toEqual(['T8', 'T9', 'T10'])
  })

  it('renvoie toujours exactement 3 voies pour un groupe valide', () => {
    for (const g of GROUPES_DEPART) {
      expect(voiesDuGroupeDepart(g)).toHaveLength(3)
    }
  })

  it('rejette T9/T10 comme groupe de départ (R19/R20)', () => {
    expect(() => voiesDuGroupeDepart('T9')).toThrow(GroupeDepartInvalideError)
    expect(() => voiesDuGroupeDepart('T10')).toThrow(GroupeDepartInvalideError)
  })

  it('rejette un niveau hors échelle', () => {
    expect(() => voiesDuGroupeDepart('X1')).toThrow(GroupeDepartInvalideError)
  })
})

describe('spec #5 — Ajout d’un grimpeur à une équipe (R13/R14/R15)', () => {
  const base = {
    grimpeurId: 'g-neuf',
    grimpeurClubId: 'club-A',
    equipeClubId: 'club-A',
    membresActuels: [] as string[],
    dejaEngagesRencontre: [] as string[],
  }

  it('accepte l’ajout d’un grimpeur du club, équipe non pleine, non déjà engagé', () => {
    expect(() => verifierAjoutComposition(base)).not.toThrow()
  })

  it('refuse un grimpeur d’un autre club NON prêté (R13)', () => {
    expect(() =>
      verifierAjoutComposition({ ...base, grimpeurClubId: 'club-B' }),
    ).toThrow(EngagementInvalideError)
  })

  it('accepte un grimpeur d’un autre club s’il est prêté (estPrete, spec #1 R36)', () => {
    expect(() =>
      verifierAjoutComposition({ ...base, grimpeurClubId: 'club-B', estPrete: true }),
    ).not.toThrow()
  })

  it('refuse un grimpeur déjà engagé dans une autre équipe de la rencontre (R14)', () => {
    expect(() =>
      verifierAjoutComposition({ ...base, dejaEngagesRencontre: ['g-neuf'] }),
    ).toThrow(EngagementInvalideError)
  })

  it('refuse l’ajout d’un 9ᵉ grimpeur (plafond 8, R15)', () => {
    const membresActuels = Array.from({ length: EFFECTIF_EQUIPE_MAX }, (_, i) => `m${i}`)
    expect(() =>
      verifierAjoutComposition({ ...base, membresActuels }),
    ).toThrow(EngagementInvalideError)
  })

  it('accepte le 8ᵉ grimpeur (l’équipe atteint le plafond, R15)', () => {
    const membresActuels = Array.from({ length: EFFECTIF_EQUIPE_MAX - 1 }, (_, i) => `m${i}`)
    expect(() =>
      verifierAjoutComposition({ ...base, membresActuels }),
    ).not.toThrow()
  })

  it('plafond d’équipe fixé à 8 (règlement §6)', () => {
    expect(EFFECTIF_EQUIPE_MAX).toBe(8)
  })
})

/**
 * Changement d'équipe par l'admin (spec #3 R41d, validée le 2026-10-03) : au sein
 * de la même rencontre, vers une autre équipe du CLUB D'AFFECTATION uniquement
 * (club de l'équipe actuelle — club d'accueil pour un prêté), plafond de l'équipe
 * cible respecté (spec #5 R15). Le grimpeur reste engagé : ses résultats sont
 * conservés (spec #10 R18bis) — c'est une mise à jour, pas un retrait + ajout.
 */
describe('verifierChangementEquipe (spec #3 R41d)', () => {
  const source = { id: 'eq-A1', clubId: 'club-A', rencontreId: 'r-1' }
  const cible = { id: 'eq-A2', clubId: 'club-A', rencontreId: 'r-1', effectif: 3 }

  it('accepte une autre équipe du même club dans la même rencontre (R41d)', () => {
    expect(() => verifierChangementEquipe({ equipeSource: source, equipeCible: cible })).not.toThrow()
  })

  it('refuse une équipe d’un autre club, même pour un prêté (R41d)', () => {
    expect(() =>
      verifierChangementEquipe({
        equipeSource: source,
        equipeCible: { ...cible, id: 'eq-B1', clubId: 'club-B' },
      }),
    ).toThrow(EngagementInvalideError)
  })

  it('refuse une équipe d’une autre rencontre (R41d)', () => {
    expect(() =>
      verifierChangementEquipe({ equipeSource: source, equipeCible: { ...cible, rencontreId: 'r-2' } }),
    ).toThrow(EngagementInvalideError)
  })

  it('refuse l’équipe actuelle comme cible (pas un changement, R41d)', () => {
    expect(() =>
      verifierChangementEquipe({ equipeSource: source, equipeCible: { ...cible, id: source.id } }),
    ).toThrow(EngagementInvalideError)
  })

  it('refuse une équipe cible déjà au plafond de 8 (R41d, spec #5 R15)', () => {
    expect(() =>
      verifierChangementEquipe({
        equipeSource: source,
        equipeCible: { ...cible, effectif: EFFECTIF_EQUIPE_MAX },
      }),
    ).toThrow(EngagementInvalideError)
  })

  it('accepte une équipe cible à 7 membres : le grimpeur en devient le 8ᵉ (R41d, spec #5 R15)', () => {
    expect(() =>
      verifierChangementEquipe({
        equipeSource: source,
        equipeCible: { ...cible, effectif: EFFECTIF_EQUIPE_MAX - 1 },
      }),
    ).not.toThrow()
  })
})

describe('equipesCiblesChangement (spec #3 R41d)', () => {
  const equipes = [
    { id: 'eq-A1', clubId: 'club-A', nom: 'Club A 1' },
    { id: 'eq-A2', clubId: 'club-A', nom: 'Club A 2' },
    { id: 'eq-A3', clubId: 'club-A', nom: 'Club A 3' },
    { id: 'eq-B1', clubId: 'club-B', nom: 'Club B 1' },
  ]

  it('propose les autres équipes du club d’affectation, sans l’équipe actuelle ni les autres clubs (R41d)', () => {
    expect(equipesCiblesChangement(equipes, 'eq-A1').map((e) => e.id)).toEqual(['eq-A2', 'eq-A3'])
  })

  it('ne propose rien quand le club d’affectation n’a qu’une équipe (R41d)', () => {
    expect(equipesCiblesChangement(equipes, 'eq-B1')).toEqual([])
  })

  it('ne propose rien pour une équipe inconnue', () => {
    expect(equipesCiblesChangement(equipes, 'eq-inconnue')).toEqual([])
  })
})
