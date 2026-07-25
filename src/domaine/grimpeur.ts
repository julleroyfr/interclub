// Domaine pur — grimpeur (spec #1 « Rôles & autorisations », R18 : roster de
// grimpeurs d'un club, géré par son coach ou l'admin). Ici, pas d'accès
// Supabase : uniquement la validation/normalisation de la saisie, reflet des
// contraintes SQL de `grimpeur` (`nom`/`prenom` `text not null`,
// `annee_naissance int check between 1900 and 2100`).

/** Longueur maximale d'un nom ou prénom (borne de saisie, côté domaine). */
export const NOM_GRIMPEUR_MAX = 100

/** Bornes de l'année de naissance (reflet de la contrainte SQL). */
export const ANNEE_NAISSANCE_MIN = 1900
export const ANNEE_NAISSANCE_MAX = 2100

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
}

/** Grimpeur normalisé, prêt à écrire. */
export type GrimpeurNormalise = {
  nom: string
  prenom: string
  anneeNaissance: number
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
 * domaine de saisie.
 */
export function normaliserSaisieGrimpeur(saisie: SaisieGrimpeur): GrimpeurNormalise {
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

  return { nom, prenom, anneeNaissance }
}
