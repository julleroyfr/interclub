import { describe, expect, it } from 'vitest'

import { liensAdmin } from './navigation'

/**
 * Bandeau de l'espace admin (spec #12 R1/R19 ; vocabulaire spec #2 R47).
 * Fonction pure : testable sans Supabase.
 */
describe('liensAdmin', () => {
  it('expose la gestion des QR sous « QR codes » (spec #2 R47)', () => {
    expect(liensAdmin()).toContainEqual({ href: '/admin/jetons', label: 'QR codes' })
  })

  it('aucun libellé n\'emploie le mot « jeton » (spec #2 R47)', () => {
    expect(liensAdmin().some((l) => /jeton/i.test(l.label))).toBe(false)
  })
})
