import { describe, it, expect } from 'vitest'

import {
  ANNEE_NAISSANCE_MAX,
  ANNEE_NAISSANCE_MIN,
  GrimpeurInvalideError,
  NOM_GRIMPEUR_MAX,
  normaliserSaisieGrimpeur,
} from './grimpeur'

// Spec #1 « Rôles & autorisations » — roster de grimpeurs d'un club (R18 : le
// coach gère les grimpeurs de son club ; R11/R13 : l'admin paramètre). Domaine
// pur : valide/normalise nom, prénom et année de naissance avant écriture
// Supabase (`grimpeur` : nom/prenom `text not null`, `annee_naissance int`
// `between 1900 and 2100`). Aucune dépendance Supabase ici.

describe('Saisie d’un grimpeur (R18)', () => {
  const valide = { nom: 'Dupont', prenom: 'Léa', anneeNaissance: '2014' }

  it('normalise une saisie valide', () => {
    expect(normaliserSaisieGrimpeur(valide)).toEqual({
      nom: 'Dupont',
      prenom: 'Léa',
      anneeNaissance: 2014,
    })
  })

  it('retire les espaces de bord et réduit les espaces internes', () => {
    const g = normaliserSaisieGrimpeur({
      nom: '  Van   der Berg  ',
      prenom: '  Marie  Claire ',
      anneeNaissance: ' 2013 ',
    })
    expect(g.nom).toBe('Van der Berg')
    expect(g.prenom).toBe('Marie Claire')
    expect(g.anneeNaissance).toBe(2013)
  })

  it('rejette un nom vide', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, nom: '  ' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette un prénom vide', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, prenom: '' })).toThrow(
      GrimpeurInvalideError,
    )
  })

  it('rejette un nom trop long', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, nom: 'x'.repeat(NOM_GRIMPEUR_MAX + 1) }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('rejette une année non numérique', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, anneeNaissance: 'abcd' }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('rejette une année décimale', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, anneeNaissance: '2014.5' }),
    ).toThrow(GrimpeurInvalideError)
  })

  it('rejette une année hors bornes', () => {
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

  it('accepte les années aux bornes', () => {
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
