// Domaine pur — gabarit de rencontre (spec #3 R29–R37).
// Pas d'accès Supabase : validation des niveaux réglementaires et construction
// du payload de copie gabarit → épreuves instanciées.

import type { Categorie } from './rencontre'

/** Niveaux moulinette réglementaires — enfant uniquement (R37). */
export const NIVEAUX_MOULINETTE = ['M1', 'M2', 'M3', 'M4'] as const

/** Niveaux tête réglementaires — enfant et ado (R37). */
export const NIVEAUX_TETE = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'] as const

export type NiveauMoulinette = (typeof NIVEAUX_MOULINETTE)[number]
export type NiveauTete = (typeof NIVEAUX_TETE)[number]
export type TypeVoie = 'moulinette' | 'tete'
export type TypeEpreuve = 'voie' | 'bloc' | 'vitesse'

/** Niveau hors plage réglementaire pour la catégorie et le type de voie donnés. */
export class NiveauVoieInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NiveauVoieInvalideError'
  }
}

/**
 * Valide qu'un niveau de voie de difficulté est réglementaire (R37).
 * - Enfant moulinette : M1–M4.
 * - Enfant et ado tête : T1–T10.
 * - Ado : aucune voie moulinette autorisée.
 * Lance `NiveauVoieInvalideError` si le niveau est invalide.
 */
export function validerNiveauVoie(
  niveau: string,
  typeVoie: TypeVoie,
  categorie: Categorie,
): void {
  if (typeVoie === 'moulinette') {
    if (categorie === 'ado') {
      throw new NiveauVoieInvalideError(
        `Les voies moulinette ne sont pas autorisées pour la catégorie ado (R37).`,
      )
    }
    if (!(NIVEAUX_MOULINETTE as readonly string[]).includes(niveau)) {
      throw new NiveauVoieInvalideError(
        `Niveau moulinette invalide : « ${niveau} ». Valeurs acceptées : M1–M4 (R37).`,
      )
    }
    return
  }

  // tête
  if (!(NIVEAUX_TETE as readonly string[]).includes(niveau)) {
    throw new NiveauVoieInvalideError(
      `Niveau tête invalide : « ${niveau} ». Valeurs acceptées : T1–T10 (R37).`,
    )
  }
}

/** Points d'une voie ou d'un palier invalides (négatifs ou non entiers). */
export class PointsInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PointsInvalideError'
  }
}

/**
 * Valide qu'un nombre de points est un entier positif ou nul (R38, R39).
 * Lance `PointsInvalideError` sinon.
 */
export function validerPoints(points: number, libelle = 'Les points'): void {
  if (!Number.isInteger(points) || points < 0) {
    throw new PointsInvalideError(
      `${libelle} doivent être un entier positif ou nul (R38).`,
    )
  }
}

/** Champs de points conditionnels applicables à une voie de difficulté (R38). */
export type ChampsPointsVoie = {
  /** Prise valorisée — voies tête enfant uniquement (R38). */
  priseValorisee: boolean
  /** Zones 1 et 2 — voies ado uniquement (R38). */
  zones: boolean
}

/**
 * Détermine quels champs de points supplémentaires s'appliquent à une voie de
 * difficulté selon sa catégorie et son type (R38) — pilote l'affichage du
 * formulaire d'ajout de voie (R43). Le champ « points voie entière » est
 * toujours requis et n'apparaît donc pas ici.
 * - Enfant tête → prise valorisée.
 * - Ado (tête) → zones 1/2.
 * - Enfant moulinette / ado moulinette (interdit R37) → aucun champ conditionnel.
 */
export function champsPointsVoie(
  categorie: Categorie,
  typeVoie: TypeVoie,
): ChampsPointsVoie {
  return {
    priseValorisee: categorie === 'enfant' && typeVoie === 'tete',
    zones: categorie === 'ado' && typeVoie === 'tete',
  }
}

// ---------------------------------------------------------------------------
// Types pour la copie gabarit → rencontre (R30)
// ---------------------------------------------------------------------------

export type GabaritVoieDifficulte = {
  niveau: string
  typeVoie: TypeVoie
  cotation: string
  /** Points du top de la voie (R38). */
  points: number
  /** Prise valorisée — enfant tête uniquement (R38), sinon null. */
  pointsPriseValorisee: number | null
  /** Prise Zone 1 — ado uniquement (R38), sinon null. */
  pointsZone1: number | null
  /** Prise Zone 2 — ado uniquement (R38), sinon null. */
  pointsZone2: number | null
  ordre: number
}

/** Palier de points d'un bloc — meilleure tentative, pas de cumul (R39). */
export type GabaritBlocPalier = {
  libelle: string
  points: number
  ordre: number
}

export type GabaritBloc = {
  code: string
  ordre: number
  paliers: GabaritBlocPalier[]
}

export type GabaritVoieVitesse = {
  libelle: string
  ordre: number
}

export type GabaritEpreuve = {
  type: TypeEpreuve
  voiesDifficulte: GabaritVoieDifficulte[]
  blocs: GabaritBloc[]
  voiesVitesse: GabaritVoieVitesse[]
}

/** Épreuve instanciée dans une rencontre — même structure que le gabarit. */
export type EpreuveInstanciee = GabaritEpreuve

/**
 * Construit les épreuves à créer pour une rencontre depuis son gabarit (R30).
 * La liste est une copie profonde : la modifier ne touche pas le gabarit source.
 */
export function construireEpreuvesDepuisGabarit(
  gabarit: GabaritEpreuve[],
): EpreuveInstanciee[] {
  return gabarit.map((e) => ({
    type: e.type,
    voiesDifficulte: e.voiesDifficulte.map((v) => ({ ...v })),
    blocs: e.blocs.map((b) => ({ ...b, paliers: b.paliers.map((p) => ({ ...p })) })),
    voiesVitesse: e.voiesVitesse.map((vv) => ({ ...vv })),
  }))
}
