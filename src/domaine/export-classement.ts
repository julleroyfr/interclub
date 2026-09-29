// Domaine pur — export PDF des classements officiels d'une rencontre (spec #15).
// Aucune dépendance Supabase ni PDF : décide qui peut exporter (R1–R5), nomme le
// fichier (R9) et construit le MODÈLE du document (en-tête, sections, colonnes,
// lignes — R10–R16) à partir du classement déjà calculé par la spec #7, sans
// recalculer ni rang ni score (R13). Le rendu PDF (R17–R20) consomme ce modèle.

import { CATEGORIES, type Categorie, type Phase } from './rencontre'

/** Qui demande l'export — rôles de spec #1, vus du point d'accès (R3–R5). */
export type DemandeurExport =
  | { role: 'admin' }
  | { role: 'coach_permanent'; clubId: string }
  | { role: 'coach_temporaire' }
  | { role: 'juge' }
  | { role: 'anonyme' }

/** État de la rencontre utile à la décision d'export. */
export type ContexteRencontreExport = {
  phase: Phase
  /** Clubs ayant au moins une équipe dans la rencontre (« club engagé »). */
  clubsEngages: readonly string[]
}

/**
 * Vrai si le demandeur peut exporter : rencontre en ⑤ uniquement (R1/R2), puis
 * admin sans condition (R3), coach permanent si son club est engagé (R4) ; tout
 * autre rôle est refusé (R5).
 */
export function peutExporter(demandeur: DemandeurExport, rencontre: ContexteRencontreExport): boolean {
  if (rencontre.phase !== 'resultats_publics') return false
  switch (demandeur.role) {
    case 'admin':
      return true
    case 'coach_permanent':
      return rencontre.clubsEngages.includes(demandeur.clubId)
    default:
      return false
  }
}

/** Nom du fichier téléchargé : `classement-<AAAA-MM-JJ>-<categorie>.pdf` (R9). */
export function nomFichierExport(dateRencontre: string, categorie: Categorie): string {
  return `classement-${dateRencontre}-${categorie}.pdf`
}

/** Ligne individuelle en entrée (forme des lignes du loader spec #7). */
export type LigneIndividuelSource = {
  rang: number
  nom: string
  prenom: string
  clubOrigineNom: string
  score: number
}
export type LigneEquipeSource = { rang: number; equipeNom: string; clubNom: string; score: number }
export type LigneClubSource = { rang: number; clubNom: string; score: number }

/** Classement officiel d'une rencontre, tel que calculé par la spec #7. */
export type SourceExport = {
  dateRencontre: string
  categorie: Categorie
  clubPorteurNom: string
  individuel: { filles: readonly LigneIndividuelSource[]; garcons: readonly LigneIndividuelSource[] }
  equipes: readonly LigneEquipeSource[]
  clubs: readonly LigneClubSource[]
}

export type ColonneExport = { libelle: string; alignement: 'gauche' | 'droite' }

export type SectionExport = {
  titre: string
  /** Nombre de lignes, accordé (ex. « 42 grimpeuses », « 1 club ») — R12. */
  compte: string
  colonnes: ColonneExport[]
  /** Cellules déjà formatées, dans l'ordre du classement (R13/R14). */
  lignes: string[][]
  /** « Aucun classement » si la section est vide, sinon `null` (R16). */
  messageVide: string | null
}

export type DocumentExport = {
  entete: {
    titre: string
    date: string
    categorie: string
    clubPorteur: string
    genereLe: string
  }
  /** Rappel de la rencontre porté par chaque page (R19). */
  piedDePage: string
  sections: SectionExport[]
}

const FUSEAU = 'Europe/Paris'

/** « 12 octobre 2026 » — la date d'une rencontre est un jour civil, sans fuseau. */
function formaterDateRencontre(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a!, m! - 1, j!)))
}

/** « 13 octobre 2026 à 09:42 », heure de Paris (R10). */
function formaterGeneration(instant: Date): string {
  const jour = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: FUSEAU,
  }).format(instant)
  const heure = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: FUSEAU,
  }).format(instant)
  return `${jour} à ${heure}`
}

/**
 * Score tel quel, virgule décimale française, sans arrondi ni séparateur de
 * milliers (R13) — les espaces insécables d'`Intl` ne passent pas dans toutes les
 * polices PDF.
 */
const formaterScore = (score: number): string => String(score).replace('.', ',')

/** En français, 0 et 1 prennent le singulier. */
const compter = (n: number, singulier: string, pluriel: string): string =>
  `${n} ${n <= 1 ? singulier : pluriel}`

const COLONNES_INDIVIDUEL: ColonneExport[] = [
  { libelle: 'Rang', alignement: 'gauche' },
  { libelle: 'Nom Prénom', alignement: 'gauche' },
  { libelle: "Club d'origine", alignement: 'gauche' },
  { libelle: 'Score', alignement: 'droite' },
]

function section(
  titre: string,
  compte: string,
  colonnes: ColonneExport[],
  lignes: string[][],
): SectionExport {
  return { titre, compte, colonnes, lignes, messageVide: lignes.length ? null : 'Aucun classement' }
}

const lignesIndividuel = (lignes: readonly LigneIndividuelSource[]): string[][] =>
  lignes.map((l) => [String(l.rang), `${l.nom} ${l.prenom}`, l.clubOrigineNom, formaterScore(l.score)])

/**
 * Construit le modèle du document d'export (R10–R16). Identique quel que soit le
 * demandeur (R6) : aucun filtre, aucune mise en évidence.
 */
export function construireDocumentExport(source: SourceExport, genereLe: Date): DocumentExport {
  const date = formaterDateRencontre(source.dateRencontre)
  const categorie =
    CATEGORIES.find((c) => c.value === source.categorie)?.labelCourt ?? source.categorie
  const { filles, garcons } = source.individuel

  return {
    entete: {
      titre: 'Classement officiel',
      date,
      categorie,
      clubPorteur: source.clubPorteurNom,
      genereLe: formaterGeneration(genereLe),
    },
    piedDePage: `${date} · ${categorie}`,
    sections: [
      section(
        'Individuel Filles',
        compter(filles.length, 'grimpeuse', 'grimpeuses'),
        COLONNES_INDIVIDUEL,
        lignesIndividuel(filles),
      ),
      section(
        'Individuel Garçons',
        compter(garcons.length, 'grimpeur', 'grimpeurs'),
        COLONNES_INDIVIDUEL,
        lignesIndividuel(garcons),
      ),
      section(
        'Équipes',
        compter(source.equipes.length, 'équipe', 'équipes'),
        [
          { libelle: 'Rang', alignement: 'gauche' },
          { libelle: 'Équipe', alignement: 'gauche' },
          { libelle: 'Club', alignement: 'gauche' },
          { libelle: 'Score', alignement: 'droite' },
        ],
        source.equipes.map((e) => [String(e.rang), e.equipeNom, e.clubNom, formaterScore(e.score)]),
      ),
      section(
        'Clubs',
        compter(source.clubs.length, 'club', 'clubs'),
        [
          { libelle: 'Rang', alignement: 'gauche' },
          { libelle: 'Club', alignement: 'gauche' },
          { libelle: 'Score', alignement: 'droite' },
        ],
        source.clubs.map((c) => [String(c.rang), c.clubNom, formaterScore(c.score)]),
      ),
    ],
  }
}
