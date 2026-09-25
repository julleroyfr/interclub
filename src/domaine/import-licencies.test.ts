import { describe, it, expect } from 'vitest'
import {
  AGE_IMPORT_MAX,
  anneeReferenceParDefaut,
  seuilAnneeNaissance,
  convertirSexe,
  anneeDepuisDateFr,
  analyserImport,
  ImportInvalideError,
  type LigneImport,
} from './import-licencies'

// Construit une ligne d'import à partir des 6 colonnes attendues (A→F, R4).
function ligne(
  numero: number,
  nom: string,
  prenom: string,
  dateNaissance: string,
  sexe: string,
  licence: string,
  structure: string,
): LigneImport {
  return { ligne: numero, cellules: [nom, prenom, dateNaissance, sexe, licence, structure] }
}

describe('année de référence & seuil d’âge (R6, R7)', () => {
  it('année de référence par défaut = année de fin de la saison courante = anneeSaison + 1 (R6)', () => {
    // 2026-09-25 → saison 2026 (2026–2027) → référence 2027
    expect(anneeReferenceParDefaut('2026-09-25')).toBe(2027)
    // 2026-03-10 → saison 2025 (2025–2026) → référence 2026
    expect(anneeReferenceParDefaut('2026-03-10')).toBe(2026)
  })

  it('seuil d’année de naissance = année de référence − 18 (R7)', () => {
    expect(AGE_IMPORT_MAX).toBe(18)
    expect(seuilAnneeNaissance(2027)).toBe(2009)
    expect(seuilAnneeNaissance(2028)).toBe(2010)
  })
})

describe('conversion du sexe (R9)', () => {
  it('convertit « Homme » en « H » et « Femme » en « F »', () => {
    expect(convertirSexe('Homme')).toBe('H')
    expect(convertirSexe('Femme')).toBe('F')
  })

  it('ignore la casse et les espaces de bord', () => {
    expect(convertirSexe('  homme ')).toBe('H')
    expect(convertirSexe('FEMME')).toBe('F')
  })

  it('rejette une valeur non reconnue', () => {
    expect(() => convertirSexe('NB')).toThrow(ImportInvalideError)
    expect(() => convertirSexe('')).toThrow(ImportInvalideError)
  })
})

describe('extraction de l’année depuis JJ/MM/AAAA (R9)', () => {
  it('extrait l’année d’une date valide', () => {
    expect(anneeDepuisDateFr('08/03/1978')).toBe(1978)
    expect(anneeDepuisDateFr('29/03/2008')).toBe(2008)
  })

  it('rejette un format non JJ/MM/AAAA', () => {
    expect(() => anneeDepuisDateFr('2008-03-29')).toThrow(ImportInvalideError)
    expect(() => anneeDepuisDateFr('8/3/2008')).toThrow(ImportInvalideError)
    expect(() => anneeDepuisDateFr('')).toThrow(ImportInvalideError)
  })

  it('rejette une date calendaire impossible', () => {
    expect(() => anneeDepuisDateFr('32/13/2012')).toThrow(ImportInvalideError)
    expect(() => anneeDepuisDateFr('29/02/2011')).toThrow(ImportInvalideError) // 2011 non bissextile
  })

  it('rejette une année hors bornes [1900, 2100]', () => {
    expect(() => anneeDepuisDateFr('01/01/1899')).toThrow(ImportInvalideError)
    expect(() => anneeDepuisDateFr('01/01/2101')).toThrow(ImportInvalideError)
  })
})

describe('analyse de l’import (R7, R8, R9, R10, R14)', () => {
  it('retient une ligne valide et éligible, normalisée (R9)', () => {
    const res = analyserImport(
      [ligne(3, '  AARNINK ', 'Naoki', '14/08/2010', 'Homme', '477725', 'S.A.G.C.  ESCALADE')],
      2027,
    )
    expect(res.erreurs).toHaveLength(0)
    expect(res.ignoresHorsAge).toBe(0)
    expect(res.aImporter).toHaveLength(1)
    expect(res.aImporter[0]).toMatchObject({
      nom: 'AARNINK',
      prenom: 'Naoki',
      anneeNaissance: 2010,
      sexe: 'H',
      licence: 477725,
      club: 'S.A.G.C. ESCALADE', // espaces internes réduits (R9/R4)
      ligne: 3,
    })
  })

  it('expose l’année de référence et le seuil calculé (R6, R7)', () => {
    const res = analyserImport([], 2027)
    expect(res.anneeReference).toBe(2027)
    expect(res.seuilAnneeNaissance).toBe(2009)
    expect(res.aImporter).toHaveLength(0)
  })

  it('ignore (sans erreur) un licencié né avant le seuil d’âge (R7, R8)', () => {
    const res = analyserImport(
      [
        ligne(3, 'AARNINK', 'Allaric', '08/03/2008', 'Homme', '536574', 'S.A.G.C. ESCALADE'), // 2008 < 2009
        ligne(4, 'AARNINK', 'Naoki', '14/08/2009', 'Homme', '477725', 'S.A.G.C. ESCALADE'), // 2009 = seuil, inclus
      ],
      2027,
    )
    expect(res.ignoresHorsAge).toBe(1)
    expect(res.erreurs).toHaveLength(0)
    expect(res.aImporter).toHaveLength(1)
    expect(res.aImporter[0].licence).toBe(477725)
  })

  it('rejette une ligne invalide avec son numéro de ligne et une raison (R10)', () => {
    const res = analyserImport(
      [
        ligne(3, 'DUPONT', 'Marie', '10/05/2012', 'NB', '111', 'ALTIZEN'), // sexe invalide
        ligne(4, '', 'Léo', '10/05/2012', 'Femme', '222', 'ALTIZEN'), // nom vide
        ligne(5, 'MARTIN', 'Léo', '10/05/2012', 'Homme', '0', 'ALTIZEN'), // licence ≤ 0
        ligne(6, 'BERNARD', 'Anna', '10/05/2012', 'Femme', '333', ''), // structure vide
      ],
      2027,
    )
    expect(res.aImporter).toHaveLength(0)
    expect(res.erreurs).toHaveLength(4)
    expect(res.erreurs[0]).toMatchObject({ ligne: 3 })
    expect(res.erreurs[0].raison).toMatch(/sexe/i)
    expect(res.erreurs[1].raison).toMatch(/nom/i)
    expect(res.erreurs[2].raison).toMatch(/licence/i)
    expect(res.erreurs[3].raison).toMatch(/structure/i)
  })

  it('rejette une licence non entière (R9, R10)', () => {
    const res = analyserImport(
      [ligne(3, 'MARTIN', 'Léo', '10/05/2012', 'Homme', '12A45', 'ALTIZEN')],
      2027,
    )
    expect(res.aImporter).toHaveLength(0)
    expect(res.erreurs[0].raison).toMatch(/licence/i)
  })

  it('consolide les doublons de licence dans le fichier — la dernière occurrence prévaut (R14)', () => {
    const res = analyserImport(
      [
        ligne(3, 'MARTIN', 'Ancien', '10/05/2012', 'Homme', '999', 'ALTIZEN'),
        ligne(9, 'MARTIN', 'Récent', '10/05/2012', 'Homme', '999', 'GRADI-GRIMPE'),
      ],
      2027,
    )
    expect(res.aImporter).toHaveLength(1)
    expect(res.aImporter[0]).toMatchObject({ prenom: 'Récent', club: 'GRADI-GRIMPE', licence: 999 })
    expect(res.doublons).toHaveLength(1)
    expect(res.doublons[0]).toMatchObject({ ligne: 3, licence: 999 })
  })

  it('traite un mélange réaliste : créés éligibles, ignorés, erreurs (R7, R8, R10)', () => {
    const res = analyserImport(
      [
        ligne(3, 'A', 'Un', '01/01/2010', 'Homme', '1', 'CLUB X'), // éligible
        ligne(4, 'B', 'Deux', '01/01/2000', 'Femme', '2', 'CLUB X'), // hors âge
        ligne(5, 'C', 'Trois', 'xx', 'Homme', '3', 'CLUB X'), // erreur date
        ligne(6, 'D', 'Quatre', '01/01/2015', 'Femme', '4', 'CLUB Y'), // éligible
      ],
      2027,
    )
    expect(res.aImporter).toHaveLength(2)
    expect(res.ignoresHorsAge).toBe(1)
    expect(res.erreurs).toHaveLength(1)
    expect(res.erreurs[0].ligne).toBe(5)
  })
})
