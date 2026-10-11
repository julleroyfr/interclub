// Vérification des lectures Supabase (convention 02 §7) : toute réponse
// `{ data, error }` est vérifiée. Une lecture en ÉCHEC n'est jamais confondue
// avec « aucune donnée » — c'était la cause d'un classement officiel faux (grant
// manquant, migration 202610021100) et d'un NP de clôture silencieusement non
// posé (revue du 2026-10-03, M5/M6). Erreur TECHNIQUE : elle est levée, pas
// modélisée comme une erreur métier.

/** Forme minimale d'une réponse Supabase (PostgREST ou Auth). */
type ReponseLecture = {
  data: unknown
  error: { message: string; code?: string } | null
}

/** Une lecture Supabase a échoué (réseau, droit manquant, requête invalide). */
export class LectureImpossibleError extends Error {
  readonly code: string | undefined

  constructor(quoi: string, message: string, code?: string) {
    super(`Lecture impossible (${quoi}) : ${message}`)
    this.name = 'LectureImpossibleError'
    this.code = code
  }
}

/**
 * Renvoie les données d'une lecture réussie, ou lève `LectureImpossibleError`.
 * `quoi` nomme ce qui était lu (« des équipes ») pour le diagnostic. Une ligne
 * absente (`maybeSingle` → `data: null` sans erreur) n'est PAS un échec.
 */
export function verifierLecture<R extends ReponseLecture>(reponse: R, quoi: string): R['data'] {
  if (reponse.error) {
    throw new LectureImpossibleError(quoi, reponse.error.message, reponse.error.code)
  }
  return reponse.data
}
