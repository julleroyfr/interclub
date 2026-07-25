// Tests du domaine pur — sessions QR éphémères (spec #2 R6–R14, R22–R25 ;
// ADR 0001).

import { describe, expect, it } from 'vitest'

import {
  SessionQrInvalideError,
  construireUrlScan,
  interpreterResultatScan,
  urlDeRedirection,
} from './session-qr'

// ---------------------------------------------------------------------------
// construireUrlScan — format de l'URL encodée dans le QR (ADR 0003/T5d)
// ---------------------------------------------------------------------------
describe('construireUrlScan', () => {
  it('construit une URL de scan correcte (R6, ADR 0003)', () => {
    expect(construireUrlScan('https://app.example.com', 'abc-123')).toBe(
      'https://app.example.com/scan?jeton=abc-123',
    )
  })

  it('supprime le slash final de la base (R6)', () => {
    expect(construireUrlScan('https://app.example.com/', 'abc-123')).toBe(
      'https://app.example.com/scan?jeton=abc-123',
    )
  })

  it('lève une erreur si baseUrl est vide', () => {
    expect(() => construireUrlScan('', 'abc-123')).toThrow(SessionQrInvalideError)
  })

  it('lève une erreur si valeur est vide', () => {
    expect(() => construireUrlScan('https://app.example.com', '')).toThrow(
      SessionQrInvalideError,
    )
  })
})

// ---------------------------------------------------------------------------
// interpreterResultatScan — parsing du résultat JSONB de la RPC `ouvrir_session_qr`
// ---------------------------------------------------------------------------
describe('interpreterResultatScan', () => {
  it('interprète un résultat coach_temporaire (R6, R9a, R10)', () => {
    const data = {
      nature: 'coach_temporaire',
      club_id: 'club-1',
      voie_vitesse_id: null,
      rencontre_id: 'rencontre-1',
    }
    expect(interpreterResultatScan(data)).toEqual({
      nature: 'coach_temporaire',
      clubId: 'club-1',
      voieVitesseId: null,
      rencontreId: 'rencontre-1',
    })
  })

  it('interprète un résultat juge (R6, R9b, R11)', () => {
    const data = {
      nature: 'juge',
      club_id: null,
      voie_vitesse_id: 'voie-1',
      rencontre_id: 'rencontre-1',
    }
    expect(interpreterResultatScan(data)).toEqual({
      nature: 'juge',
      clubId: null,
      voieVitesseId: 'voie-1',
      rencontreId: 'rencontre-1',
    })
  })

  it('lève une erreur si le résultat est null (R12, R22)', () => {
    expect(() => interpreterResultatScan(null)).toThrow(SessionQrInvalideError)
  })

  it('lève une erreur si la nature est inconnue (R9)', () => {
    expect(() =>
      interpreterResultatScan({ nature: 'inconnu', club_id: null, voie_vitesse_id: null, rencontre_id: 'r1' }),
    ).toThrow(SessionQrInvalideError)
  })

  it('lève une erreur si rencontre_id est absent', () => {
    expect(() =>
      interpreterResultatScan({ nature: 'juge', club_id: null, voie_vitesse_id: 'v1' }),
    ).toThrow(SessionQrInvalideError)
  })
})

// ---------------------------------------------------------------------------
// urlDeRedirection — chemin cible après ouverture de session (R10, R11)
// ---------------------------------------------------------------------------
describe('urlDeRedirection', () => {
  it('redirige un coach temporaire vers /coach (R10)', () => {
    expect(urlDeRedirection('coach_temporaire')).toBe('/coach')
  })

  it('redirige un juge vers /juge (R11)', () => {
    expect(urlDeRedirection('juge')).toBe('/juge')
  })
})
