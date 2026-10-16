// Domaine pur — repère (R49) et libellé d'affichage (R50) d'une voie de
// difficulté de rencontre (spec #3). Le repère désigne la voie au mur (relais,
// couleur…) ; le libellé distingue les voies doublées d'un même niveau. La base
// garantit en dernier ressort la borne (check) et l'unicité (index unique
// partiel `(epreuve_id, niveau, lower(repere))`).

import { NIVEAUX_MOULINETTE, NIVEAUX_TETE } from './gabarit'
import type { Phase } from './rencontre'

/** Longueur maximale d'un repère de voie (R49b). */
export const REPERE_VOIE_MAX = 30

/** Repère de voie invalide (trop long). */
export class RepereVoieInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RepereVoieInvalideError'
  }
}

/**
 * Normalise un repère (R49a, R4) : espaces de bord retirés, espaces internes
 * réduits à un seul. Vide après normalisation → `null` (« pas de repère »).
 * Rejette un repère de plus de `REPERE_VOIE_MAX` caractères (R49b).
 */
export function normaliserRepereVoie(brut: string | null | undefined): string | null {
  const normalise = (brut ?? '').trim().replace(/\s+/g, ' ')
  if (!normalise) return null
  if (normalise.length > REPERE_VOIE_MAX) {
    throw new RepereVoieInvalideError(
      `Le repère ne peut dépasser ${REPERE_VOIE_MAX} caractères.`,
    )
  }
  return normalise
}

/** Phases où le repère peut être saisi ou modifié : ① à ③ (R49d). */
const PHASES_REPERE_MODIFIABLE: Phase[] = ['pre_competition', 'preparation', 'competition']

/** Vrai si le repère d'une voie est modifiable dans `phase` (R49d). */
export function repereModifiable(phase: Phase): boolean {
  return PHASES_REPERE_MODIFIABLE.includes(phase)
}

/** Lettre du rang (0 → « a ») ; au-delà de 26, le rang en chiffres (R50b). */
function lettreRang(index: number): string {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1)
}

/**
 * Libellé d'affichage de chaque voie d'une épreuve, par id (R50) :
 * - avec repère → « <niveau> <repère> » (a) ;
 * - sans repère, niveau doublé → « <niveau> <lettre> », lettre = rang parmi
 *   TOUTES les voies du niveau triées par `ordre` (b) ;
 * - sans repère, niveau unique → « <niveau> » (c).
 * `voies` doit couvrir toute l'épreuve (les rangs en dépendent).
 */
export function libellesVoies(
  voies: { id: string; niveau: string; ordre: number; repere: string | null }[],
): Map<string, string> {
  const parNiveau = new Map<string, typeof voies>()
  for (const v of voies) {
    const groupe = parNiveau.get(v.niveau) ?? []
    groupe.push(v)
    parNiveau.set(v.niveau, groupe)
  }

  const libelles = new Map<string, string>()
  for (const [niveau, groupe] of parNiveau) {
    const tries = [...groupe].sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id))
    tries.forEach((v, index) => {
      if (v.repere) libelles.set(v.id, `${niveau} ${v.repere}`)
      else if (tries.length > 1) libelles.set(v.id, `${niveau} ${lettreRang(index)}`)
      else libelles.set(v.id, niveau)
    })
  }
  return libelles
}

/** Rang d'un niveau : M1→M4 puis T1→T10 ; un niveau inconnu passe en fin. */
const RANG_NIVEAU = new Map<string, number>(
  [...NIVEAUX_MOULINETTE, ...NIVEAUX_TETE].map((n, i) => [n, i]),
)

const comparerLibelle = new Intl.Collator('fr', { sensitivity: 'base', numeric: true }).compare

/**
 * Voies de la structure d'une rencontre triées pour l'affichage (R42, rév.
 * 2026-10-16) : par niveau (M1→M4 puis T1→T10), puis par libellé (R50) —
 * alphabétique, casse ignorée, nombres naturels. Renvoie une nouvelle liste.
 */
export function trierVoiesStructure<T extends { niveau: string; libelle: string }>(
  voies: T[],
): T[] {
  const rang = (n: string) => RANG_NIVEAU.get(n) ?? Number.MAX_SAFE_INTEGER
  return [...voies].sort(
    (a, b) => rang(a.niveau) - rang(b.niveau) || comparerLibelle(a.libelle, b.libelle),
  )
}
