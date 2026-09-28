// Domaine pur — écran d'affichage secondaire, classement individuel en boucle
// (spec #14). Aucune dépendance Supabase : fusionne pour l'affichage les deux
// classements individuels déjà calculés par sexe (spec #7 R8b), sans recalculer
// aucun score ni rang — le rang de chaque ligne reste celui de son classement
// de sexe (R4/R5). Générique sur `T` : s'applique aussi bien aux lignes du
// domaine (`Rang<GrimpeurClassable>`) qu'à celles déjà assemblées par le loader
// (`LigneIndividuel`, spec #7), pourvu qu'elles portent `rang`, `nom`, `prenom`.

import type { Sexe } from './grimpeur'
import { parNomPuisPrenom } from './score'

/** Une ligne du classement mixte affiché : la ligne d'origine, taguée de son sexe (R6). */
export type LigneClassementMixte<T> = T & { sexe: Sexe }

/**
 * Fusionne les classements individuels Filles et Garçons (spec #7) en une seule
 * liste mixte pour l'écran d'affichage (R4), triée par **rang croissant**, puis,
 * à rang égal entre les deux classements, par **nom** puis **prénom** (R5). Les
 * rangs affichés restent ceux calculés séparément par sexe — aucun rang global
 * n'est recalculé. Chaque ligne renvoyée porte son **sexe** d'origine (`F`/`H`),
 * nécessaire à l'étiquette de l'écran d'affichage (R6). Fonction pure — les
 * tableaux d'entrée ne sont pas mutés.
 */
export function classementMixte<T extends { rang: number; nom: string; prenom: string }>(
  filles: readonly T[],
  garcons: readonly T[],
): LigneClassementMixte<T>[] {
  const marquees: LigneClassementMixte<T>[] = [
    ...filles.map((ligne) => ({ ...ligne, sexe: 'F' as const })),
    ...garcons.map((ligne) => ({ ...ligne, sexe: 'H' as const })),
  ]
  return marquees.sort((a, b) => a.rang - b.rang || parNomPuisPrenom(a, b))
}
