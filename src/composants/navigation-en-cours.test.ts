import { describe, expect, it } from 'vitest'

import { declencheNavigation, type ClicLien } from './navigation-en-cours'

/** Décision « ce clic lance-t-il une navigation dans l'onglet ? » (spec #12 R26). */
const ICI = 'https://interclub.test/admin'

function clic(partiel: Partial<ClicLien> = {}): ClicLien {
  return {
    href: 'https://interclub.test/admin/clubs',
    target: '',
    telechargement: false,
    bouton: 0,
    modificateur: false,
    dejaGere: false,
    ...partiel,
  }
}

describe('declencheNavigation (spec #12 R26)', () => {
  it('lien interne vers une autre page → navigation', () => {
    expect(declencheNavigation(clic(), ICI)).toBe(true)
  })

  it('changement de paramètres de recherche → navigation', () => {
    expect(declencheNavigation(clic({ href: `${ICI}?saison=2026` }), ICI)).toBe(true)
  })

  it('lien externe → pas de navigation suivie', () => {
    expect(declencheNavigation(clic({ href: 'https://ffme.fr/' }), ICI)).toBe(false)
  })

  it('nouvel onglet (target=_blank) → non', () => {
    expect(declencheNavigation(clic({ target: '_blank' }), ICI)).toBe(false)
  })

  it('target=_self → navigation', () => {
    expect(declencheNavigation(clic({ target: '_self' }), ICI)).toBe(true)
  })

  it('Ctrl/Cmd/Maj/Alt + clic → non', () => {
    expect(declencheNavigation(clic({ modificateur: true }), ICI)).toBe(false)
  })

  it('clic milieu / droit → non', () => {
    expect(declencheNavigation(clic({ bouton: 1 }), ICI)).toBe(false)
  })

  it('téléchargement (export PDF) → non', () => {
    expect(declencheNavigation(clic({ telechargement: true }), ICI)).toBe(false)
  })

  it('clic déjà géré (preventDefault) → non', () => {
    expect(declencheNavigation(clic({ dejaGere: true }), ICI)).toBe(false)
  })

  it('lien vers la page courante → non', () => {
    expect(declencheNavigation(clic({ href: ICI }), ICI)).toBe(false)
  })

  it('ancre de la même page → non', () => {
    expect(declencheNavigation(clic({ href: `${ICI}#classement` }), ICI)).toBe(false)
  })

  it('protocole non web (mailto:, tel:) → non', () => {
    expect(declencheNavigation(clic({ href: 'mailto:club@test.fr' }), ICI)).toBe(false)
  })
})
