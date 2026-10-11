// Tests du domaine pur — invitation administrateur (spec #2 R35–R40, rév.
// 2026-10-09).

import { describe, expect, it } from 'vitest'

import {
  DUREE_INVITATION_ADMIN_MINUTES,
  InvitationAdminInvalideError,
  construireUrlInvitationAdmin,
  etatInvitationAdmin,
  formaterTempsRestant,
  peutGererInvitationAdmin,
  secondesRestantes,
} from './invitation-admin'

const GENEREE = new Date('2026-10-09T10:00:00Z')
const EXPIRE = new Date('2026-10-09T10:15:00Z')

const invitation = (surcharges: Partial<Parameters<typeof etatInvitationAdmin>[0]> = {}) => ({
  actif: true,
  expireLe: EXPIRE,
  utiliseeLe: null,
  ...surcharges,
})

describe('spec #2 — invitation administrateur : durée de validité (R36)', () => {
  it('vaut 15 minutes', () => {
    expect(DUREE_INVITATION_ADMIN_MINUTES).toBe(15)
  })
})

describe('spec #2 — construireUrlInvitationAdmin (R35)', () => {
  it("construit l'URL d'inscription administrateur", () => {
    expect(construireUrlInvitationAdmin('https://app.example.com/', 'abc-123')).toBe(
      'https://app.example.com/inscription?invitation_admin=abc-123',
    )
  })

  it('refuse une base ou une valeur vide', () => {
    expect(() => construireUrlInvitationAdmin(' ', 'abc')).toThrow(InvitationAdminInvalideError)
    expect(() => construireUrlInvitationAdmin('https://app.example.com', ' ')).toThrow(
      InvitationAdminInvalideError,
    )
  })
})

describe('spec #2 — etatInvitationAdmin (R36, R37, R40)', () => {
  it('valable avant son expiration, non utilisée, non révoquée (R36)', () => {
    expect(etatInvitationAdmin(invitation(), new Date('2026-10-09T10:14:59Z'))).toBe('valable')
  })

  it("expirée à l'instant d'expiration et au-delà (R36)", () => {
    expect(etatInvitationAdmin(invitation(), EXPIRE)).toBe('expiree')
    expect(etatInvitationAdmin(invitation(), new Date('2026-10-09T11:00:00Z'))).toBe('expiree')
  })

  it('utilisée dès sa première inscription réussie, même avant expiration (R36)', () => {
    const utilisee = invitation({ utiliseeLe: new Date('2026-10-09T10:05:00Z') })
    expect(etatInvitationAdmin(utilisee, new Date('2026-10-09T10:06:00Z'))).toBe('utilisee')
    expect(etatInvitationAdmin(utilisee, new Date('2026-10-09T11:00:00Z'))).toBe('utilisee')
  })

  it('révoquée (ou remplacée par une nouvelle) si inactive et non utilisée (R37)', () => {
    expect(etatInvitationAdmin(invitation({ actif: false }), GENEREE)).toBe('revoquee')
  })
})

describe('spec #2 — temps restant (R40)', () => {
  it('compte les secondes restantes, jamais négatives', () => {
    expect(secondesRestantes(EXPIRE, GENEREE)).toBe(900)
    expect(secondesRestantes(EXPIRE, new Date('2026-10-09T10:14:59.400Z'))).toBe(0)
    expect(secondesRestantes(EXPIRE, new Date('2026-10-09T10:20:00Z'))).toBe(0)
  })

  it('formate en minutes:secondes', () => {
    expect(formaterTempsRestant(900)).toBe('15:00')
    expect(formaterTempsRestant(65)).toBe('1:05')
    expect(formaterTempsRestant(0)).toBe('0:00')
  })
})

describe('spec #2 — peutGererInvitationAdmin (R35)', () => {
  it("autorise l'admin seul", () => {
    expect(peutGererInvitationAdmin({ role: 'admin' })).toBe(true)
    expect(peutGererInvitationAdmin({ role: 'coach' })).toBe(false)
    expect(peutGererInvitationAdmin({ role: null })).toBe(false)
  })
})
