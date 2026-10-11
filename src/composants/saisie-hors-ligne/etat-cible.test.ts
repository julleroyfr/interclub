import { describe, expect, it } from 'vitest'

import { indicateurCible } from './etat-cible'

// Spec #17 R23 (rév. 2026-10-09) : état affiché sur chaque cible saisie.

const base = {
  enAttente: false,
  attenteLongue: false,
  enregistreApresAttente: false,
  confirme: false,
  rejete: false,
}

describe('spec #17 — État affiché sur une cible (R23, rév. 2026-10-09)', () => {
  it('en attente depuis moins de 2 s : rien', () => {
    expect(indicateurCible({ ...base, enAttente: true })).toBeNull()
  })

  it('en attente depuis plus de 2 s : « en attente »', () => {
    expect(indicateurCible({ ...base, enAttente: true, attenteLongue: true })).toBe('attente')
  })

  it('enregistré après une attente courte : rien', () => {
    expect(indicateurCible({ ...base, confirme: true })).toBeNull()
  })

  it('enregistré à la fin d’une attente longue : « enregistré »', () => {
    expect(indicateurCible({ ...base, confirme: true, enregistreApresAttente: true })).toBe('enregistre')
  })

  it('rejetée : immédiat', () => {
    expect(indicateurCible({ ...base, rejete: true })).toBe('rejet')
  })

  it('nouvelle saisie en cours sur une cible rejetée : le rejet reste signalé tant que l’attente est courte', () => {
    expect(indicateurCible({ ...base, enAttente: true, rejete: true })).toBe('rejet')
    expect(indicateurCible({ ...base, enAttente: true, attenteLongue: true, rejete: true })).toBe('attente')
  })
})
