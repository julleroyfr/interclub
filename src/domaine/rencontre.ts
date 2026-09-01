// Domaine pur — rencontre (spec #1 « Rôles & autorisations », R12 : CRUD
// rencontre réservé à l'admin ; R5 : cycle de vie en cinq phases successives).
// Ici, pas d'accès Supabase : uniquement la validation/normalisation de la
// saisie et l'ordre des phases, reflets des contraintes SQL de `rencontre`
// (`categorie in ('enfant','ado')`, `phase in (...)`, `date_rencontre date`).

/** Catégorie d'une rencontre (tranche d'âge, R34). Valeurs = contrainte SQL. */
export const CATEGORIES = [
  { value: 'enfant', label: 'Enfant — matin (moins de 13 ans)', labelCourt: 'Enfant' },
  { value: 'ado', label: 'Ado — après-midi (13 à 19 ans)', labelCourt: 'Ado' },
] as const

export type Categorie = (typeof CATEGORIES)[number]['value']

/** Phases successives d'une rencontre, dans l'ordre du cycle de vie (R5). */
export const PHASES = [
  { value: 'pre_competition', label: 'Pré-compétition' },
  { value: 'preparation', label: 'Préparation jour J' },
  { value: 'competition', label: 'Compétition' },
  { value: 'cloture', label: 'Clôture' },
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

/**
 * Année de début de la saison sportive contenant la date donnée (R37).
 * Sept–Déc → année de la date. Jan–Août → année de la date − 1.
 * Exemple : '2026-03-10' → 2025 (saison 2025–2026).
 */
export function anneeSaison(dateISO: string): number {
  const mois = Number(dateISO.slice(5, 7))
  const annee = Number(dateISO.slice(0, 4))
  return mois >= 9 ? annee : annee - 1
}

/** Bornes de dates SQL (gte/lte) pour filtrer les rencontres d'une saison (R37). */
export function bornesSaison(annee: number): { debut: string; fin: string } {
  return {
    debut: `${annee}-09-01`,
    fin: `${annee + 1}-08-31`,
  }
}

/** Libellé lisible d'une saison (ex. 2025 → "2025–2026"). */
export function labelSaison(annee: number): string {
  return `${annee}–${annee + 1}`
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

/**
 * Garde-fou « jour J » de la phase préparation (R5, rév. 2026-09-01) : l'admin ne
 * peut faire entrer une rencontre en `preparation` que **le jour de la
 * rencontre**. `dateRencontre` et `aujourdhui` sont des dates ISO `AAAA-MM-JJ`.
 */
export function peutEntrerEnPreparation(dateRencontre: string, aujourdhui: string): boolean {
  return dateRencontre === aujourdhui
}
