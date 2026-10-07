import { verifierLecture } from '@/lib/supabase/lecture'

// Lecture paginée : l'API Supabase plafonne chaque réponse à `max_rows` lignes
// (1000, cf. supabase/config.toml). Une lecture qui peut dépasser ce plafond (le
// fichier des licenciés, par exemple) doit être lue page par page, sinon elle est
// TRONQUÉE sans erreur.

/** Taille d'une page (≤ `max_rows` de l'API). */
export const TAILLE_PAGE = 1000

/** Réponse minimale d'une lecture PostgREST. */
type ReponsePage<T> = { data: T[] | null; error: { message: string; code?: string } | null }

/**
 * Lit toutes les pages d'une requête. `page(debut, fin)` construit la requête
 * bornée par `.range(debut, fin)` ; elle doit porter un **ordre total** (ex. trier
 * en dernier par `id`) pour que les pages ne se chevauchent pas.
 */
export async function lireToutesLesPages<T>(
  page: (debut: number, fin: number) => PromiseLike<ReponsePage<T>>,
  quoi: string,
): Promise<T[]> {
  const tout: T[] = []
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const lignes = verifierLecture(await page(debut, debut + TAILLE_PAGE - 1), quoi) ?? []
    tout.push(...lignes)
    if (lignes.length < TAILLE_PAGE) return tout
  }
}
