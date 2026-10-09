import { describe, expect, it } from 'vitest'

import { MESSAGE_PLAFOND_VOIES_ADO } from '@/domaine/resultat'

import { classerRefus } from './refus-enregistrement'

// Spec #17 R17–R20 (et spec #6 R4, spec #10 R4) : un refus de la base est classé
// (définitif / session absente / temporaire) et traduit en message lisible.

describe('spec #17 — Classement des refus d’enregistrement (R17–R20)', () => {
  it('saisie plus récente existante : refus définitif (R9/R18)', () => {
    expect(classerRefus({ message: 'saisie_plus_ancienne', code: 'P0001' })).toEqual({
      nature: 'definitif',
      message: 'Une saisie plus récente existe déjà.',
    })
  })

  it('compétition clôturée : refus définitif avec le message de R20', () => {
    expect(classerRefus({ message: 'competition_cloturee', code: '42501' })).toEqual({
      nature: 'definitif',
      message:
        'La compétition est clôturée : cette saisie n’a pas été enregistrée. Signalez-la à l’organisateur.',
    })
  })

  it('session absente (coach ou juge) : reste en attente (R19)', () => {
    expect(classerRefus({ message: 'session_absente', code: '42501' }).nature).toBe('session')
    expect(classerRefus({ message: 'session_juge_absente', code: '42501' }).nature).toBe('session')
  })

  it('appel non authentifié (fonction refusée, jeton expiré) : session absente (R19)', () => {
    expect(
      classerRefus({ message: 'permission denied for function saisir_resultat_voie', code: '42501' })
        .nature,
    ).toBe('session')
    expect(classerRefus({ message: 'JWT expired', code: 'PGRST301' }).nature).toBe('session')
  })

  it('base injoignable depuis le serveur : échec temporaire (R17)', () => {
    expect(classerRefus({ message: 'TypeError: fetch failed', code: '' }).nature).toBe('temporaire')
  })

  it('périmètre, issue, plafond : refus définitifs lisibles (R18)', () => {
    expect(classerRefus({ message: 'hors_perimetre', code: '42501' })).toMatchObject({ nature: 'definitif' })
    expect(classerRefus({ message: 'issue_non_admise', code: '22023' })).toMatchObject({ nature: 'definitif' })
    expect(classerRefus({ message: 'plafond_voies_ado', code: '23514' })).toEqual({
      nature: 'definitif',
      message: MESSAGE_PLAFOND_VOIES_ADO,
    })
    expect(classerRefus({ message: 'grimpeur_non_engage', code: '23514' })).toEqual({
      nature: 'definitif',
      message: 'Ce grimpeur n’est pas engagé dans la rencontre.',
    })
  })

  it('erreur inconnue : refus définitif au message générique, jamais technique (R18)', () => {
    expect(classerRefus({ message: 'duplicate key value violates…', code: '23505' })).toEqual({
      nature: 'definitif',
      message: 'La saisie a échoué. Réessayez.',
    })
  })
})
