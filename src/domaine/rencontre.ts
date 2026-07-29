// Domaine pur — rencontre (spec #1 « Rôles & autorisations », R12 : CRUD
// rencontre réservé à l'admin ; R5 : cycle de vie en trois phases successives).
// Ici, pas d'accès Supabase : uniquement la validation/normalisation de la
// saisie et l'ordre des phases, reflets des contraintes SQL de `rencontre`
// (`categorie in ('enfant','ado')`, `phase in (...)`, `date_rencontre date`).

/** Catégorie d'une rencontre (tranche d'âge, R34). Valeurs = contrainte SQL. */
export const CATEGORIES = [
  { value: 'enfant', label: 'Enfant — matin (moins de 13 ans)' },
  { value: 'ado', label: 'Ado — après-midi (13 à 19 ans)' },
] as const

export type Categorie = (typeof CATEGORIES)[number]['value']

/** Phases successives d'une rencontre, dans l'ordre du cycle de vie (R5). */
export const PHASES = [
  { value: 'pre_competition', label: 'Pré-compétition' },
  { value: 'competition', label: 'Compétition' },
  { value: 'resultats_publics', label: 'Résultats publics' },
] as const

export type Phase = (typeof PHASES)[number]['value']

/** Saisie invalide d'une rencontre (date, club porteur ou catégorie). */
export class SaisieRencontreInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaisieRencontreInvalideError'
  }
}

/** Saisie brute d'une rencontre (issue d'un formulaire). */
export type SaisieRencontre = {
  dateRencontre: string
  clubPorteurId: string
  categorie: string
}

/** Rencontre normalisée, prête à écrire. */
export type RencontreNormalisee = {
  dateRencontre: string
  clubPorteurId: string
  categorie: Categorie
}

// Vérifie qu'une chaîne `AAAA-MM-JJ` est une date calendaire réelle (rejette
// p. ex. 2026-02-30, que le seul format ne suffit pas à écarter).
function estDateISOValide(valeur: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur)
  if (!m) return false
  const [, a, mo, j] = m
  const d = new Date(`${valeur}T00:00:00Z`)
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(a) &&
    d.getUTCMonth() + 1 === Number(mo) &&
    d.getUTCDate() === Number(j)
  )
}

/**
 * Normalise et valide la saisie d'une rencontre. Rejette une date absente, mal
 * formée ou impossible, un club porteur manquant, ou une catégorie hors
 * référentiel. L'existence du club et l'unicité éventuelle relèvent de la base.
 */
export function normaliserSaisieRencontre(
  saisie: SaisieRencontre,
): RencontreNormalisee {
  const dateRencontre = (saisie.dateRencontre ?? '').trim()
  const clubPorteurId = (saisie.clubPorteurId ?? '').trim()
  const categorie = (saisie.categorie ?? '').trim()

  if (!dateRencontre) {
    throw new SaisieRencontreInvalideError('La date de la rencontre est obligatoire.')
  }
  if (!estDateISOValide(dateRencontre)) {
    throw new SaisieRencontreInvalideError('La date de la rencontre est invalide.')
  }
  if (!clubPorteurId) {
    throw new SaisieRencontreInvalideError('Le club porteur est obligatoire.')
  }
  if (!CATEGORIES.some((c) => c.value === categorie)) {
    throw new SaisieRencontreInvalideError('La catégorie est invalide.')
  }

  return { dateRencontre, clubPorteurId, categorie: categorie as Categorie }
}

/** Phase suivante dans le cycle (R5), ou `null` si déjà à la dernière. */
export function phaseSuivante(phase: Phase): Phase | null {
  const i = PHASES.findIndex((p) => p.value === phase)
  const suivante = PHASES[i + 1]
  return suivante ? suivante.value : null
}

/** Phase précédente dans le cycle (R5), ou `null` si déjà à la première. */
export function phasePrecedente(phase: Phase): Phase | null {
  const i = PHASES.findIndex((p) => p.value === phase)
  return i > 0 ? PHASES[i - 1].value : null
}
