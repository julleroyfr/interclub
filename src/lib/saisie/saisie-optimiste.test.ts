import { describe, expect, it } from 'vitest'

import type { GrimpeurSaisie, SaisieRencontre } from '@/lib/coach/resultats'
import type { GrimpeurVitesse } from '@/lib/juge/vitesse'

import { appliquerSaisieOptimiste, appliquerVitesseOptimiste } from './saisie-optimiste'

// Spec #17 R22 / spec #6 R20bis / spec #10 R14bis : une saisie est affichée dès
// sa validation, « en attente », et les compteurs en tiennent compte.

function grimpeur(partiel: Partial<GrimpeurSaisie> = {}): GrimpeurSaisie {
  return {
    grimpeurId: 'g1',
    score: 10,
    pointsVitesse: 0,
    nom: 'Alpha',
    prenom: 'Ana',
    equipeId: 'e1',
    equipeNom: 'A1',
    prete: false,
    clubOrigineNom: null,
    groupeDepart: '5',
    voies: [
      { voieDifficulteId: 'v1', niveau: 'T1', cotation: '5a', typeVoie: 'tete', issue: 'top' },
      { voieDifficulteId: 'v2', niveau: 'T2', cotation: '5b', typeVoie: 'tete', issue: null },
    ],
    voiesTotal: 3,
    blocs: [
      { blocId: 'b1', code: 'B1', issue: null, palierId: null, palierLibelle: null },
      { blocId: 'b2', code: 'B2', issue: 'echec', palierId: null, palierLibelle: null },
    ],
    vitesse: { statut: 'en_attente', temps: null },
    progression: { voiesFaites: 1, voiesTotal: 3, blocsFaites: 1, blocsTotal: 2 },
    ...partiel,
  }
}

function saisie(g: GrimpeurSaisie = grimpeur(), categorie: 'enfant' | 'ado' = 'enfant'): SaisieRencontre {
  return {
    id: 'r1',
    dateRencontre: '2026-10-12',
    categorie,
    phase: 'competition',
    clubPorteurNom: 'Club',
    ouverteSaisie: true,
    voiesEpreuve: [
      { voieDifficulteId: 'v1', niveau: 'T1', cotation: '5a', typeVoie: 'tete', ordre: 1 },
      { voieDifficulteId: 'v2', niveau: 'T2', cotation: '5b', typeVoie: 'tete', ordre: 2 },
      { voieDifficulteId: 'v3', niveau: 'T3', cotation: '5c', typeVoie: 'tete', ordre: 3 },
    ],
    blocsConfig: [
      { blocId: 'b1', code: 'B1', ordre: 1, paliers: [{ id: 'p1', libelle: '1er essai', ordre: 1 }] },
      { blocId: 'b2', code: 'B2', ordre: 2, paliers: [] },
    ],
    grimpeurs: [g, grimpeur({ grimpeurId: 'g2', nom: 'Bravo' })],
  }
}

const premier = (s: SaisieRencontre) => s.grimpeurs[0]!

describe('spec #17 — Affichage immédiat d’une saisie voie/bloc (R22, spec #6 R20bis)', () => {
  it('voie : l’issue s’affiche en attente et la progression la compte', () => {
    const s = appliquerSaisieOptimiste(saisie(), {
      type: 'voie',
      grimpeurId: 'g1',
      voieDifficulteId: 'v2',
      issue: 'echec',
    })
    expect(premier(s).voies[1]).toMatchObject({ issue: 'echec', enAttente: true })
    expect(premier(s).progression.voiesFaites).toBe(2)
  })

  it('voie : une correction remplace l’issue existante (spec #6 R13)', () => {
    const s = appliquerSaisieOptimiste(saisie(), {
      type: 'voie',
      grimpeurId: 'g1',
      voieDifficulteId: 'v1',
      issue: 'zone1',
    })
    expect(premier(s).voies[0]).toMatchObject({ issue: 'zone1', enAttente: true })
    expect(premier(s).progression.voiesFaites).toBe(1)
  })

  it('ado : une voie ajoutée apparaît, triée par niveau (spec #6 R11)', () => {
    const ado = grimpeur({
      voies: [{ voieDifficulteId: 'v3', niveau: 'T3', cotation: '5c', typeVoie: 'tete', issue: 'top' }],
      voiesTotal: 6,
      progression: { voiesFaites: 1, voiesTotal: 6, blocsFaites: 0, blocsTotal: 2 },
    })
    const s = appliquerSaisieOptimiste(saisie(ado, 'ado'), {
      type: 'voie',
      grimpeurId: 'g1',
      voieDifficulteId: 'v1',
      issue: 'top',
    })
    expect(premier(s).voies.map((v) => v.niveau)).toEqual(['T1', 'T3'])
    expect(premier(s).voies[0]).toMatchObject({ enAttente: true, cotation: '5a' })
    expect(premier(s).progression.voiesFaites).toBe(2)
  })

  it('retrait d’une voie ado : elle disparaît et la progression baisse', () => {
    const s = appliquerSaisieOptimiste(saisie(), {
      type: 'retrait_voie',
      grimpeurId: 'g1',
      voieDifficulteId: 'v1',
    })
    expect(premier(s).voies.map((v) => v.voieDifficulteId)).toEqual(['v2'])
    expect(premier(s).progression.voiesFaites).toBe(0)
  })

  it('bloc : le palier s’affiche avec son libellé, en attente', () => {
    const s = appliquerSaisieOptimiste(saisie(), {
      type: 'bloc',
      grimpeurId: 'g1',
      blocId: 'b1',
      issue: 'palier',
      palierId: 'p1',
    })
    expect(premier(s).blocs[0]).toMatchObject({
      issue: 'palier',
      palierId: 'p1',
      palierLibelle: '1er essai',
      enAttente: true,
    })
    expect(premier(s).progression.blocsFaites).toBe(2)
  })

  it('ne touche ni les autres grimpeurs ni le score (calculé par le serveur)', () => {
    const base = saisie()
    const s = appliquerSaisieOptimiste(base, {
      type: 'voie',
      grimpeurId: 'g1',
      voieDifficulteId: 'v2',
      issue: 'top',
    })
    expect(s.grimpeurs[1]).toBe(base.grimpeurs[1])
    expect(premier(s).score).toBe(10)
    expect(premier(base).voies[1]!.issue).toBeNull() // données serveur intactes
  })
})

describe('spec #17 — Affichage immédiat d’un résultat de vitesse (R22, spec #10 R14bis)', () => {
  const liste: GrimpeurVitesse[] = [
    { grimpeurId: 'g1', nom: 'A', prenom: 'a', sexe: 'F', clubNom: 'C', issue: null, temps: null },
    { grimpeurId: 'g2', nom: 'B', prenom: 'b', sexe: 'H', clubNom: 'C', issue: 'chute', temps: null },
  ]

  it('un temps s’affiche en attente', () => {
    const l = appliquerVitesseOptimiste(liste, { grimpeurId: 'g1', issue: 'temps', temps: 8.123 })
    expect(l[0]).toMatchObject({ issue: 'temps', temps: 8.123, enAttente: true })
    expect(l[1]).toBe(liste[1])
  })

  it('une chute remplace un temps et n’en porte aucun (spec #10 R9/R11)', () => {
    const l = appliquerVitesseOptimiste(
      [{ ...liste[0]!, issue: 'temps', temps: 9 }],
      { grimpeurId: 'g1', issue: 'chute', temps: null },
    )
    expect(l[0]).toMatchObject({ issue: 'chute', temps: null, enAttente: true })
  })
})
