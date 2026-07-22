import { describe, it, expect } from 'vitest'
import {
  creerResultatVitesse,
  enregistrerResultat,
  ResultatDejaSaisiError,
  ResultatVitesseInvalideError,
} from './vitesse'

// Spec #1 « Rôles & autorisations » — épreuve de vitesse (R30, R31).
// Domaine pur : la saisie d'un juge porte sur un RÉSULTAT de vitesse à trois
// formes (temps / chute / non-présentation), unique par grimpeur et par
// rencontre. Aucune dépendance Supabase.

describe('Résultat de vitesse (R31)', () => {
  it('accepte un temps chronométré (R31)', () => {
    // Étant donné un juge qui chronomètre un grimpeur
    // Quand il enregistre un temps
    // Alors le résultat est un temps portant la durée mesurée
    expect(creerResultatVitesse({ type: 'temps', centiemes: 812 })).toEqual({
      type: 'temps',
      centiemes: 812,
    })
  })

  it('accepte une chute (R31)', () => {
    expect(creerResultatVitesse({ type: 'chute' })).toEqual({ type: 'chute' })
  })

  it('accepte une non-présentation (R31)', () => {
    expect(creerResultatVitesse({ type: 'non_presentation' })).toEqual({
      type: 'non_presentation',
    })
  })

  it('refuse une forme inconnue — exactement trois formes possibles (R31)', () => {
    // « top » n'est pas une issue de vitesse (c'est une épreuve de voie/bloc, R30)
    expect(() =>
      creerResultatVitesse({ type: 'top' } as never),
    ).toThrow(ResultatVitesseInvalideError)
  })

  it('refuse un temps qui n’est pas une durée strictement positive (R31)', () => {
    // Un « temps chronométré » est une durée réellement mesurée : > 0.
    expect(() =>
      creerResultatVitesse({ type: 'temps', centiemes: 0 }),
    ).toThrow(ResultatVitesseInvalideError)
    expect(() =>
      creerResultatVitesse({ type: 'temps', centiemes: -5 }),
    ).toThrow(ResultatVitesseInvalideError)
  })
})

describe('Unicité du résultat par grimpeur (R31)', () => {
  it('enregistre un premier résultat pour un grimpeur (R31)', () => {
    // Étant donné aucune saisie
    const saisies = new Map()
    // Quand le juge saisit le résultat du grimpeur g1
    const apres = enregistrerResultat(saisies, 'g1', { type: 'chute' })
    // Alors le résultat est enregistré, sans muter la saisie d'origine
    expect(apres.get('g1')).toEqual({ type: 'chute' })
    expect(saisies.size).toBe(0)
  })

  it('refuse un second résultat pour un grimpeur déjà saisi (R31)', () => {
    // Étant donné un grimpeur déjà chronométré
    const saisies = enregistrerResultat(new Map(), 'g1', {
      type: 'temps',
      centiemes: 812,
    })
    // Quand le juge tente une seconde saisie pour le même grimpeur
    // Alors elle est refusée (un seul résultat par grimpeur, pas d'autre passage)
    expect(() =>
      enregistrerResultat(saisies, 'g1', { type: 'temps', centiemes: 799 }),
    ).toThrow(ResultatDejaSaisiError)
  })

  it('refuse une saisie sans grimpeur sélectionné (R31)', () => {
    expect(() =>
      enregistrerResultat(new Map(), '', { type: 'chute' }),
    ).toThrow(ResultatVitesseInvalideError)
  })
})
