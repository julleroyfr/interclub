import { describe, it, expect } from 'vitest'

import { filtreCategorieGrimpeurs, retenuParFiltre } from './filtre-grimpeurs'
import { CATEGORIES, estEligibleCategorie, type BornesAge } from './rencontre'

// Spec #3 R26b — filtre par catégorie de la liste admin des grimpeurs. Domaine
// pur : traduit la catégorie choisie en bornes d'année de naissance (+ saison des
// surclassés) transmises à la RPC `rechercher_grimpeurs`.

const BORNES: BornesAge = { ageBascule: 12, ageAdoMax: 18 }
const SAISON = 2026

describe('spec #3 — Filtre catégorie de la liste des grimpeurs (R26b)', () => {
  it('enfant : nés en saison − B ou après, pivot compris (R26b-1)', () => {
    expect(filtreCategorieGrimpeurs('enfant', SAISON, BORNES)).toEqual({
      categorie: 'enfant',
      anneeMin: 2014,
      anneeMax: null,
      saisonSurclasses: null,
    })
  })

  it('ado : nés de saison − M à saison − B, plus les surclassés de la saison (R26b-1, R26b-2)', () => {
    expect(filtreCategorieGrimpeurs('ado', SAISON, BORNES)).toEqual({
      categorie: 'ado',
      anneeMin: 2008,
      anneeMax: 2014,
      saisonSurclasses: 2026,
    })
  })

  it('adulte : nés en saison − 16 ou avant, sans borne basse (R26b-1)', () => {
    expect(filtreCategorieGrimpeurs('adulte', SAISON, BORNES)).toEqual({
      categorie: 'adulte',
      anneeMin: null,
      anneeMax: 2010,
      saisonSurclasses: null,
    })
  })

  it('les catégories se recouvrent : le pivot est enfant et ado, un 17 ans est ado et adulte (R26b-1)', () => {
    const enfant = filtreCategorieGrimpeurs('enfant', SAISON, BORNES)!
    const ado = filtreCategorieGrimpeurs('ado', SAISON, BORNES)!
    const adulte = filtreCategorieGrimpeurs('adulte', SAISON, BORNES)!
    expect(retenuParFiltre(2014, false, enfant)).toBe(true)
    expect(retenuParFiltre(2014, false, ado)).toBe(true)
    expect(retenuParFiltre(2009, false, ado)).toBe(true)
    expect(retenuParFiltre(2009, false, adulte)).toBe(true)
  })

  it("le filtre retient exactement les éligibles de la spec #1 R34 / spec #20 R2, hors surclassement (R26b-1)", () => {
    for (const { value } of CATEGORIES) {
      const filtre = filtreCategorieGrimpeurs(value, SAISON, BORNES)!
      for (let annee = 1950; annee <= 2025; annee++) {
        expect(retenuParFiltre(annee, false, filtre), `${value} ${annee}`).toBe(
          estEligibleCategorie(annee, value, SAISON, BORNES),
        )
      }
    }
  })

  it('un enfant surclassé pour la saison est retenu en ado, pas en adulte (R26b-2)', () => {
    const ado = filtreCategorieGrimpeurs('ado', SAISON, BORNES)!
    const adulte = filtreCategorieGrimpeurs('adulte', SAISON, BORNES)!
    expect(retenuParFiltre(2016, false, ado)).toBe(false)
    expect(retenuParFiltre(2016, true, ado)).toBe(true)
    expect(retenuParFiltre(2016, true, adulte)).toBe(false)
  })

  it('aucune catégorie ou catégorie inconnue → pas de filtre (R26b-4)', () => {
    expect(filtreCategorieGrimpeurs(undefined, SAISON, BORNES)).toBeNull()
    expect(filtreCategorieGrimpeurs('', SAISON, BORNES)).toBeNull()
    expect(filtreCategorieGrimpeurs('senior', SAISON, BORNES)).toBeNull()
  })

  it('âges des catégories non configurés → pas de filtre, même en adulte (R26b-4)', () => {
    expect(filtreCategorieGrimpeurs('enfant', SAISON, null)).toBeNull()
    expect(filtreCategorieGrimpeurs('adulte', SAISON, null)).toBeNull()
  })
})
