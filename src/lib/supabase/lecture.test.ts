import { describe, expect, it } from 'vitest'

import { LectureImpossibleError, verifierLecture } from './lecture'

/**
 * Vérification des lectures Supabase (convention 02 §7 : les erreurs
 * `{ data, error }` sont toujours vérifiées, jamais avalées). Revue du
 * 2026-10-03, constats M5/M6 : une lecture en échec était traitée comme « aucune
 * donnée » (classement officiel faux, NP de clôture non posé, sans alerte).
 * Fonction pure : testée sur des réponses `{ data, error }` littérales.
 */
describe('verifierLecture', () => {
  it('renvoie les données d’une lecture réussie', () => {
    const lignes = [{ id: 'a' }, { id: 'b' }]
    expect(verifierLecture({ data: lignes, error: null }, 'des équipes')).toBe(lignes)
  })

  it('renvoie null pour une ligne absente (maybeSingle) : absence ≠ échec', () => {
    expect(verifierLecture({ data: null, error: null }, 'de la rencontre')).toBeNull()
  })

  it('lève LectureImpossibleError en cas d’erreur, sans renvoyer de données', () => {
    const appel = () =>
      verifierLecture(
        { data: null, error: { message: 'permission denied for table points_vitesse', code: '42501' } },
        'des points de vitesse',
      )
    expect(appel).toThrow(LectureImpossibleError)
    expect(appel).toThrow(
      'Lecture impossible (des points de vitesse) : permission denied for table points_vitesse',
    )
  })

  it('conserve le code Postgres de l’erreur pour le diagnostic', () => {
    try {
      verifierLecture({ data: null, error: { message: 'x', code: '42501' } }, 'des blocs')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LectureImpossibleError)
      expect((e as LectureImpossibleError).code).toBe('42501')
    }
  })
})
