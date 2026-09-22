import { describe, it, expect } from 'vitest'

import {
  classementIndividuelParSexe,
  classer,
  parNom,
  parNomPuisPrenom,
  scoreBloc,
  scoreEquipe,
  scoreIndividuel,
  scoresParClub,
  scoreVoie,
  type BaremeVoie,
  type EquipeComposition,
  type GrimpeurClassable,
} from './score'

// Spec #7 « Classement » — calcul du score (fonctions pures du domaine).
// R1 : le score de voie découle de l'issue enregistrée (spec #6) et du barème de
// la voie (spec #3 R38). Un champ de points absent (null) → 0.

describe('Score de voie (R1)', () => {
  // Barème type d'une voie tête enfant (T3 « Matin ») : voie entière 7, prise
  // valorisée 4 ; pas de zones (enfant).
  const enfantTete: BaremeVoie = {
    points: 7,
    pointsPriseValorisee: 4,
    pointsZone1: null,
    pointsZone2: null,
  }

  // Barème type d'une voie ado (T3 « Après-midi ») : voie entière 8, zones 5/6 ;
  // pas de prise valorisée (ado).
  const ado: BaremeVoie = {
    points: 8,
    pointsPriseValorisee: null,
    pointsZone1: 5,
    pointsZone2: 6,
  }

  it('top → points de la voie entière (R1)', () => {
    expect(scoreVoie('top', enfantTete)).toBe(7)
    expect(scoreVoie('top', ado)).toBe(8)
  })

  it('prise_valorisee → points de la prise valorisée (R1)', () => {
    expect(scoreVoie('prise_valorisee', enfantTete)).toBe(4)
  })

  it('zone2 → points de zone 2, zone1 → points de zone 1 (R1)', () => {
    expect(scoreVoie('zone2', ado)).toBe(6)
    expect(scoreVoie('zone1', ado)).toBe(5)
  })

  it('echec, np → 0 (R1)', () => {
    expect(scoreVoie('echec', enfantTete)).toBe(0)
    expect(scoreVoie('np', ado)).toBe(0)
  })

  it('champ de points absent (null) → 0 (R1)', () => {
    // Prise valorisée demandée mais non configurée sur cette voie.
    const sansPrise: BaremeVoie = { ...enfantTete, pointsPriseValorisee: null }
    expect(scoreVoie('prise_valorisee', sansPrise)).toBe(0)
    // Zones demandées mais non configurées.
    const sansZones: BaremeVoie = { ...ado, pointsZone1: null, pointsZone2: null }
    expect(scoreVoie('zone1', sansZones)).toBe(0)
    expect(scoreVoie('zone2', sansZones)).toBe(0)
  })
})

// R2 : le score de bloc vaut les points du palier atteint (issue `palier` →
// points du `bloc_palier` référencé, spec #3 R39) ; `echec` et `np` → 0.
describe('Score de bloc (R2)', () => {
  it('palier atteint → points du palier (R2)', () => {
    expect(scoreBloc('palier', 30)).toBe(30)
  })

  it('echec, np → 0 (R2)', () => {
    expect(scoreBloc('echec', null)).toBe(0)
    expect(scoreBloc('np', null)).toBe(0)
  })

  it('palier sans points (null) → 0 (R2)', () => {
    expect(scoreBloc('palier', null)).toBe(0)
  })
})

// R3 : le score individuel est la somme de tous les scores de voie et de bloc.
// R4 : une voie / un bloc sans résultat compte 0 (le total évolue à chaque saisie).
describe('Score individuel (R3/R4)', () => {
  const bareme = (points: number): BaremeVoie => ({
    points,
    pointsPriseValorisee: Math.ceil(points / 2),
    pointsZone1: null,
    pointsZone2: null,
  })

  it('somme les scores de voie et de bloc (R3) — scénario enfant', () => {
    // Spec #7, scénario « score individuel enfant » : M2 Top, M3 Prise valorisée,
    // M4 Échec, B1 1er essai (palier), B2 Échec.
    const voies = [
      { issue: 'top' as const, bareme: bareme(2) }, // M2 top = 2
      { issue: 'prise_valorisee' as const, bareme: bareme(3) }, // M3 prise = ceil(3/2)=2
      { issue: 'echec' as const, bareme: bareme(4) }, // M4 = 0
    ]
    const blocs = [
      { issue: 'palier' as const, pointsPalier: 4 }, // B1 = 4
      { issue: 'echec' as const, pointsPalier: null }, // B2 = 0
    ]
    // 2 + 2 + 0 + 4 + 0 = 8
    expect(scoreIndividuel(voies, blocs)).toBe(8)
  })

  it('aucun résultat → 0 (R4)', () => {
    expect(scoreIndividuel([], [])).toBe(0)
  })

  it('évolue à chaque résultat ajouté (au fil de l’eau, R4)', () => {
    const avant = scoreIndividuel([{ issue: 'top', bareme: bareme(5) }], [])
    const apres = scoreIndividuel(
      [
        { issue: 'top', bareme: bareme(5) },
        { issue: 'top', bareme: bareme(7) },
      ],
      [{ issue: 'palier', pointsPalier: 6 }],
    )
    expect(avant).toBe(5)
    expect(apres).toBe(18)
  })
})

// R5 : le score d'une équipe est la somme des scores individuels de tous ses
// grimpeurs composés (y compris un grimpeur prêté rattaché à cette équipe, R7).
describe('Score d’équipe (R5)', () => {
  it('somme les scores individuels des membres (R5)', () => {
    const scores = new Map<string, number>([
      ['g1', 10],
      ['g2', 7],
      ['g3', 0],
    ])
    expect(scoreEquipe(['g1', 'g2', 'g3'], scores)).toBe(17)
  })

  it('un membre sans score connu compte 0 (R5)', () => {
    const scores = new Map<string, number>([['g1', 12]])
    expect(scoreEquipe(['g1', 'gX'], scores)).toBe(12)
  })

  it('équipe vide → 0 (R5)', () => {
    expect(scoreEquipe([], new Map())).toBe(0)
  })
})

// R6 : le score d'un club est la somme des scores de toutes ses équipes engagées.
// R7 : un grimpeur prêté compte pour l'équipe / le club d'ACCUEIL (où il est
// composé), pas pour son club d'origine (côté équipe/club).
describe('Score de club (R6) et grimpeur prêté (R7)', () => {
  it('somme les scores de toutes les équipes du club (R6)', () => {
    // Spec #7, scénario « équipe et club » : Club A aligne A1 et A2.
    const scores = new Map<string, number>([
      ['a1', 10],
      ['a2', 8],
      ['a3', 5], // A1 = 23
      ['a4', 4],
      ['a5', 6], // A2 = 10
    ])
    const equipes: EquipeComposition[] = [
      { equipeId: 'A1', clubId: 'clubA', membresIds: ['a1', 'a2', 'a3'] },
      { equipeId: 'A2', clubId: 'clubA', membresIds: ['a4', 'a5'] },
    ]
    const parClub = scoresParClub(equipes, scores)
    expect(parClub.get('clubA')).toBe(33)
  })

  it('le grimpeur prêté compte pour le club d’accueil, pas son club d’origine (R7)', () => {
    // gP est prêté par le Club B et composé dans l'équipe A1 (Club A d'accueil).
    // Le Club B aligne sa propre équipe B1 (sans gP).
    const scores = new Map<string, number>([
      ['a1', 10],
      ['gP', 7], // prêté, origine club B, composé dans A1
      ['b1', 4],
    ])
    const equipes: EquipeComposition[] = [
      { equipeId: 'A1', clubId: 'clubA', membresIds: ['a1', 'gP'] },
      { equipeId: 'B1', clubId: 'clubB', membresIds: ['b1'] },
    ]
    const parClub = scoresParClub(equipes, scores)
    // Club A d'accueil récupère les 7 points de gP ; Club B ne les a pas.
    expect(parClub.get('clubA')).toBe(17)
    expect(parClub.get('clubB')).toBe(4)
  })

  it('agrège plusieurs équipes d’un même club dans une seule entrée (R6)', () => {
    const scores = new Map<string, number>([
      ['a1', 3],
      ['a2', 9],
    ])
    const equipes: EquipeComposition[] = [
      { equipeId: 'A1', clubId: 'clubA', membresIds: ['a1'] },
      { equipeId: 'A2', clubId: 'clubA', membresIds: ['a2'] },
    ]
    const parClub = scoresParClub(equipes, scores)
    expect(parClub.get('clubA')).toBe(12)
    expect(parClub.size).toBe(1)
  })
})

// R8 : tri par score décroissant ; ex æquo au même rang, rang suivant décalé du
// nombre d'ex æquo (classement standard 1, 2, 2, 4).
// R9 : à score égal, l'ordre d'affichage est déterministe (ici par nom), mais le
// rang reste identique pour les ex æquo.
describe('Moteur de classement — rangs et ordre (R8/R9)', () => {
  type Item = { nom: string; prenom: string; score: number }
  const item = (nom: string, score: number, prenom = ''): Item => ({
    nom,
    prenom,
    score,
  })

  it('trie par score décroissant et numérote 1, 2, 3 (R8)', () => {
    const classement = classer(
      [item('B', 9), item('A', 14), item('C', 5)],
      (e) => e.score,
      parNom,
    )
    expect(classement.map((r) => [r.element.nom, r.rang])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ])
  })

  it('ex æquo partagent le rang, le suivant est décalé — 1, 1, 3 (R8)', () => {
    // Spec #7, scénario « ex æquo » : 12, 12, 9.
    const classement = classer(
      [item('B', 12), item('A', 12), item('C', 9)],
      (e) => e.score,
      parNom,
    )
    // À 12 ex æquo → rang 1 partagé ; C (9) → rang 3 (le 2 est sauté).
    expect(classement.map((r) => r.rang)).toEqual([1, 1, 3])
  })

  it('à score égal, l’ordre d’affichage suit le comparateur mais le rang est identique (R9)', () => {
    const classement = classer(
      [item('B', 12), item('A', 12)],
      (e) => e.score,
      parNom,
    )
    // Ordre d'affichage déterministe : A avant B ; même rang (1).
    expect(classement.map((r) => r.element.nom)).toEqual(['A', 'B'])
    expect(classement.map((r) => r.rang)).toEqual([1, 1])
  })

  it('départage l’affichage par nom puis prénom (R9, individuel)', () => {
    const classement = classer(
      [item('Martin', 10, 'Zoe'), item('Martin', 10, 'Alex')],
      (e) => e.score,
      parNomPuisPrenom,
    )
    expect(classement.map((r) => r.element.prenom)).toEqual(['Alex', 'Zoe'])
    expect(classement.map((r) => r.rang)).toEqual([1, 1])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const source = [item('B', 9), item('A', 14)]
    classer(source, (e) => e.score, parNom)
    expect(source.map((e) => e.nom)).toEqual(['B', 'A'])
  })
})

// R8b : le classement individuel est établi séparément par sexe (deux classements
// Filles / Garçons, rangs repartant de 1 dans chacun). R7 (individuel) : le
// grimpeur prêté reste rattaché à son club d'origine.
describe('Classement individuel par sexe (R8b/R7)', () => {
  const g = (
    grimpeurId: string,
    nom: string,
    prenom: string,
    sexe: 'F' | 'G',
    score: number,
    clubOrigineId = 'clubA',
  ): GrimpeurClassable => ({ grimpeurId, nom, prenom, sexe, score, clubOrigineId })

  it('produit deux classements distincts, rangs repartant de 1 (R8b)', () => {
    const { filles, garcons } = classementIndividuelParSexe([
      g('f1', 'Alpha', 'Ana', 'F', 20),
      g('f2', 'Beta', 'Bea', 'F', 12),
      g('g1', 'Gamma', 'Gil', 'G', 15),
      g('g2', 'Delta', 'Dan', 'G', 8),
    ])
    expect(filles.map((r) => [r.element.grimpeurId, r.rang])).toEqual([
      ['f1', 1],
      ['f2', 2],
    ])
    expect(garcons.map((r) => [r.element.grimpeurId, r.rang])).toEqual([
      ['g1', 1],
      ['g2', 2],
    ])
  })

  it('ne compare pas un score de fille et un score de garçon (R8b)', () => {
    // La meilleure fille (20) et le meilleur garçon (15) sont chacun rang 1.
    const { filles, garcons } = classementIndividuelParSexe([
      g('f1', 'Alpha', 'Ana', 'F', 20),
      g('g1', 'Gamma', 'Gil', 'G', 15),
    ])
    expect(filles[0].rang).toBe(1)
    expect(garcons[0].rang).toBe(1)
  })

  it('applique les ex æquo et l’ordre nom/prénom par sexe (R8b/R8/R9)', () => {
    const { garcons } = classementIndividuelParSexe([
      g('g1', 'Martin', 'Zoe', 'G', 10),
      g('g2', 'Martin', 'Alex', 'G', 10),
      g('g3', 'Zulu', 'Yann', 'G', 4),
    ])
    // Ex æquo à 10 → rang 1 partagé, affichés Alex avant Zoe (nom égal, prénom) ;
    // g3 → rang 3.
    expect(garcons.map((r) => [r.element.prenom, r.rang])).toEqual([
      ['Alex', 1],
      ['Zoe', 1],
      ['Yann', 3],
    ])
  })

  it('conserve le club d’origine du grimpeur prêté au classement individuel (R7)', () => {
    // gP est prêté (composé au Club A) mais son club d'origine est le Club B.
    const { filles } = classementIndividuelParSexe([
      g('gP', 'Prete', 'Pia', 'F', 9, 'clubB'),
    ])
    expect(filles[0].element.clubOrigineId).toBe('clubB')
  })
})
