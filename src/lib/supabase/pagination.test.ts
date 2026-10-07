import { describe, expect, it } from 'vitest'

import { LectureImpossibleError } from './lecture'
import { lireToutesLesPages, TAILLE_PAGE } from './pagination'

// Lecture paginée (plafond `max_rows` de l'API, convention 02 §7) : aucune ligne
// perdue au-delà d'une page, et un échec n'est jamais confondu avec « fin ».

/** Source simulée de `n` lignes, servie par `.range(debut, fin)`. */
function source(n: number) {
  const lignes = Array.from({ length: n }, (_, i) => i)
  const appels: [number, number][] = []
  const page = async (debut: number, fin: number) => {
    appels.push([debut, fin])
    return { data: lignes.slice(debut, fin + 1), error: null }
  }
  return { page, appels }
}

describe('Lecture paginée au-delà du plafond de l’API', () => {
  it('lit une seule page quand tout tient dedans', async () => {
    const { page, appels } = source(12)
    expect(await lireToutesLesPages(page, 'des tests')).toHaveLength(12)
    expect(appels).toEqual([[0, TAILLE_PAGE - 1]])
  })

  it('enchaîne les pages sans perte au-delà du plafond', async () => {
    const { page, appels } = source(2 * TAILLE_PAGE + 5)
    const lu = await lireToutesLesPages(page, 'des tests')
    expect(lu).toHaveLength(2 * TAILLE_PAGE + 5)
    expect(lu.at(-1)).toBe(2 * TAILLE_PAGE + 4)
    expect(appels).toHaveLength(3)
  })

  it('demande une page de plus quand le total est un multiple exact du plafond', async () => {
    const { page, appels } = source(TAILLE_PAGE)
    expect(await lireToutesLesPages(page, 'des tests')).toHaveLength(TAILLE_PAGE)
    expect(appels).toHaveLength(2)
  })

  it('lève une erreur de lecture au lieu de renvoyer une liste partielle', async () => {
    const page = async () => ({ data: null, error: { message: 'refus' } })
    await expect(lireToutesLesPages(page, 'des tests')).rejects.toBeInstanceOf(
      LectureImpossibleError,
    )
  })
})
