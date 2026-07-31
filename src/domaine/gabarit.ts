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

// ---------------------------------------------------------------------------
// Types pour la copie gabarit → rencontre (R30)
// ---------------------------------------------------------------------------

export type GabaritVoieDifficulte = {
  niveau: string
  typeVoie: TypeVoie
  cotation: string
  ordre: number
}

export type GabaritBloc = {
  code: string
  ordre: number
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
    blocs: e.blocs.map((b) => ({ ...b })),
    voiesVitesse: e.voiesVitesse.map((vv) => ({ ...vv })),
  }))
}
