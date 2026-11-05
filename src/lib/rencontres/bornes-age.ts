import 'server-only'

import { BornesAgeNonConfigureesError, analyserBornesAge, type BornesAge } from '@/domaine/rencontre'

// Âges des catégories enfant/ado (spec #1 R34bis), lus dans les variables
// d'environnement serveur `AGE_BASCULE` et `AGE_ADO_MAX` : changer une valeur ne
// demande qu'un redéploiement, pas de relivraison du code.

/**
 * Âges configurés. Lève `BornesAgeNonConfigureesError` si une variable est
 * absente ou invalide (pas de valeur par défaut, R34bis).
 */
export function lireBornesAge(): BornesAge {
  return analyserBornesAge(process.env.AGE_BASCULE, process.env.AGE_ADO_MAX)
}

/**
 * Variante pour les Server Actions : les âges configurés, ou le message d'erreur
 * à renvoyer à l'utilisateur si une variable n'est pas configurée (R34bis).
 */
export function bornesAgeOuErreur(): { bornes: BornesAge } | { erreur: string } {
  try {
    return { bornes: lireBornesAge() }
  } catch (e) {
    if (e instanceof BornesAgeNonConfigureesError) return { erreur: e.message }
    throw e
  }
}
