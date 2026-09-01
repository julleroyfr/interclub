import { describe, it, expect } from 'vitest'

import {
  EFFECTIF_EQUIPE_MAX,
  GROUPES_DEPART,
  EngagementInvalideError,
  GroupeDepartInvalideError,
  normaliserNomEquipe,
  verifierAjoutComposition,
  voiesDuGroupeDepart,
} from './engagement'

// Spec #5 « Espace Coach » — domaine pur de l'engagement en rencontre (équipes,
// compositions, groupe de départ). Aucune dépendance Supabase : uniquement les
// invariants métier vérifiés avant écriture (la RLS reste la frontière ultime).

describe('Nom d’équipe — normalisation (R4/R10)', () => {
  it('retire les espaces de bord et réduit les espaces internes (R4)', () => {
    expect(normaliserNomEquipe('  A  1  ')).toBe('A 1')
  })

  it('rejette un nom vide (R10)', () => {
    expect(() => normaliserNomEquipe('   ')).toThrow(EngagementInvalideError)
  })
})

describe('Groupe de départ — liste sélectionnable (R19)', () => {
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

describe('Groupe de départ — dérivation des 3 voies croissantes (R20)', () => {
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

describe('Ajout d’un grimpeur à une équipe (R13/R14/R15)', () => {
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

  it('refuse un grimpeur d’un autre club (R13)', () => {
    expect(() =>
      verifierAjoutComposition({ ...base, grimpeurClubId: 'club-B' }),
    ).toThrow(EngagementInvalideError)
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
