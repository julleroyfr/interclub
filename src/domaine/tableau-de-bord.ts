import type { Categorie } from './rencontre'

/**
 * Onglets du tableau de bord d'une rencontre (spec #3 R41k), dans l'ordre
 * d'affichage. La valeur est celle du paramètre d'URL `?onglet=`.
 */
export const ONGLETS = ['vue', 'structure', 'equipes', 'prets', 'statistiques'] as const

export type Onglet = (typeof ONGLETS)[number]

export const ONGLET_PAR_DEFAUT: Onglet = 'vue'

/**
 * Onglets présents pour une rencontre de cette catégorie (R41k) : pas de Prêts
 * en adulte (spec #20 R11), Statistiques seulement en enfant (R41e).
 */
export function ongletsDisponibles(categorie: Categorie): Onglet[] {
  return ONGLETS.filter((o) => {
    if (o === 'prets') return categorie !== 'adulte'
    if (o === 'statistiques') return categorie === 'enfant'
    return true
  })
}

/**
 * Onglet à afficher depuis le paramètre d'URL (R41k) : un onglet inconnu ou
 * absent pour cette rencontre retombe sur la Vue d'ensemble.
 */
export function resoudreOnglet(
  parametre: string | string[] | null | undefined,
  categorie: Categorie,
): Onglet {
  const valeur = Array.isArray(parametre) ? parametre[0] : parametre
  return ongletsDisponibles(categorie).find((o) => o === valeur) ?? ONGLET_PAR_DEFAUT
}
