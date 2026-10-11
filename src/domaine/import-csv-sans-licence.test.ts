import { describe, it, expect } from 'vitest'
import {
  COLONNES_CSV,
  FichierCsvInvalideError,
  ImportCsvInvalideError,
  lireCsv,
  convertirQualite,
  anneeDepuisDateIso,
  formeComparable,
  cleIdentite,
  analyserImportCsv,
  type LigneCsv,
} from './import-csv-sans-licence'

const ENTETE = 'QUALITE,NOM,PRENOM,DATNAISS'

// Ligne CSV déjà découpée (numéro de ligne dans le fichier, en-tête = 1).
function ligne(numero: number, qualite: string, nom: string, prenom: string, date: string): LigneCsv {
  return { ligne: numero, cellules: [qualite, nom, prenom, date] }
}

describe('spec #18 — lecture du fichier CSV (R5, R6, R7)', () => {
  it('en-têtes attendus QUALITE, NOM, PRENOM, DATNAISS (R6)', () => {
    expect(COLONNES_CSV).toEqual(['QUALITE', 'NOM', 'PRENOM', 'DATNAISS'])
  })

  it('lit un fichier séparé par des virgules, numérote les lignes (en-tête = 1) (R5, R10)', () => {
    const lignes = lireCsv(`${ENTETE}\nM,AITA,HUGO,2012-08-12\nMME,BARRA,ROSE,2019-06-28\n`)
    expect(lignes).toEqual([
      { ligne: 2, cellules: ['M', 'AITA', 'HUGO', '2012-08-12'] },
      { ligne: 3, cellules: ['MME', 'BARRA', 'ROSE', '2019-06-28'] },
    ])
  })

  it('accepte le point-virgule, déterminé par la ligne d’en-têtes (R5)', () => {
    const lignes = lireCsv('QUALITE;NOM;PRENOM;DATNAISS\nM;DE BRINGAS, COHEN;OSCAR;2017-09-19')
    expect(lignes[0].cellules).toEqual(['M', 'DE BRINGAS, COHEN', 'OSCAR', '2017-09-19'])
  })

  it('ignore le BOM et accepte les fins de ligne CRLF (R5)', () => {
    const lignes = lireCsv(`﻿${ENTETE}\r\nM,AITA,HUGO,2012-08-12\r\n`)
    expect(lignes).toEqual([{ ligne: 2, cellules: ['M', 'AITA', 'HUGO', '2012-08-12'] }])
  })

  it('ignore les lignes entièrement vides sans décaler la numérotation (R5)', () => {
    const lignes = lireCsv(`${ENTETE}\n\nM,AITA,HUGO,2012-08-12\n  \n`)
    expect(lignes).toEqual([{ ligne: 3, cellules: ['M', 'AITA', 'HUGO', '2012-08-12'] }])
  })

  it('gère les champs entre guillemets (séparateur et guillemet échappé) (R5)', () => {
    const lignes = lireCsv(`${ENTETE}\nM,"L'HOSTIS, dit ""Gab""",GABIN,2021-09-01`)
    expect(lignes[0].cellules).toEqual(['M', 'L\'HOSTIS, dit "Gab"', 'GABIN', '2021-09-01'])
  })

  it('en-têtes insensibles à la casse et aux espaces de bord ; colonnes en plus ignorées (R6)', () => {
    const lignes = lireCsv(' qualite , Nom,prenom ,DatNaiss,COMMENTAIRE\nM,AITA,HUGO,2012-08-12,x')
    expect(lignes[0].cellules.slice(0, 4)).toEqual(['M', 'AITA', 'HUGO', '2012-08-12'])
  })

  it('refuse des en-têtes inattendus (R6)', () => {
    expect(() => lireCsv('NOM,PRENOM,QUALITE,DATNAISS\nAITA,HUGO,M,2012-08-12')).toThrow(
      FichierCsvInvalideError,
    )
    expect(() => lireCsv('Nom;Prénom;Date de naissance\nAITA;HUGO;12/08/2012')).toThrow(
      /en-têtes inattendus/i,
    )
  })

  it('refuse un fichier vide (pas même d’en-têtes) (R6)', () => {
    expect(() => lireCsv('')).toThrow(FichierCsvInvalideError)
  })

  it('un fichier sans ligne de données donne 0 ligne (R7)', () => {
    expect(lireCsv(`${ENTETE}\n`)).toEqual([])
  })
})

describe('spec #18 — normalisation d’une ligne (R8, R8b)', () => {
  it('QUALITE : M → H, MME → F, insensible à la casse et aux espaces (R8)', () => {
    expect(convertirQualite('M')).toBe('H')
    expect(convertirQualite('MME')).toBe('F')
    expect(convertirQualite(' mme ')).toBe('F')
    expect(convertirQualite('m')).toBe('H')
  })

  it('QUALITE : toute autre valeur est invalide (R8)', () => {
    expect(() => convertirQualite('MLLE')).toThrow(ImportCsvInvalideError)
    expect(() => convertirQualite('')).toThrow(ImportCsvInvalideError)
  })

  it('DATNAISS : AAAA-MM-JJ → année (R8)', () => {
    expect(anneeDepuisDateIso('2012-08-12')).toBe(2012)
    expect(anneeDepuisDateIso(' 2024-02-29 ')).toBe(2024)
  })

  it('DATNAISS : format autre, date impossible ou année hors bornes → invalide (R8)', () => {
    expect(() => anneeDepuisDateIso('12/08/2012')).toThrow(ImportCsvInvalideError)
    expect(() => anneeDepuisDateIso('2012-02-30')).toThrow(ImportCsvInvalideError)
    expect(() => anneeDepuisDateIso('2023-02-29')).toThrow(ImportCsvInvalideError)
    expect(() => anneeDepuisDateIso('2012-13-01')).toThrow(ImportCsvInvalideError)
    expect(() => anneeDepuisDateIso('1899-12-31')).toThrow(ImportCsvInvalideError)
    expect(() => anneeDepuisDateIso('')).toThrow(ImportCsvInvalideError)
  })
})

describe('spec #18 — forme comparable & clé d’identité (R9)', () => {
  it('majuscules, sans accents, tirets/apostrophes → espace, espaces réduits (R9)', () => {
    expect(formeComparable('Léa')).toBe('LEA')
    expect(formeComparable('Robin-Brosse')).toBe('ROBIN BROSSE')
    expect(formeComparable('L’Hostis')).toBe('L HOSTIS')
    expect(formeComparable("L'HOSTIS")).toBe('L HOSTIS')
    expect(formeComparable('  Escalona   Chazeau ')).toBe('ESCALONA CHAZEAU')
    expect(formeComparable('François Ægir Œdipe')).toBe('FRANCOIS AEGIR OEDIPE')
  })

  it('deux libellés équivalents ont la même clé ; sexe ou année différents → clé différente (R9, R13)', () => {
    const base = { sexe: 'F' as const, nom: 'ROBIN-BROSSE', prenom: 'Céleste', anneeNaissance: 2021 }
    expect(cleIdentite(base)).toBe(
      cleIdentite({ ...base, nom: 'robin brosse', prenom: 'CELESTE' }),
    )
    expect(cleIdentite(base)).not.toBe(cleIdentite({ ...base, sexe: 'H' }))
    expect(cleIdentite(base)).not.toBe(cleIdentite({ ...base, anneeNaissance: 2020 }))
  })
})

describe('spec #18 — analyse d’un import (R8–R12)', () => {
  it('normalise et retient une ligne valide, valeurs stockées = libellés normalisés (R8)', () => {
    const a = analyserImportCsv([ligne(2, 'MME', 'ESCALONA  CHAZEAU ', ' OCEANE ', '2009-10-07')], 2027)
    expect(a.aImporter).toEqual([
      {
        ligne: 2,
        sexe: 'F',
        nom: 'ESCALONA CHAZEAU',
        prenom: 'OCEANE',
        anneeNaissance: 2009,
        nomComparable: 'ESCALONA CHAZEAU',
        prenomComparable: 'OCEANE',
      },
    ])
    expect(a.erreurs).toEqual([])
  })

  it('rejette une ligne invalide avec n° et raison, sans bloquer les autres (R10)', () => {
    const a = analyserImportCsv(
      [
        ligne(2, 'MLLE', 'AITA', 'HUGO', '2012-08-12'),
        ligne(3, 'M', '', 'TIMEO', '2015-01-14'),
        ligne(4, 'M', 'ARCHAT', 'TIMEO', '14/01/2015'),
        ligne(5, 'M', 'ARNAUD', 'ROMEO', '2012-07-12'),
      ],
      2027,
    )
    expect(a.aImporter.map((g) => g.ligne)).toEqual([5])
    expect(a.erreurs.map((e) => e.ligne)).toEqual([2, 3, 4])
    expect(a.erreurs[0]).toMatchObject({ identite: 'AITA HUGO' })
    expect(a.erreurs[0].raison).toMatch(/QUALITE/)
    expect(a.erreurs[1].raison).toMatch(/Nom/)
  })

  it('rejette un nom ou prénom de plus de 100 caractères (R8)', () => {
    const a = analyserImportCsv([ligne(2, 'M', 'A'.repeat(101), 'HUGO', '2012-08-12')], 2027)
    expect(a.erreurs).toHaveLength(1)
    expect(a.erreurs[0].raison).toMatch(/trop long/)
  })

  it('rejette un nom ou prénom contenant le caractère de remplacement U+FFFD (R8b)', () => {
    const a = analyserImportCsv(
      [
        ligne(8, 'MME', 'BARRA', 'CL�OPH�E', '2017-01-24'),
        ligne(9, 'MME', 'GERV�SONI', 'NOEMIE', '2010-04-20'),
      ],
      2027,
    )
    expect(a.aImporter).toEqual([])
    expect(a.erreurs.map((e) => e.ligne)).toEqual([8, 9])
    expect(a.erreurs[0].raison).toMatch(/caractère illisible/i)
    expect(a.erreurs[0].raison).toMatch(/Prénom/)
    expect(a.erreurs[1].raison).toMatch(/Nom/)
  })

  it('ignore (sans erreur) les grimpeurs nés avant le seuil ; aucun âge minimal (R11)', () => {
    const a = analyserImportCsv(
      [
        ligne(2, 'M', 'VIEUX', 'PAUL', '2008-12-31'),
        ligne(3, 'M', 'HEURTEBIS', 'ARTHUR', '2009-01-01'),
        ligne(4, 'M', 'MAGNE', 'LOIC', '2024-09-14'),
      ],
      2027,
    )
    expect(a.seuilAnneeNaissance).toBe(2009)
    expect(a.ignoresHorsAge).toBe(1)
    expect(a.aImporter.map((g) => g.ligne)).toEqual([3, 4])
    expect(a.erreurs).toEqual([])
  })

  it('consolide les doublons de clé : dernière occurrence retenue, doublon signalé (R12)', () => {
    const a = analyserImportCsv(
      [
        ligne(4, 'M', 'ARNAUD', 'ROMEO', '2012-07-12'),
        ligne(5, 'M', 'Arnaud', 'Roméo', '2012-03-01'),
        ligne(6, 'M', 'AZOUZI', 'FATHI', '2013-03-13'),
      ],
      2027,
    )
    expect(a.aImporter.map((g) => g.ligne)).toEqual([5, 6])
    expect(a.aImporter[0].prenom).toBe('Roméo')
    expect(a.doublons).toEqual([{ ligne: 4, identite: 'ARNAUD ROMEO' }])
  })

  it('homonymes de sexe ou d’année différents ne sont pas des doublons (R12)', () => {
    const a = analyserImportCsv(
      [
        ligne(2, 'M', 'MARTIN', 'CAMILLE', '2014-10-16'),
        ligne(3, 'MME', 'MARTIN', 'CAMILLE', '2014-10-16'),
        ligne(4, 'M', 'MARTIN', 'CAMILLE', '2015-10-16'),
      ],
      2027,
    )
    expect(a.aImporter).toHaveLength(3)
    expect(a.doublons).toEqual([])
  })
})
