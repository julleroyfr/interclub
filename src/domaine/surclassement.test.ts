import { describe, expect, it } from 'vitest'

import type { BornesAge } from './rencontre'
import {
  estEligibleRencontre,
  estSurclassable,
  messageRevocation,
  refusAccordSurclassement,
  saisonsSurclassement,
  selectionnerRetraits,
  surclassementActif,
  type EngagementAdo,
} from './surclassement'

// Saison 2026-2027 : âge de bascule 12, âge maximum ado 18 (spec #1 R34bis).
const SAISON = 2026
const BORNES: BornesAge = { ageBascule: 12, ageAdoMax: 18 }

describe('spec #21 — Accord d’un surclassement', () => {
  it('saison courante (par défaut) et saison suivante (R2)', () => {
    expect(saisonsSurclassement('2026-11-07')).toEqual([2026, 2027])
    // Avant le 1er septembre : la saison courante est celle de l’année précédente.
    expect(saisonsSurclassement('2027-08-31')).toEqual([2026, 2027])
    expect(saisonsSurclassement('2027-09-01')).toEqual([2027, 2028])
  })

  it('seul un enfant d’âge strictement inférieur à B est surclassable (R3)', () => {
    expect(estSurclassable(2015, SAISON, BORNES)).toBe(true) // 11 ans
    expect(estSurclassable(2019, SAISON, BORNES)).toBe(true) // 7 ans
    expect(estSurclassable(2014, SAISON, BORNES)).toBe(false) // 12 ans (pivot)
    expect(estSurclassable(2012, SAISON, BORNES)).toBe(false) // 14 ans
  })

  it('l’âge est rapporté à la saison choisie (R2, R3)', () => {
    // Né en 2015 : 11 ans en 2026 (surclassable), 12 ans en 2027 (pivot).
    expect(estSurclassable(2015, 2027, BORNES)).toBe(false)
  })

  it('refuse un grimpeur déjà éligible ado (R3)', () => {
    expect(
      refusAccordSurclassement({ anneeNaissance: 2014, saison: SAISON, bornes: BORNES, dejaActif: false }),
    ).toBe('Ce grimpeur est déjà éligible en ado pour cette saison.')
  })

  it('refuse un grimpeur déjà surclassé pour la saison (R4)', () => {
    expect(
      refusAccordSurclassement({ anneeNaissance: 2015, saison: SAISON, bornes: BORNES, dejaActif: true }),
    ).toBe('Ce grimpeur est déjà surclassé pour cette saison.')
  })

  it('accepte un enfant sous la bascule non surclassé (R3, R4)', () => {
    expect(
      refusAccordSurclassement({ anneeNaissance: 2015, saison: SAISON, bornes: BORNES, dejaActif: false }),
    ).toBeNull()
  })
})

describe('spec #21 — Surclassement actif (R4, R5, R11)', () => {
  const lignes = [
    { saison: 2026, accordeLe: '2026-10-02T10:00:00Z', revoqueLe: '2026-10-20T10:00:00Z' },
    { saison: 2026, accordeLe: '2026-11-12T10:00:00Z', revoqueLe: null },
    { saison: 2025, accordeLe: '2025-10-01T10:00:00Z', revoqueLe: null },
  ]

  it('retient la ligne non révoquée de la saison (R4, R11)', () => {
    expect(surclassementActif(lignes, 2026)?.accordeLe).toBe('2026-11-12T10:00:00Z')
  })

  it('un surclassement révoqué n’est plus actif (R11)', () => {
    expect(surclassementActif([lignes[0]], 2026)).toBeNull()
  })

  it('un surclassement ne se reporte pas sur une autre saison (R5)', () => {
    expect(surclassementActif(lignes, 2027)).toBeNull()
  })
})

describe('spec #21 — Éligibilité avec surclassement (R7, R8)', () => {
  it('un surclassé est éligible ado en plus de l’enfant (R7)', () => {
    expect(estEligibleRencontre(2015, 'ado', SAISON, BORNES, true)).toBe(true)
    expect(estEligibleRencontre(2015, 'enfant', SAISON, BORNES, true)).toBe(true)
  })

  it('sans surclassement, l’éligibilité est celle de l’âge (spec #1 R34)', () => {
    expect(estEligibleRencontre(2015, 'ado', SAISON, BORNES, false)).toBe(false)
    expect(estEligibleRencontre(2015, 'enfant', SAISON, BORNES, false)).toBe(true)
    expect(estEligibleRencontre(2012, 'ado', SAISON, BORNES, false)).toBe(true)
  })

  it('le surclassement n’ouvre pas l’adulte (R8)', () => {
    expect(estEligibleRencontre(2015, 'adulte', SAISON, BORNES, true)).toBe(false)
  })
})

describe('spec #21 — Retraits à la révocation (R12, R13)', () => {
  const engagements: EngagementAdo[] = [
    { rencontreId: 'r1', categorie: 'ado', saison: 2026, phase: 'pre_competition', nature: 'composition' },
    { rencontreId: 'r2', categorie: 'ado', saison: 2026, phase: 'preparation', nature: 'pret' },
    { rencontreId: 'r3', categorie: 'ado', saison: 2026, phase: 'competition', nature: 'composition' },
    { rencontreId: 'r4', categorie: 'ado', saison: 2026, phase: 'cloture', nature: 'composition' },
    { rencontreId: 'r5', categorie: 'ado', saison: 2026, phase: 'resultats_publics', nature: 'composition' },
    { rencontreId: 'r6', categorie: 'enfant', saison: 2026, phase: 'pre_competition', nature: 'composition' },
    { rencontreId: 'r7', categorie: 'ado', saison: 2027, phase: 'pre_competition', nature: 'composition' },
  ]

  it('retire des rencontres ado de la saison en ① ou ②, compositions et prêts (R12)', () => {
    const retraits = selectionnerRetraits(engagements, 2026, false)
    expect(retraits.map((e) => e.rencontreId)).toEqual(['r1', 'r2'])
  })

  it('ne touche aucune rencontre en ③, ④ ou ⑤ (R13)', () => {
    const ids = selectionnerRetraits(engagements, 2026, false).map((e) => e.rencontreId)
    expect(ids).not.toContain('r3')
    expect(ids).not.toContain('r4')
    expect(ids).not.toContain('r5')
  })

  it('ne touche ni l’enfant ni une autre saison (R7, R5)', () => {
    const ids = selectionnerRetraits(engagements, 2026, false).map((e) => e.rencontreId)
    expect(ids).not.toContain('r6')
    expect(ids).not.toContain('r7')
  })

  it('aucun retrait si le grimpeur est éligible ado par son âge (R12)', () => {
    expect(selectionnerRetraits(engagements, 2026, true)).toEqual([])
  })
})

describe('spec #21 — Message après révocation (R15)', () => {
  it('rappelle le nombre de retraits, accordé', () => {
    expect(messageRevocation('Tom DURAND', 0)).toBe(
      'Surclassement révoqué. Aucun engagement ado à venir.',
    )
    expect(messageRevocation('Tom DURAND', 1)).toBe(
      'Surclassement révoqué. Tom DURAND a été retiré de 1 rencontre ado à venir.',
    )
    expect(messageRevocation('Tom DURAND', 2)).toBe(
      'Surclassement révoqué. Tom DURAND a été retiré de 2 rencontres ado à venir.',
    )
  })
})
