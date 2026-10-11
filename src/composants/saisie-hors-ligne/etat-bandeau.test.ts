import { describe, expect, it } from 'vitest'

import { etatBandeau } from './etat-bandeau'

// Spec #17 R24 (rév. 2026-10-09), R25, R26 : quel bandeau afficher.

const base = { enLigne: true, nbEnAttente: 0, nbRejetees: 0, sessionAbsente: false, envoiLong: false }

describe('spec #17 — Bandeau de synchronisation (R24, rév. 2026-10-09)', () => {
  it('en ligne, envoi de moins de 2 s : aucun bandeau', () => {
    expect(etatBandeau({ ...base, nbEnAttente: 1 })).toBeNull()
  })

  it('en ligne, envoi de plus de 2 s : « envoi en cours »', () => {
    expect(etatBandeau({ ...base, nbEnAttente: 1, envoiLong: true })).toBe('envoi')
  })

  it('hors ligne : immédiat, avec ou sans saisie en attente', () => {
    expect(etatBandeau({ ...base, enLigne: false })).toBe('hors_ligne')
    expect(etatBandeau({ ...base, enLigne: false, nbEnAttente: 2 })).toBe('hors_ligne')
  })

  it('session absente avec des saisies en attente : immédiat (R25)', () => {
    expect(etatBandeau({ ...base, nbEnAttente: 1, sessionAbsente: true })).toBe('session')
  })

  it('saisie rejetée, rien en attente : immédiat (R26)', () => {
    expect(etatBandeau({ ...base, nbRejetees: 1 })).toBe('rejet')
  })

  it('rejet pendant un envoi court : le rejet reste signalé', () => {
    expect(etatBandeau({ ...base, nbEnAttente: 1, nbRejetees: 1 })).toBe('rejet')
  })

  it('rien à signaler : aucun bandeau', () => {
    expect(etatBandeau(base)).toBeNull()
  })
})
