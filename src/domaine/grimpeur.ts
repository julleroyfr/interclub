// Domaine pur — grimpeur (spec #1 « Rôles & autorisations », R18 : roster de
// grimpeurs d'un club, géré par son coach ou l'admin). Ici, pas d'accès
// Supabase : uniquement la validation/normalisation de la saisie, reflet des
// contraintes SQL de `grimpeur` (`nom`/`prenom` `text not null`,
// `annee_naissance int check between 1900 and 2100`,
// `licence int not null check > 0 unique` — spec #3 R21b, plage réservée R21c).

/** Longueur maximale d'un nom ou prénom (borne de saisie, côté domaine). */
export const NOM_GRIMPEUR_MAX = 100

/** Bornes de l'année de naissance (reflet de la contrainte SQL). */
export const ANNEE_NAISSANCE_MIN = 1900
export const ANNEE_NAISSANCE_MAX = 2100

/**
 * Sexe d'un grimpeur — `'F'` (Femme) ou `'H'` (Homme). Obligatoire : prérequis
 * du classement individuel séparé par sexe (spec #7 R8b) ; reflet du check SQL
 * `grimpeur.sexe in ('F','H')`.
 */
export type Sexe = 'F' | 'H'

/** Plus grand entier SQL `integer` : borne haute de `grimpeur.licence`. */
export const LICENCE_MAX = 2_147_483_647

/**
 * Début de la plage réservée aux licences **générées** par l'import CSV sans
 * licence (spec #18 R14, spec #3 R21c) : `[LICENCE_GENEREE_MIN, LICENCE_MAX]`.
 */
export const LICENCE_GENEREE_MIN = 2_000_000_000

/**
 * Une licence est générée si et seulement si elle est dans la plage réservée
 * (spec #18 R15) — reflet de la colonne dérivée `grimpeur.licence_generee`.
 */
export function estLicenceGeneree(licence: number): boolean {
  return licence >= LICENCE_GENEREE_MIN && licence <= LICENCE_MAX
}

/** Valeurs de sexe admises (reflet de la contrainte SQL). */
export const SEXES: readonly Sexe[] = ['F', 'H']

/** Saisie invalide d'un grimpeur (nom, prénom ou année de naissance). */
export class GrimpeurInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GrimpeurInvalideError'
  }
}

/** Saisie brute d'un grimpeur (issue d'un formulaire). */
export type SaisieGrimpeur = {
  nom: string
  prenom: string
  anneeNaissance: string
  sexe: string
  licence: string
}

/** Grimpeur normalisé, prêt à écrire. */
export type GrimpeurNormalise = {
  nom: string
  prenom: string
  anneeNaissance: number
  sexe: Sexe
  licence: number
}

// Normalise un libellé : espaces de bord retirés, espaces internes réduits à un
// seul. Rejette vide ou trop long via le message fourni.
function normaliserLibelle(valeur: string, champ: string): string {
  const normalise = (valeur ?? '').trim().replace(/\s+/g, ' ')
  if (!normalise) {
    throw new GrimpeurInvalideError(`Le ${champ} du grimpeur est obligatoire.`)
  }
  if (normalise.length > NOM_GRIMPEUR_MAX) {
    throw new GrimpeurInvalideError(
      `Le ${champ} du grimpeur ne peut dépasser ${NOM_GRIMPEUR_MAX} caractères.`,
    )
  }
  return normalise
}

/**
 * Normalise et valide la saisie d'un grimpeur. Rejette un nom/prénom absent ou
 * trop long, ou une année de naissance non entière / hors bornes. La catégorie
 * (enfant/ado) découle de l'année rapportée à la saison (R34) — hors de ce
 * domaine de saisie. `licenceActuelle` (modification) : seule cette licence peut
 * être conservée si elle est dans la plage réservée aux licences générées
 * (spec #3 R21c).
 */
export function normaliserSaisieGrimpeur(
  saisie: SaisieGrimpeur,
  licenceActuelle?: number,
): GrimpeurNormalise {
  const nom = normaliserLibelle(saisie.nom, 'nom')
  const prenom = normaliserLibelle(saisie.prenom, 'prénom')

  const brut = (saisie.anneeNaissance ?? '').trim()
  if (!/^\d{4}$/.test(brut)) {
    throw new GrimpeurInvalideError(
      'L’année de naissance doit être une année à 4 chiffres.',
    )
  }
  const anneeNaissance = Number(brut)
  if (anneeNaissance < ANNEE_NAISSANCE_MIN || anneeNaissance > ANNEE_NAISSANCE_MAX) {
    throw new GrimpeurInvalideError(
      `L’année de naissance doit être comprise entre ${ANNEE_NAISSANCE_MIN} et ${ANNEE_NAISSANCE_MAX}.`,
    )
  }

  const sexe = (saisie.sexe ?? '').trim()
  if (!SEXES.includes(sexe as Sexe)) {
    throw new GrimpeurInvalideError('Le sexe du grimpeur doit être « F » ou « H ».')
  }

  const brutLicence = (saisie.licence ?? '').trim()
  if (!brutLicence) {
    throw new GrimpeurInvalideError('Le numéro de licence est obligatoire.')
  }
  if (!/^\d+$/.test(brutLicence)) {
    throw new GrimpeurInvalideError('Le numéro de licence doit être un entier positif.')
  }
  const licence = Number(brutLicence)
  if (licence <= 0 || licence > LICENCE_MAX) {
    throw new GrimpeurInvalideError('Le numéro de licence doit être un entier positif.')
  }
  if (estLicenceGeneree(licence) && licence !== licenceActuelle) {
    throw new GrimpeurInvalideError(
      'Les numéros à partir de 2 000 000 000 sont réservés aux licences générées par l’import.',
    )
  }

  return { nom, prenom, anneeNaissance, sexe: sexe as Sexe, licence }
}
