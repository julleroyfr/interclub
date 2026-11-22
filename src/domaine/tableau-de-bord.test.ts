import { describe, expect, it } from 'vitest'

import { ONGLET_PAR_DEFAUT, ongletsDisponibles, resoudreOnglet } from './tableau-de-bord'

// Spec #3 R41k — tableau de bord d'une rencontre organisé en onglets.

describe('ongletsDisponibles (R41k)', () => {
  it('enfant : les cinq onglets, dans l’ordre (R41k, R41e)', () => {
    expect(ongletsDisponibles('enfant', 'competition')).toEqual([
      'vue',
      'structure',
      'equipes',
      'prets',
      'statistiques',
    ])
  })

  it('ado : pas d’onglet Statistiques (R41e)', () => {
    expect(ongletsDisponibles('ado', 'competition')).toEqual(['vue', 'structure', 'equipes', 'prets'])
  })

  it('adulte : ni Prêts (spec #20 R11) ni Statistiques (R41e)', () => {
    expect(ongletsDisponibles('adulte', 'competition')).toEqual(['vue', 'structure', 'equipes'])
  })

  it.each(['cloture', 'resultats_publics'] as const)(
    '%s : onglet Contrôle des NP en dernier, toutes catégories (R41k, R41l)',
    (phase) => {
      expect(ongletsDisponibles('enfant', phase).at(-1)).toBe('np')
      expect(ongletsDisponibles('ado', phase)).toEqual(['vue', 'structure', 'equipes', 'prets', 'np'])
      expect(ongletsDisponibles('adulte', phase)).toEqual(['vue', 'structure', 'equipes', 'np'])
    },
  )

  it.each(['pre_competition', 'preparation', 'competition'] as const)(
    '%s : pas d’onglet Contrôle des NP (R41k)',
    (phase) => {
      expect(ongletsDisponibles('enfant', phase)).not.toContain('np')
    },
  )
})

describe('resoudreOnglet (R41k)', () => {
  it('la Vue d’ensemble est l’onglet par défaut', () => {
    expect(ONGLET_PAR_DEFAUT).toBe('vue')
  })

  it('sans paramètre → Vue d’ensemble', () => {
    expect(resoudreOnglet(undefined, 'enfant', 'competition')).toBe('vue')
    expect(resoudreOnglet(null, 'enfant', 'competition')).toBe('vue')
    expect(resoudreOnglet('', 'enfant', 'competition')).toBe('vue')
  })

  it('onglet disponible → cet onglet', () => {
    expect(resoudreOnglet('structure', 'enfant', 'competition')).toBe('structure')
    expect(resoudreOnglet('equipes', 'adulte', 'competition')).toBe('equipes')
    expect(resoudreOnglet('statistiques', 'enfant', 'competition')).toBe('statistiques')
  })

  it('onglet inconnu → Vue d’ensemble', () => {
    expect(resoudreOnglet('pirate', 'enfant', 'competition')).toBe('vue')
    expect(resoudreOnglet('STRUCTURE', 'enfant', 'competition')).toBe('vue')
  })

  it('onglet absent pour cette rencontre → Vue d’ensemble', () => {
    expect(resoudreOnglet('prets', 'adulte', 'competition')).toBe('vue')
    expect(resoudreOnglet('statistiques', 'ado', 'competition')).toBe('vue')
    expect(resoudreOnglet('statistiques', 'adulte', 'competition')).toBe('vue')
  })

  it('np : seulement en ④/⑤ (R41k)', () => {
    expect(resoudreOnglet('np', 'ado', 'cloture')).toBe('np')
    expect(resoudreOnglet('np', 'enfant', 'competition')).toBe('vue')
  })

  it('paramètre répété (?onglet=a&onglet=b) → le premier', () => {
    expect(resoudreOnglet(['equipes', 'prets'], 'enfant', 'competition')).toBe('equipes')
  })
})
