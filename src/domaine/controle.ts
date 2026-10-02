// Domaine pur — contrôle des résultats contre les fiches papier des juges
// (spec #16).
//
// Pas d'accès Supabase : disponibilité de l'écran et droit de cocher selon la
// phase (R2/R13), libellé de l'issue affichée sans points (R8), tri (R7),
// filtres d'affichage (R9) et progressions (R3/R5). Le rôle admin, la RLS et
// l'écriture de la coche restent côté serveur / Supabase.

import type { Phase } from './rencontre'
import type { IssueBloc, IssueVoie } from './resultat'

/**
 * Mode de l'écran de contrôle selon la phase (R2) : `controle` en ④ clôture
 * (coches modifiables), `lecture` en ⑤ résultats publics (lecture seule),
 * `null` avant (écran indisponible → 404).
 */
export function modeControle(phase: Phase): 'controle' | 'lecture' | null {
  if (phase === 'cloture') return 'controle'
  if (phase === 'resultats_publics') return 'lecture'
  return null
}

/** Une coche ne s'écrit qu'en ④ clôture (R13). */
export function peutCocher(phase: Phase): boolean {
  return modeControle(phase) === 'controle'
}

const LIBELLES_VOIE: Record<IssueVoie, string> = {
  top: 'Top',
  prise_valorisee: 'Prise valorisée',
  zone2: 'Zone 2',
  zone1: 'Zone 1',
  echec: 'Échec',
  np: 'NP',
}

/** Libellé affiché d'une issue de voie — jamais de points (R8). */
export function libelleIssueVoie(issue: IssueVoie): string {
  return LIBELLES_VOIE[issue]
}

/**
 * Libellé affiché d'une issue de bloc (R8) : le **libellé du palier** atteint
 * (ex. « 2e essai », « Bloc complet »), sinon « Échec » / « NP ».
 */
export function libelleIssueBloc(issue: IssueBloc, palierLibelle: string | null): string {
  if (issue === 'echec') return 'Échec'
  if (issue === 'np') return 'NP'
  return palierLibelle ?? 'Palier'
}

/** Ligne de contrôle : un résultat existant sur une voie ou un bloc (R6). */
export type LigneControle = {
  /** Id du `resultat_voie` / `resultat_bloc`. */
  resultatId: string
  nom: string
  prenom: string
  /** Club d'origine du grimpeur. */
  clubNom: string
  /** Club d'accueil si le grimpeur est prêté, sinon `null` (R6). */
  clubAccueilNom: string | null
  /** Issue affichée, sans points (R8). */
  issueLibelle: string
  /** Horodatage de la coche (ISO) ; la ligne est contrôlée ssi non nul. */
  controleLe: string | null
  /** Nom court de l'admin auteur de la coche (R11) ; `null` si inconnu. */
  controlePar: string | null
}

/** Vrai si la ligne porte une coche de contrôle (`controle_le` renseigné). */
export function estControlee(ligne: LigneControle): boolean {
  return ligne.controleLe !== null
}

const comparer = new Intl.Collator('fr', { sensitivity: 'base' }).compare

/** Trie par nom puis prénom, ordre alphabétique français (R7). Sans mutation. */
export function trierLignes(lignes: readonly LigneControle[]): LigneControle[] {
  return [...lignes].sort((a, b) => comparer(a.nom, b.nom) || comparer(a.prenom, b.prenom))
}

/** Normalise pour la recherche : minuscules, sans accents, espaces réduits. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export type FiltresControle = {
  /** Texte recherché dans « nom prénom » ou « prénom nom ». */
  recherche: string
  /** Masque les lignes déjà cochées. */
  nonControleesSeulement: boolean
}

/**
 * Filtres d'affichage (R9) : recherche nom/prénom (casse et accents ignorés,
 * dans les deux ordres) et « non contrôlées seulement », cumulables.
 */
export function filtrerLignes(
  lignes: readonly LigneControle[],
  { recherche, nonControleesSeulement }: FiltresControle,
): LigneControle[] {
  const q = normaliser(recherche)
  return lignes.filter((l) => {
    if (nonControleesSeulement && estControlee(l)) return false
    if (!q) return true
    return (
      normaliser(`${l.nom} ${l.prenom}`).includes(q) ||
      normaliser(`${l.prenom} ${l.nom}`).includes(q)
    )
  })
}

/** Progression du contrôle : `controlees/total`, `complet` si `total > 0`. */
export type Progression = { controlees: number; total: number; complet: boolean }

/** Progression d'un support (R5) — `0/0` n'est jamais « complet ». */
export function progression(lignes: readonly LigneControle[]): Progression {
  const controlees = lignes.filter(estControlee).length
  const total = lignes.length
  return { controlees, total, complet: total > 0 && controlees === total }
}

/** Progression globale de la rencontre : somme des supports (R3). */
export function progressionGlobale(supports: readonly (readonly LigneControle[])[]): Progression {
  return progression(supports.flat())
}

/**
 * Nom court de l'admin auteur d'une coche, affiché sur la ligne (R11) : partie
 * de l'email avant « @ » (les comptes n'ont pas de nom). `null` si inconnu.
 */
export function nomCourtAuteur(email: string | null): string | null {
  if (!email) return null
  return email.split('@')[0] || null
}
