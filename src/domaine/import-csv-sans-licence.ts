// Domaine pur — import CSV sans licence, format Marsas (spec #18). Aucun accès
// Supabase ici : découpage du texte CSV, contrôle des en-têtes, normalisation et
// validation d'une ligne, forme comparable et clé d'identité, filtre d'âge et
// consolidation des doublons internes. Le rapprochement avec la base et
// l'attribution des licences générées se font dans la RPC (R13, R14, R16).

import {
  NOM_GRIMPEUR_MAX,
  ANNEE_NAISSANCE_MIN,
  ANNEE_NAISSANCE_MAX,
  type Sexe,
} from './grimpeur'
import { seuilAnneeNaissance, type ErreurImport } from './import-licencies'

/** En-têtes attendus, dans cet ordre (R6). */
export const COLONNES_CSV = ['QUALITE', 'NOM', 'PRENOM', 'DATNAISS'] as const

/** Caractère de remplacement Unicode, trace d'un accent perdu à l'export (R8b). */
const CARACTERE_ILLISIBLE = '�'

/** Fichier refusé en bloc (en-têtes inattendus, fichier vide) — R6. */
export class FichierCsvInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FichierCsvInvalideError'
  }
}

/** Ligne invalide rencontrée pendant l'analyse (R10). */
export class ImportCsvInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportCsvInvalideError'
  }
}

/** Ligne de données : numéro dans le fichier (en-tête = 1) + cellules. */
export type LigneCsv = {
  ligne: number
  cellules: string[]
}

/** Grimpeur normalisé prêt à rapprocher / créer (R8, R9). */
export type GrimpeurCsv = {
  ligne: number
  sexe: Sexe
  nom: string
  prenom: string
  anneeNaissance: number
  nomComparable: string
  prenomComparable: string
}

/** Occurrence supplantée par une ligne de même clé d'identité (R12). */
export type DoublonCsv = {
  ligne: number
  identite: string
}

/** Résultat de l'analyse pure d'un fichier CSV (R16). */
export type AnalyseImportCsv = {
  anneeReference: number
  seuilAnneeNaissance: number
  aImporter: GrimpeurCsv[]
  ignoresHorsAge: number
  erreurs: ErreurImport[]
  doublons: DoublonCsv[]
}

// Découpe une ligne CSV selon le séparateur, en gérant les champs entre
// guillemets (séparateur inclus, guillemet doublé = guillemet littéral).
function decouperLigne(texte: string, separateur: string): string[] {
  const cellules: string[] = []
  let courant = ''
  let entreGuillemets = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        courant += '"'
        i++
      } else if (c === '"') {
        entreGuillemets = false
      } else {
        courant += c
      }
    } else if (c === '"') {
      entreGuillemets = true
    } else if (c === separateur) {
      cellules.push(courant)
      courant = ''
    } else {
      courant += c
    }
  }
  cellules.push(courant)
  return cellules
}

/**
 * Lit le texte d'un fichier CSV (R5–R7) : BOM ignoré, fins de ligne LF/CRLF,
 * séparateur virgule ou point-virgule déterminé par la ligne d'en-têtes,
 * en-têtes contrôlés (R6), lignes vides ignorées. Retourne les lignes de
 * données numérotées comme dans le fichier (en-tête = ligne 1).
 */
export function lireCsv(texte: string): LigneCsv[] {
  const lignesBrutes = texte.replace(/^﻿/, '').split(/\r?\n/)
  const entete = lignesBrutes[0] ?? ''
  const separateur = entete.includes(';') ? ';' : ','
  const colonnes = decouperLigne(entete, separateur).map((c) => c.trim().toUpperCase())
  const attendues = COLONNES_CSV.every((nom, i) => colonnes[i] === nom)
  if (!attendues) {
    throw new FichierCsvInvalideError(
      `En-têtes inattendus : la première ligne doit être ${COLONNES_CSV.join(', ')}.`,
    )
  }

  const lignes: LigneCsv[] = []
  lignesBrutes.slice(1).forEach((brute, i) => {
    if (!brute.trim()) return
    lignes.push({ ligne: i + 2, cellules: decouperLigne(brute, separateur) })
  })
  return lignes
}

/** Convertit la QUALITE (`M`/`MME`) en sexe `H`/`F` (R8). */
export function convertirQualite(brut: string): Sexe {
  const v = (brut ?? '').trim().toUpperCase()
  if (v === 'M') return 'H'
  if (v === 'MME') return 'F'
  throw new ImportCsvInvalideError(
    `QUALITE non reconnue (« ${(brut ?? '').trim()} ») — attendu M ou MME.`,
  )
}

// Nombre de jours du mois (mois 1–12), en tenant compte des années bissextiles.
function joursDansMois(mois: number, annee: number): number {
  if (mois === 2) {
    const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
    return bissextile ? 29 : 28
  }
  return [4, 6, 9, 11].includes(mois) ? 30 : 31
}

/**
 * Extrait l'année d'une date `AAAA-MM-JJ` (R8). Rejette un autre format, une
 * date calendaire impossible ou une année hors bornes [1900, 2100].
 */
export function anneeDepuisDateIso(brut: string): number {
  const valeur = (brut ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur)
  if (!m) {
    throw new ImportCsvInvalideError(
      `Date de naissance mal formée (« ${valeur} ») — attendu AAAA-MM-JJ.`,
    )
  }
  const annee = Number(m[1])
  const mois = Number(m[2])
  const jour = Number(m[3])
  if (mois < 1 || mois > 12 || jour < 1 || jour > joursDansMois(mois, annee)) {
    throw new ImportCsvInvalideError(`Date de naissance impossible (« ${valeur} »).`)
  }
  if (annee < ANNEE_NAISSANCE_MIN || annee > ANNEE_NAISSANCE_MAX) {
    throw new ImportCsvInvalideError(
      `Année de naissance hors bornes [${ANNEE_NAISSANCE_MIN}, ${ANNEE_NAISSANCE_MAX}].`,
    )
  }
  return annee
}

/**
 * Forme comparable d'un nom ou prénom (R9) : majuscules, sans accents, tirets et
 * apostrophes remplacés par une espace, espaces réduits et retirés en bord.
 * Doit rester équivalente à `interclub.forme_comparable` (SQL).
 */
export function formeComparable(libelle: string): string {
  return (libelle ?? '')
    .toUpperCase()
    .replace(/Æ/g, 'AE')
    .replace(/Œ/g, 'OE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clé d'identité (R9) : sexe, nom et prénom comparables, année de naissance. */
export function cleIdentite(g: {
  sexe: Sexe
  nom: string
  prenom: string
  anneeNaissance: number
}): string {
  return [g.sexe, formeComparable(g.nom), formeComparable(g.prenom), g.anneeNaissance].join('|')
}

// Normalise un nom/prénom (R8) : trim + espaces internes réduits, présence,
// longueur, absence de caractère illisible (R8b).
function normaliserLibelle(valeur: string, champ: string): string {
  const normalise = (valeur ?? '').trim().replace(/\s+/g, ' ')
  if (!normalise) {
    throw new ImportCsvInvalideError(`${champ} manquant.`)
  }
  if (normalise.length > NOM_GRIMPEUR_MAX) {
    throw new ImportCsvInvalideError(`${champ} trop long (max ${NOM_GRIMPEUR_MAX} caractères).`)
  }
  if (normalise.includes(CARACTERE_ILLISIBLE)) {
    throw new ImportCsvInvalideError(
      `${champ} : caractère illisible (accent perdu), corriger le fichier.`,
    )
  }
  return normalise
}

// Parse une ligne en grimpeur normalisé (R8). Lance ImportCsvInvalideError (R10).
function parserLigne(l: LigneCsv): GrimpeurCsv {
  const [qualite = '', nom = '', prenom = '', date = ''] = l.cellules
  const sexe = convertirQualite(qualite)
  const nomNormalise = normaliserLibelle(nom, 'Nom')
  const prenomNormalise = normaliserLibelle(prenom, 'Prénom')
  return {
    ligne: l.ligne,
    sexe,
    nom: nomNormalise,
    prenom: prenomNormalise,
    anneeNaissance: anneeDepuisDateIso(date),
    nomComparable: formeComparable(nomNormalise),
    prenomComparable: formeComparable(prenomNormalise),
  }
}

// Identité au mieux pour un message : « NOM PRENOM » ou « — ».
function identiteAuMieux(l: LigneCsv): string {
  const identite = [l.cellules[1], l.cellules[2]]
    .map((c) => (c ?? '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ')
  return identite || '—'
}

/**
 * Analyse pure d'un fichier CSV (R16) : normalise chaque ligne (R8), écarte les
 * invalides en erreurs (R8b, R10), ignore les hors-âge (R11), puis consolide les
 * lignes de même clé d'identité — dernière occurrence retenue (R12).
 */
export function analyserImportCsv(lignes: LigneCsv[], anneeReference: number): AnalyseImportCsv {
  const seuil = seuilAnneeNaissance(anneeReference)
  const erreurs: ErreurImport[] = []
  const doublons: DoublonCsv[] = []
  const parCle = new Map<string, GrimpeurCsv>()
  let ignoresHorsAge = 0

  for (const l of lignes) {
    let grimpeur: GrimpeurCsv
    try {
      grimpeur = parserLigne(l)
    } catch (e) {
      if (e instanceof ImportCsvInvalideError) {
        erreurs.push({ ligne: l.ligne, identite: identiteAuMieux(l), raison: e.message })
        continue
      }
      throw e
    }

    if (grimpeur.anneeNaissance < seuil) {
      ignoresHorsAge++
      continue
    }

    const cle = cleIdentite(grimpeur)
    const existant = parCle.get(cle)
    if (existant) {
      doublons.push({ ligne: existant.ligne, identite: `${existant.nom} ${existant.prenom}` })
    }
    parCle.set(cle, grimpeur)
  }

  return {
    anneeReference,
    seuilAnneeNaissance: seuil,
    aImporter: [...parCle.values()],
    ignoresHorsAge,
    erreurs,
    doublons,
  }
}
