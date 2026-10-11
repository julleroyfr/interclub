import { describe, expect, it } from 'vitest'

import { classementMixte } from './affichageEcran'

// Spec #14 « Affichage écran secondaire » — fusion du classement mixte affiché
// (fonction pure du domaine, aucun recalcul de score ni de rang). Les lignes en
// entrée ont la forme des lignes déjà assemblées par le loader (spec #7,
// `LigneIndividuel`) : `rang`, `nom`, `prenom`, `score`, sans champ `sexe`
// puisqu'elles viennent déjà de listes séparées par sexe.

type LigneTest = { rang: number; nom: string; prenom: string; score: number }

const ligne = (rang: number, nom: string, prenom: string, score: number): LigneTest => ({
  rang,
  nom,
  prenom,
  score,
})

describe('spec #14 — Fusion du classement mixte affiché (R4)', () => {
  it('mélange les deux classements Filles et Garçons en une seule liste (R4)', () => {
    const filles = [ligne(1, 'Martin', 'Léa', 28)]
    const garcons = [ligne(1, 'Garnier', 'Noé', 24)]

    const mixte = classementMixte(filles, garcons)

    expect(mixte).toHaveLength(2)
    expect(mixte.map((l) => l.nom)).toEqual(expect.arrayContaining(['Martin', 'Garnier']))
  })

  it('ne recalcule aucun rang : chaque ligne garde le rang de son classement de sexe (R4/R5)', () => {
    // Deux filles (rangs 1, 2) et deux garçons (rangs 1, 2) : les rangs viennent
    // de deux classements distincts, jamais recalculés globalement.
    const filles = [ligne(1, 'Martin', 'Léa', 28), ligne(2, 'Perez', 'Chloé', 20)]
    const garcons = [ligne(1, 'Garnier', 'Noé', 24), ligne(2, 'Blanc', 'Hugo', 19)]

    const mixte = classementMixte(filles, garcons)

    const rangDe = (nom: string) => mixte.find((l) => l.nom === nom)?.rang
    expect(rangDe('Martin')).toBe(1)
    expect(rangDe('Garnier')).toBe(1)
    expect(rangDe('Perez')).toBe(2)
    expect(rangDe('Blanc')).toBe(2)
  })
})

describe('spec #14 — Ordre de la liste mixte (R5)', () => {
  it('trie par rang croissant (R5)', () => {
    const filles = [ligne(1, 'Perez', 'Chloé', 20)]
    const garcons = [ligne(1, 'Garnier', 'Noé', 24), ligne(2, 'Blanc', 'Hugo', 19)]

    const mixte = classementMixte(filles, garcons)

    expect(mixte.map((l) => l.rang)).toEqual([1, 1, 2])
  })

  it('à rang égal entre les deux classements, départage par nom (ordre alphabétique) (R5)', () => {
    // Rang 1 des deux côtés : "Blanc" doit précéder "Martin" alphabétiquement.
    const filles = [ligne(1, 'Martin', 'Léa', 28)]
    const garcons = [ligne(1, 'Blanc', 'Hugo', 24)]

    const mixte = classementMixte(filles, garcons)

    expect(mixte.map((l) => l.nom)).toEqual(['Blanc', 'Martin'])
  })

  it('à rang et nom égaux, départage par prénom (ordre alphabétique) (R5)', () => {
    const filles = [ligne(1, 'Dupont', 'Zoé', 28)]
    const garcons = [ligne(1, 'Dupont', 'Adam', 24)]

    const mixte = classementMixte(filles, garcons)

    expect(mixte.map((l) => l.prenom)).toEqual(['Adam', 'Zoé'])
  })

  it("ne mute pas les tableaux d'entrée (fonction pure)", () => {
    const filles = [ligne(1, 'Martin', 'Léa', 28)]
    const garcons = [ligne(1, 'Garnier', 'Noé', 24)]
    const fillesAvant = [...filles]
    const garconsAvant = [...garcons]

    classementMixte(filles, garcons)

    expect(filles).toEqual(fillesAvant)
    expect(garcons).toEqual(garconsAvant)
  })
})

describe('spec #14 — Étiquette de sexe (R6)', () => {
  it("chaque ligne fusionnée est taguée du sexe de son classement d'origine", () => {
    const filles = [ligne(1, 'Martin', 'Léa', 28)]
    const garcons = [ligne(1, 'Garnier', 'Noé', 24)]

    const mixte = classementMixte(filles, garcons)

    expect(mixte.find((l) => l.nom === 'Martin')?.sexe).toBe('F')
    expect(mixte.find((l) => l.nom === 'Garnier')?.sexe).toBe('H')
  })
})

describe('spec #14 — Cas limites (R4)', () => {
  it("une liste vide d'un côté → la liste mixte ne contient que l'autre sexe", () => {
    const filles = [ligne(1, 'Martin', 'Léa', 28)]

    const mixte = classementMixte(filles, [])

    expect(mixte).toHaveLength(1)
    expect(mixte[0].nom).toBe('Martin')
  })

  it('deux listes vides → liste mixte vide', () => {
    expect(classementMixte([], [])).toEqual([])
  })
})
