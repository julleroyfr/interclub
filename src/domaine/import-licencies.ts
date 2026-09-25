// Domaine pur — import des licenciés (spec #13). Aucun accès Supabase ni lecture
// du binaire xlsx ici : uniquement le parsing/normalisation d'une ligne déjà
// extraite en cellules texte, le filtre d'âge (R7) et la construction du plan
// d'import (lignes à écrire, ignorés hors âge, erreurs, doublons internes). La
// lecture du .xlsx et l'écriture (clubs + upsert grimpeurs) sont des adaptateurs
// hors de ce module (R15).

import { anneeSaison } from './rencontre'
import {
  NOM_GRIMPEUR_MAX,
  ANNEE_NAISSANCE_MIN,
  ANNEE_NAISSANCE_MAX,
  type Sexe,
} from './grimpeur'

/** Âge maximal (inclus) à l'année de référence pour être importé (R7). */
export const AGE_IMPORT_MAX = 18

/**
 * En-têtes attendus, dans l'ordre des colonnes A→F (R4). Les colonnes sont
 * repérées par leur position ; ce libellé sert de documentation / contrôle.
 */
export const COLONNES_IMPORT = [
  'Nom',
  'Prénom',
  'Date de naissance',
  'Sexe',
  'N° de licence',
  'Nom de la structure',
] as const

/** Ligne invalide rencontrée pendant l'analyse d'un import. */
export class ImportInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportInvalideError'
  }
}

/** Ligne brute d'import : numéro de ligne (traçabilité) + cellules A→F. */
export type LigneImport = {
  ligne: number
  cellules: string[]
}

/** Grimpeur normalisé issu du fichier, prêt à écrire (R9). `club` = structure. */
export type GrimpeurImport = {
  nom: string
  prenom: string
  anneeNaissance: number
  sexe: Sexe
  licence: number
  club: string
  ligne: number
}

/** Ligne rejetée : numéro, identité au mieux, raison lisible (R10). */
export type ErreurImport = {
  ligne: number
  identite: string
  raison: string
}

/** Doublon interne de licence signalé (occurrence supplantée, R14). */
export type DoublonImport = {
  ligne: number
  licence: number
}

/** Résultat de l'analyse pure d'un fichier d'import (R15). */
export type AnalyseImport = {
  anneeReference: number
  seuilAnneeNaissance: number
  aImporter: GrimpeurImport[]
  ignoresHorsAge: number
  erreurs: ErreurImport[]
  doublons: DoublonImport[]
}

/**
 * Année de référence par défaut du filtre d'âge : année de **fin** de la saison
 * courante, soit `anneeSaison(date) + 1` (R6). La saison (R37) est identifiée par
 * son année de début ; l'import raisonne sur l'année suivante.
 */
export function anneeReferenceParDefaut(dateISO: string): number {
  return anneeSaison(dateISO) + 1
}

/** Année de naissance minimale pour être importé : référence − 18 (R7). */
export function seuilAnneeNaissance(anneeReference: number): number {
  return anneeReference - AGE_IMPORT_MAX
}

/** Convertit le libellé de sexe FFME (« Homme »/« Femme ») en `H`/`F` (R9). */
export function convertirSexe(brut: string): Sexe {
  const v = (brut ?? '').trim().toLowerCase()
  if (v === 'homme') return 'H'
  if (v === 'femme') return 'F'
  throw new ImportInvalideError(`Sexe non reconnu (« ${(brut ?? '').trim()} »).`)
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
 * Extrait l'année d'une date au format `JJ/MM/AAAA` (R9). Rejette un format
 * incorrect, une date calendaire impossible (ex. 32/13, 29/02 non bissextile) ou
 * une année hors bornes [1900, 2100].
 */
export function anneeDepuisDateFr(brut: string): number {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((brut ?? '').trim())
  if (!m) {
    throw new ImportInvalideError(
      `Date de naissance mal formée (« ${(brut ?? '').trim()} ») — attendu JJ/MM/AAAA.`,
    )
  }
  const jour = Number(m[1])
  const mois = Number(m[2])
  const annee = Number(m[3])
  if (mois < 1 || mois > 12 || jour < 1 || jour > joursDansMois(mois, annee)) {
    throw new ImportInvalideError(`Date de naissance impossible (« ${brut.trim()} »).`)
  }
  if (annee < ANNEE_NAISSANCE_MIN || annee > ANNEE_NAISSANCE_MAX) {
    throw new ImportInvalideError(
      `Année de naissance hors bornes [${ANNEE_NAISSANCE_MIN}, ${ANNEE_NAISSANCE_MAX}].`,
    )
  }
  return annee
}

// Normalise un libellé (trim + espaces internes réduits) et vérifie sa présence
// et sa longueur (R9/R4). Lance ImportInvalideError sinon.
function normaliserLibelle(valeur: string, champ: string): string {
  const normalise = (valeur ?? '').trim().replace(/\s+/g, ' ')
  if (!normalise) {
    throw new ImportInvalideError(`${champ} manquant.`)
  }
  if (normalise.length > NOM_GRIMPEUR_MAX) {
    throw new ImportInvalideError(`${champ} trop long (max ${NOM_GRIMPEUR_MAX} caractères).`)
  }
  return normalise
}

function normaliserLicence(brut: string): number {
  const v = (brut ?? '').trim()
  if (!v) {
    throw new ImportInvalideError('Numéro de licence absent.')
  }
  if (!/^\d+$/.test(v)) {
    throw new ImportInvalideError('Numéro de licence non entier.')
  }
  const licence = Number(v)
  if (licence <= 0) {
    throw new ImportInvalideError('Numéro de licence invalide (doit être > 0).')
  }
  return licence
}

// Parse une ligne en grimpeur normalisé (R9). Lance ImportInvalideError (R10).
function parserLigne(l: LigneImport): GrimpeurImport {
  const [nom = '', prenom = '', dateNaissance = '', sexe = '', licence = '', structure = ''] =
    l.cellules
  return {
    nom: normaliserLibelle(nom, 'Nom'),
    prenom: normaliserLibelle(prenom, 'Prénom'),
    anneeNaissance: anneeDepuisDateFr(dateNaissance),
    sexe: convertirSexe(sexe),
    licence: normaliserLicence(licence),
    club: normaliserLibelle(structure, 'Nom de la structure'),
    ligne: l.ligne,
  }
}

// Identité au mieux pour un message d'erreur : « NOM Prénom » ou « — ».
function identiteAuMieux(l: LigneImport): string {
  const nom = (l.cellules[0] ?? '').trim()
  const prenom = (l.cellules[1] ?? '').trim()
  const identite = [nom, prenom].filter(Boolean).join(' ')
  return identite || '—'
}

/**
 * Analyse pure d'un fichier d'import (R15) : pour chaque ligne, normalise (R9),
 * écarte les invalides en erreurs (R10), ignore les hors-âge (R7/R8), puis
 * consolide les doublons de licence — dernière occurrence gagnante (R14).
 */
export function analyserImport(lignes: LigneImport[], anneeReference: number): AnalyseImport {
  const seuil = seuilAnneeNaissance(anneeReference)
  const erreurs: ErreurImport[] = []
  const doublons: DoublonImport[] = []
  const parLicence = new Map<number, GrimpeurImport>()
  let ignoresHorsAge = 0

  for (const l of lignes) {
    let grimpeur: GrimpeurImport
    try {
      grimpeur = parserLigne(l)
    } catch (e) {
      if (e instanceof ImportInvalideError) {
        erreurs.push({ ligne: l.ligne, identite: identiteAuMieux(l), raison: e.message })
        continue
      }
      throw e
    }

    if (grimpeur.anneeNaissance < seuil) {
      ignoresHorsAge++
      continue
    }

    const existant = parLicence.get(grimpeur.licence)
    if (existant) {
      doublons.push({ ligne: existant.ligne, licence: grimpeur.licence })
    }
    parLicence.set(grimpeur.licence, grimpeur)
  }

  return {
    anneeReference,
    seuilAnneeNaissance: seuil,
    aImporter: [...parLicence.values()],
    ignoresHorsAge,
    erreurs,
    doublons,
  }
}
