import { describe, expect, it } from 'vitest'

import { doitRelire } from './echo-temps-reel'

// Spec #11 R6bis : sur un écran de saisie, l'écho de ses propres écritures ne
// relance pas de relecture ; tout le reste, si.

const MOI = 'u-moi'
const AUTRE = 'u-autre'

const insert = (auteur: string | null) => ({
  eventType: 'INSERT' as const,
  new: { auteur_utilisateur_id: auteur },
  old: {},
})
const update = (auteur: string | null) => ({
  eventType: 'UPDATE' as const,
  new: { auteur_utilisateur_id: auteur },
  old: { auteur_utilisateur_id: AUTRE },
})

describe('spec #11 — Écho de ses propres saisies (R6bis)', () => {
  it('écran de saisie : ignore un INSERT ou UPDATE dont je suis l’auteur', () => {
    expect(doitRelire(insert(MOI), { ignorerMesEcritures: true, utilisateurId: MOI })).toBe(false)
    expect(doitRelire(update(MOI), { ignorerMesEcritures: true, utilisateurId: MOI })).toBe(false)
  })

  it('relit l’écriture d’un autre utilisateur (R2)', () => {
    expect(doitRelire(insert(AUTRE), { ignorerMesEcritures: true, utilisateurId: MOI })).toBe(true)
  })

  it('relit un DELETE : l’auteur de la suppression est inconnu', () => {
    const suppression = {
      eventType: 'DELETE' as const,
      new: {},
      old: { auteur_utilisateur_id: MOI },
    }
    expect(doitRelire(suppression, { ignorerMesEcritures: true, utilisateurId: MOI })).toBe(true)
  })

  it('relit une écriture sans auteur (table dérivée points_vitesse)', () => {
    const derivee = { eventType: 'UPDATE' as const, new: { points: 12 }, old: {} }
    expect(doitRelire(derivee, { ignorerMesEcritures: true, utilisateurId: MOI })).toBe(true)
    expect(doitRelire(insert(null), { ignorerMesEcritures: true, utilisateurId: MOI })).toBe(true)
  })

  it('relit tant que l’utilisateur courant n’est pas connu', () => {
    expect(doitRelire(insert(MOI), { ignorerMesEcritures: true, utilisateurId: null })).toBe(true)
  })

  it('classement / contrôle : relit toute écriture, même la mienne', () => {
    expect(doitRelire(insert(MOI), { ignorerMesEcritures: false, utilisateurId: MOI })).toBe(true)
  })
})

describe('spec #11 — Pertinence pour l’écran (R8bis)', () => {
  const affiches = new Set(['g-affiche'])
  const options = { ignorerMesEcritures: true, utilisateurId: MOI, grimpeursAffiches: affiches }
  const ecriture = (grimpeur: string | null, eventType: 'INSERT' | 'UPDATE' | 'DELETE' = 'INSERT') => ({
    eventType,
    new: eventType === 'DELETE' ? {} : { auteur_utilisateur_id: AUTRE, grimpeur_id: grimpeur },
    old: eventType === 'DELETE' ? { grimpeur_id: grimpeur } : {},
  })

  it('relit une écriture concernant un grimpeur affiché', () => {
    expect(doitRelire(ecriture('g-affiche'), options)).toBe(true)
  })

  it('ignore une écriture d’un grimpeur non affiché (autre club, autre rencontre)', () => {
    expect(doitRelire(ecriture('g-ailleurs'), options)).toBe(false)
  })

  it('suppression : le grimpeur de l’ancienne ligne décide ; sans grimpeur, relit', () => {
    expect(doitRelire(ecriture('g-ailleurs', 'DELETE'), options)).toBe(false)
    expect(doitRelire(ecriture('g-affiche', 'DELETE'), options)).toBe(true)
    expect(doitRelire({ eventType: 'DELETE', new: {}, old: { id: 'x' } }, options)).toBe(true)
  })

  it('sans liste de grimpeurs affichés (classement, contrôle), relit tout', () => {
    expect(doitRelire(ecriture('g-ailleurs'), { ignorerMesEcritures: false, utilisateurId: MOI })).toBe(true)
  })
})
