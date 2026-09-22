import { describe, it, expect } from 'vitest'
import {
  creerResultatVitesse,
  enregistrerResultat,
  formaterTempsVitesse,
  ResultatVitesseInvalideError,
} from './vitesse'

// Spec #10 « Saisie de la vitesse — juge » (R7–R11) ; forme du résultat de spec #1
// R31. Domaine pur : la saisie d'un juge porte sur un RÉSULTAT de vitesse à trois
// formes (temps en secondes / chute / non-présentation), unique par grimpeur et
// par rencontre ; une ressaisie remplace (correction). Aucune dépendance Supabase.

describe('Résultat de vitesse — trois formes (R7)', () => {
  it('accepte un temps chronométré en secondes (R8)', () => {
    // Étant donné un juge qui chronomètre un grimpeur en 8,123 s
    // Quand il enregistre ce temps
    // Alors le résultat est un temps portant la durée mesurée en secondes
    expect(creerResultatVitesse({ type: 'temps', secondes: 8.123 })).toEqual({
      type: 'temps',
      secondes: 8.123,
    })
  })

  it('accepte une chute (R7)', () => {
    expect(creerResultatVitesse({ type: 'chute' })).toEqual({ type: 'chute' })
  })

  it('accepte une non-présentation (R7)', () => {
    expect(creerResultatVitesse({ type: 'non_presentation' })).toEqual({
      type: 'non_presentation',
    })
  })

  it('refuse une forme inconnue — exactement trois formes possibles (R7)', () => {
    // « top » n'est pas une issue de vitesse (c'est une épreuve de voie/bloc, spec #1 R30)
    expect(() =>
      creerResultatVitesse({ type: 'top' } as never),
    ).toThrow(ResultatVitesseInvalideError)
  })

  it('refuse un temps qui n’est pas une durée strictement positive (R8)', () => {
    // Un « temps chronométré » est une durée réellement mesurée : > 0.
    expect(() =>
      creerResultatVitesse({ type: 'temps', secondes: 0 }),
    ).toThrow(ResultatVitesseInvalideError)
    expect(() =>
      creerResultatVitesse({ type: 'temps', secondes: -5 }),
    ).toThrow(ResultatVitesseInvalideError)
    expect(() =>
      creerResultatVitesse({ type: 'temps', secondes: Number.NaN }),
    ).toThrow(ResultatVitesseInvalideError)
  })
})

describe('Unicité et correction du résultat par grimpeur (R10/R11)', () => {
  it('enregistre un premier résultat pour un grimpeur (R10)', () => {
    // Étant donné aucune saisie
    const saisies = new Map()
    // Quand le juge saisit le résultat du grimpeur g1
    const apres = enregistrerResultat(saisies, 'g1', { type: 'chute' })
    // Alors le résultat est enregistré, sans muter la saisie d'origine
    expect(apres.get('g1')).toEqual({ type: 'chute' })
    expect(saisies.size).toBe(0)
  })

  it('remplace le résultat d’un grimpeur déjà saisi — correction (R11)', () => {
    // Étant donné un grimpeur d'abord noté en chute
    const saisies = enregistrerResultat(new Map(), 'g1', { type: 'chute' })
    // Quand le juge corrige en un temps valide sur le même grimpeur
    const apres = enregistrerResultat(saisies, 'g1', { type: 'temps', secondes: 8.45 })
    // Alors l'unique résultat passe à ce temps (remplacement, pas de doublon — R10)
    expect(apres.get('g1')).toEqual({ type: 'temps', secondes: 8.45 })
    expect(apres.size).toBe(1)
  })

  it('refuse une saisie sans grimpeur sélectionné (R7)', () => {
    expect(() =>
      enregistrerResultat(new Map(), '', { type: 'chute' }),
    ).toThrow(ResultatVitesseInvalideError)
  })
})

describe('Formatage du temps (R13)', () => {
  it('formate un temps en secondes au millième', () => {
    expect(formaterTempsVitesse(8.123)).toBe('8,123 s')
    expect(formaterTempsVitesse(8.4)).toBe('8,400 s')
  })
})
