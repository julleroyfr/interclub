import { describe, expect, it } from 'vitest'

import { ONGLET_PAR_DEFAUT, ongletsDisponibles, resoudreOnglet } from './tableau-de-bord'

// Spec #3 R41k — tableau de bord d'une rencontre organisé en onglets.

describe('ongletsDisponibles (R41k)', () => {
  it('enfant : les cinq onglets, dans l’ordre (R41k, R41e)', () => {
    expect(ongletsDisponibles('enfant')).toEqual([
      'vue',
      'structure',
      'equipes',
      'prets',
      'statistiques',
    ])
  })

  it('ado : pas d’onglet Statistiques (R41e)', () => {
    expect(ongletsDisponibles('ado')).toEqual(['vue', 'structure', 'equipes', 'prets'])
  })

  it('adulte : ni Prêts (spec #20 R11) ni Statistiques (R41e)', () => {
    expect(ongletsDisponibles('adulte')).toEqual(['vue', 'structure', 'equipes'])
  })
})

describe('resoudreOnglet (R41k)', () => {
  it('la Vue d’ensemble est l’onglet par défaut', () => {
    expect(ONGLET_PAR_DEFAUT).toBe('vue')
  })

  it('sans paramètre → Vue d’ensemble', () => {
    expect(resoudreOnglet(undefined, 'enfant')).toBe('vue')
    expect(resoudreOnglet(null, 'enfant')).toBe('vue')
    expect(resoudreOnglet('', 'enfant')).toBe('vue')
  })

  it('onglet disponible → cet onglet', () => {
    expect(resoudreOnglet('structure', 'enfant')).toBe('structure')
    expect(resoudreOnglet('equipes', 'adulte')).toBe('equipes')
    expect(resoudreOnglet('statistiques', 'enfant')).toBe('statistiques')
  })

  it('onglet inconnu → Vue d’ensemble', () => {
    expect(resoudreOnglet('pirate', 'enfant')).toBe('vue')
    expect(resoudreOnglet('STRUCTURE', 'enfant')).toBe('vue')
  })

  it('onglet absent pour cette rencontre → Vue d’ensemble', () => {
    expect(resoudreOnglet('prets', 'adulte')).toBe('vue')
    expect(resoudreOnglet('statistiques', 'ado')).toBe('vue')
    expect(resoudreOnglet('statistiques', 'adulte')).toBe('vue')
  })

  it('paramètre répété (?onglet=a&onglet=b) → le premier', () => {
    expect(resoudreOnglet(['equipes', 'prets'], 'enfant')).toBe('equipes')
  })
})
