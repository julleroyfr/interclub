import { describe, it, expect } from 'vitest'

import {
  ANNEE_NAISSANCE_MAX,
  ANNEE_NAISSANCE_MIN,
  GrimpeurInvalideError,
  NOM_GRIMPEUR_MAX,
  normaliserSaisieGrimpeur,
} from './grimpeur'

// Spec #1 R18 / spec #3 R21–R21b — roster de grimpeurs d'un club. Domaine pur :
// valide/normalise nom, prenom, annee_naissance, sexe et licence avant ecriture
// Supabase. Aucune dependance Supabase ici.

describe("Saisie d'un grimpeur (R18)", () => {
  const valide = {
    nom: 'Dupont',
    prenom: 'Lea',
    anneeNaissance: '2014',
    sexe: 'F',
    licence: '123456',
  }

  it('normalise une saisie valide', () => {
    expect(normaliserSaisieGrimpeur(valide)).toEqual({
      nom: 'Dupont',
      prenom: 'Lea',
      anneeNaissance: 2014,
      sexe: 'F',
      licence: 123456,
    })
  })

  // Licence obligatoire, entier strictement positif (spec #3 R21b).
  it('rejette une licence absente (R21b)', () => {
    const { licence: _, ...sanslicence } = valide
    expect(() => normaliserSaisieGrimpeur(sanslicence as never)).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette une licence vide (R21b)', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '' })).toThrow(
      GrimpeurInvalideError,
    )
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '   ' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette une licence non entiere (R21b)', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: 'abc' })).toThrow(
      GrimpeurInvalideError,
    )
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '123.5' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette une licence <= 0 (R21b)', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '0' })).toThrow(
      GrimpeurInvalideError,
    )
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '-1' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  // Sexe obligatoire 'F'/'H' — prerequis du classement individuel separe par
  // sexe (spec #7 R8b) ; reflet du check SQL `grimpeur.sexe in ('F','H')`.
  it('conserve le sexe Femme ou Homme', () => {
    expect(normaliserSaisieGrimpeur({ ...valide, sexe: 'F' }).sexe).toBe('F')
    expect(normaliserSaisieGrimpeur({ ...valide, sexe: 'H' }).sexe).toBe('H')
  })

  it('rejette un sexe absent', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, sexe: '' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette un sexe hors F/H', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, sexe: 'G' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('retire les espaces de bord et reduit les espaces internes', () => {
    const g = normaliserSaisieGrimpeur({
      nom: '  Van   der Berg  ',
      prenom: '  Marie  Claire ',
      anneeNaissance: ' 2013 ',
      sexe: 'F',
      licence: ' 123456 ',
    })
    expect(g.nom).toBe('Van der Berg')
    expect(g.prenom).toBe('Marie Claire')
    expect(g.anneeNaissance).toBe(2013)
    expect(g.licence).toBe(123456)
  })

  it('rejette un nom vide', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, nom: '  ' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette un prenom vide', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, prenom: '' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette un nom trop long', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, nom: 'x'.repeat(NOM_GRIMPEUR_MAX + 1) }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('rejette une annee non numerique', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, anneeNaissance: 'abcd' }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('rejette une annee decimale', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, anneeNaissance: '2014.5' }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('rejette une annee hors bornes', () => {
    expect(() =>
      normaliserSaisieGrimpeur({
        ...valide,
        anneeNaissance: String(ANNEE_NAISSANCE_MIN - 1),
      }),
    ).toThrow(GrimpeurInvalideError)
    expect(() =>
      normaliserSaisieGrimpeur({
        ...valide,
        anneeNaissance: String(ANNEE_NAISSANCE_MAX + 1),
      }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('accepte les annees aux bornes', () => {
    expect(
      normaliserSaisieGrimpeur({
        ...valide,
        anneeNaissance: String(ANNEE_NAISSANCE_MIN),
      }).anneeNaissance,
    ).toBe(ANNEE_NAISSANCE_MIN)
    expect(
      normaliserSaisieGrimpeur({
        ...valide,
        anneeNaissance: String(ANNEE_NAISSANCE_MAX),
      }).anneeNaissance,
    ).toBe(ANNEE_NAISSANCE_MAX)
  })
})
