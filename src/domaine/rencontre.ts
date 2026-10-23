// Domaine pur — rencontre (spec #1 « Rôles & autorisations », R12 : CRUD
// rencontre réservé à l'admin ; R5 : cycle de vie en cinq phases successives).
// Ici, pas d'accès Supabase : uniquement la validation/normalisation de la
// saisie et l'ordre des phases, reflets des contraintes SQL de `rencontre`
// (`categorie in ('enfant','ado','adulte')`, `phase in (...)`, `date_rencontre date`).

/**
 * Catégorie d'une rencontre (tranche d'âge, R34 ; adulte : spec #20 R1).
 * Valeurs = contrainte SQL.
 */
export const CATEGORIES = [
  { value: 'enfant', label: 'Enfant — matin (moins de 13 ans)', labelCourt: 'Enfant' },
  { value: 'ado', label: 'Ado — après-midi (13 à 19 ans)', labelCourt: 'Ado' },
  { value: 'adulte', label: 'Adulte (16 ans et plus)', labelCourt: 'Adulte' },
] as const

export type Categorie = (typeof CATEGORIES)[number]['value']

/**
 * Vrai si les grimpeurs de la catégorie choisissent **librement** leurs voies
 * (ado, adulte : zones, plafond de 6 voies, pas de groupe de départ — spec #6
 * R11–R14, spec #20 R22–R24). Faux pour l'enfant (3 voies du groupe de départ).
 */
export function aVoiesLibres(categorie: Categorie): boolean {
  return categorie !== 'enfant'
}

/** Phases successives d'une rencontre, dans l'ordre du cycle de vie (R5). */
export const PHASES = [
  { value: 'pre_competition', label: 'Pré-compétition' },
  { value: 'preparation', label: 'Préparation jour J' },
  { value: 'competition', label: 'Compétition' },
  { value: 'cloture', label: 'Clôture' },
  { value: 'resultats_publics', label: 'Résultats publics' },
] as const

export type Phase = (typeof PHASES)[number]['value']

/** Libellé affiché d'une phase ; une valeur inconnue est rendue telle quelle. */
export function libellePhase(phase: string): string {
  return PHASES.find((p) => p.value === phase)?.label ?? phase
}

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

// Bornes d'âge des catégories (R34) : enfant « moins de 13 ans » + pivot ; ado
// « 13 à 19 ans ». Le pivot (13 ans) est éligible aux DEUX catégories.
export const AGE_PIVOT = 13
export const AGE_ADO_MAX = 19
/** Âge minimal en saison de la catégorie adulte, sans âge maximal (spec #20 R2). */
export const AGE_ADULTE_MIN = 16

/**
 * Âge « de compétition » d'un grimpeur pour une saison : année de la saison moins
 * l'année de naissance (R34). `anneeSaison` = début de saison (cf. `anneeSaison()`).
 */
export function ageEnSaison(anneeNaissance: number, anneeSaison: number): number {
  return anneeSaison - anneeNaissance
}

/**
 * Vrai si un grimpeur né en `anneeNaissance` est éligible à la `categorie` d'une
 * rencontre de la saison `anneeSaison` (R34) : **enfant** = âge ≤ 13 (moins de 13
 * ans + pivot), **ado** = 13 ≤ âge ≤ 19. Le pivot (13 ans) est dans les deux.
 * **Adulte** = âge ≥ 16, sans maximum (spec #20 R2) : les 16–19 ans sont donc
 * éligibles à l'ado et à l'adulte (R3).
 */
export function estEligibleCategorie(
  anneeNaissance: number,
  categorie: Categorie,
  anneeSaison: number,
): boolean {
  const age = ageEnSaison(anneeNaissance, anneeSaison)
  switch (categorie) {
    case 'enfant':
      return age <= AGE_PIVOT
    case 'ado':
      return age >= AGE_PIVOT && age <= AGE_ADO_MAX
    case 'adulte':
      return age >= AGE_ADULTE_MIN
  }
}

/**
 * Bornes d'année de naissance équivalentes à `estEligibleCategorie` (R34), pour
 * filtrer une lecture en base : **enfant** = né en `saison − 13` ou après (pas de
 * borne haute) ; **ado** = né de `saison − 19` à `saison − 13` ; **adulte** = né
 * en `saison − 16` ou avant (pas de borne basse, spec #20 R2). `null` = pas de
 * borne.
 */
export function bornesAnneeNaissance(
  categorie: Categorie,
  anneeSaison: number,
): { min: number | null; max: number | null } {
  switch (categorie) {
    case 'enfant':
      return { min: anneeSaison - AGE_PIVOT, max: null }
    case 'ado':
      return { min: anneeSaison - AGE_ADO_MAX, max: anneeSaison - AGE_PIVOT }
    case 'adulte':
      return { min: null, max: anneeSaison - AGE_ADULTE_MIN }
  }
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
 * Phases se déroulant **le jour de la rencontre** (jour J) : ② préparation et ③
 * compétition (R5, rév. 2026-09-02). Hors jour J, une rencontre ne peut être dans
 * aucune de ces deux phases.
 */
export const PHASES_JOUR_J: Phase[] = ['preparation', 'competition']

/** Vrai si `phase` se déroule le jour J (préparation ou compétition, R5). */
export function estPhaseJourJ(phase: Phase): boolean {
  return PHASES_JOUR_J.includes(phase)
}

/**
 * Garde-fou « jour J » (R5, rév. 2026-09-02) : l'admin ne peut faire entrer une
 * rencontre dans une **phase jour-J** (② préparation, ③ compétition) que **le jour
 * de la rencontre**. Les autres phases ne sont pas bornées par la date.
 * `dateRencontre` et `aujourdhui` sont des dates ISO `AAAA-MM-JJ`.
 */
export function peutEntrerEnPhase(
  cible: Phase,
  dateRencontre: string,
  aujourdhui: string,
): boolean {
  return estPhaseJourJ(cible) ? dateRencontre === aujourdhui : true
}

/**
 * Cible **effective** d'un retour arrière depuis `phase`, compte tenu de la date
 * (R5, rév. 2026-09-02). Depuis la ③ compétition **hors jour J**, la ② préparation
 * étant elle-même bornée au jour J, on recule directement en ① pré-compétition.
 * Sinon, retour séquentiel classique.
 */
export function phasePrecedenteEffective(
  phase: Phase,
  dateRencontre: string,
  aujourdhui: string,
): Phase | null {
  if (phase === 'competition' && dateRencontre !== aujourdhui) {
    return 'pre_competition'
  }
  return phasePrecedente(phase)
}

/**
 * Vrai si la transition `courante` → `cible` est permise (spec #3 R17) : un pas
 * en avant (`phaseSuivante`) ou un pas en arrière (`phasePrecedenteEffective`,
 * qui porte la seule exception — retour ③ → ① hors jour J, spec #1 R5). Tout
 * saut, dépassement des bornes ou « transition » vers la phase courante est
 * refusé. À évaluer contre la phase EN BASE, pas celle affichée par l'écran.
 * Le garde-fou jour J de l'entrée en ②/③ reste vérifié à part
 * (`peutEntrerEnPhase`).
 */
export function peutTransiter(
  courante: Phase,
  cible: Phase,
  dateRencontre: string,
  aujourdhui: string,
): boolean {
  return (
    cible === phaseSuivante(courante) ||
    cible === phasePrecedenteEffective(courante, dateRencontre, aujourdhui)
  )
}

/** Vrai si la phase génère des écritures de résultats → live utile (③ compétition / ④ clôture, spec #11 R7). */
export function phaseEnDirect(phase: Phase): boolean {
  return phase === 'competition' || phase === 'cloture'
}
