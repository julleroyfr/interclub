import { describe, it, expect } from 'vitest'

import {
  ANNEE_NAISSANCE_MAX,
  ANNEE_NAISSANCE_MIN,
  GrimpeurInvalideError,
  LICENCE_GENEREE_MIN,
  LICENCE_MAX,
  NOM_GRIMPEUR_MAX,
  estLicenceGeneree,
  normaliserSaisieGrimpeur,
} from './grimpeur'

// Spec #1 R18 / spec #3 R21–R21b — roster de grimpeurs d'un club. Domaine pur :
// valide/normalise nom, prenom, annee_naissance, sexe et licence avant ecriture
// Supabase. Aucune dependance Supabase ici.

describe("spec #1 — Saisie d'un grimpeur (R18)", () => {
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
    const sanslicence: Partial<typeof valide> = { ...valide }
    delete sanslicence.licence
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

describe('spec #3 — licence générée, plage réservée (R21c ; spec #18 R14–R15)', () => {
  const valide = {
    nom: 'Aita',
    prenom: 'Hugo',
    anneeNaissance: '2012',
    sexe: 'H',
    licence: '123456',
  }

  it('la plage réservée est [2 000 000 000, 2 147 483 647] (spec #18 R14)', () => {
    expect(LICENCE_GENEREE_MIN).toBe(2_000_000_000)
    expect(LICENCE_MAX).toBe(2_147_483_647)
  })

  it('une licence est générée si et seulement si elle est dans la plage (spec #18 R15)', () => {
    expect(estLicenceGeneree(1_999_999_999)).toBe(false)
    expect(estLicenceGeneree(123456)).toBe(false)
    expect(estLicenceGeneree(2_000_000_000)).toBe(true)
    expect(estLicenceGeneree(2_147_483_647)).toBe(true)
  })

  it('la saisie refuse une licence de la plage réservée (R21c)', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '2000000000' })).toThrow(
      /réservé/,
    )
  })

  it('la saisie accepte de conserver la licence générée déjà portée (R21c)', () => {
    expect(
      normaliserSaisieGrimpeur({ ...valide, licence: '2000000005' }, 2_000_000_005).licence,
    ).toBe(2_000_000_005)
  })

  it('la saisie refuse une AUTRE licence de la plage, même pour un grimpeur à licence générée (R21c)', () => {
    expect(() =>
      normaliserSaisieGrimpeur({ ...valide, licence: '2000000006' }, 2_000_000_005),
    ).toThrow(GrimpeurInvalideError)
  })

  it('remplacer une licence générée par un vrai numéro est autorisé (R21c)', () => {
    expect(
      normaliserSaisieGrimpeur({ ...valide, licence: '654321' }, 2_000_000_005).licence,
    ).toBe(654321)
  })

  it('refuse une licence au-delà de l’entier SQL maximal (R21b)', () => {
    expect(() => normaliserSaisieGrimpeur({ ...valide, licence: '2147483648' })).toThrow(
      GrimpeurInvalideError,
    )
  })
})
