// Domaine pur — filtre par catégorie de la liste admin des grimpeurs (spec #3
// R26b). Traduit la catégorie choisie en bornes d'année de naissance pour la
// saison en cours (éligibilité spec #1 R34 / spec #20 R2), transmises à la RPC
// `rechercher_grimpeurs`. En ado, les surclassés de la saison sont aussi retenus
// (spec #21). Aucun accès Supabase ici.

import {
  CATEGORIES,
  bornesAnneeNaissance,
  type BornesAge,
  type Categorie,
} from './rencontre'

/** Filtre catégorie résolu (`null` = borne absente). */
export type FiltreCategorie = {
  categorie: Categorie
  anneeMin: number | null
  anneeMax: number | null
  /** Saison dont les surclassés actifs sont aussi retenus (ado seulement, R26b-2). */
  saisonSurclasses: number | null
}

/**
 * Résout la valeur brute du filtre (paramètre d'URL) pour la saison
 * `anneeSaison`. `null` = pas de filtre : valeur absente ou inconnue, ou âges
 * des catégories non configurés (R26b-4).
 */
export function filtreCategorieGrimpeurs(
  valeur: string | undefined,
  anneeSaison: number,
  bornes: BornesAge | null,
): FiltreCategorie | null {
  if (!bornes) return null
  const categorie = CATEGORIES.find((c) => c.value === valeur)?.value
  if (!categorie) return null
  const { min, max } = bornesAnneeNaissance(categorie, anneeSaison, bornes)
  return {
    categorie,
    anneeMin: min,
    anneeMax: max,
    saisonSurclasses: categorie === 'ado' ? anneeSaison : null,
  }
}

/**
 * Vrai si un grimpeur né en `anneeNaissance` (surclassé ou non pour la saison du
 * filtre) est retenu — sémantique reproduite par la RPC `rechercher_grimpeurs`.
 */
export function retenuParFiltre(
  anneeNaissance: number,
  surclasse: boolean,
  filtre: FiltreCategorie,
): boolean {
  const dansBornes =
    (filtre.anneeMin === null || anneeNaissance >= filtre.anneeMin) &&
    (filtre.anneeMax === null || anneeNaissance <= filtre.anneeMax)
  return dansBornes || (filtre.saisonSurclasses !== null && surclasse)
}
