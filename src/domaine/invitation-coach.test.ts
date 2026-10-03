// Tests du domaine pur — invitation coach permanent (spec #2 R26–R33).
//
// Périmètre pur (sans Supabase) : format de l'URL encodée dans le QR (R26),
// validation du périmètre « un club » (R28), matrice « qui peut gérer » (R29),
// et validation des identifiants d'inscription (R30). La création effective du
// compte + mapping (R31), l'unicité active par club (R28) et le refus des
// doublons (R32) relèvent de la base réelle → cahier de test.

import { describe, expect, it } from 'vitest'

import {
  InvitationCoachInvalideError,
  construireUrlInvitation,
  creerInvitationCoach,
  peutGererInvitation,
  validerInscriptionCoach,
  messageEchecCreationCompte,
} from './invitation-coach'

// ---------------------------------------------------------------------------
// construireUrlInvitation — format de l'URL encodée dans le QR (R26)
// ---------------------------------------------------------------------------
describe('construireUrlInvitation', () => {
  it("construit une URL d'inscription correcte (R26)", () => {
    expect(construireUrlInvitation('https://app.example.com', 'abc-123')).toBe(
      'https://app.example.com/inscription?invitation=abc-123',
    )
  })

  it('supprime le slash final de la base (R26)', () => {
    expect(construireUrlInvitation('https://app.example.com/', 'abc-123')).toBe(
      'https://app.example.com/inscription?invitation=abc-123',
    )
  })

  it('lève une erreur si baseUrl est vide', () => {
    expect(() => construireUrlInvitation('', 'abc-123')).toThrow(
      InvitationCoachInvalideError,
    )
  })

  it('lève une erreur si valeur est vide', () => {
    expect(() => construireUrlInvitation('https://app.example.com', '')).toThrow(
      InvitationCoachInvalideError,
    )
  })
})

// ---------------------------------------------------------------------------
// creerInvitationCoach — périmètre « exactement un club » (R28)
// ---------------------------------------------------------------------------
describe('creerInvitationCoach', () => {
  it('normalise une invitation liée à un club (R28)', () => {
    expect(creerInvitationCoach({ clubId: ' club-1 ' })).toEqual({
      clubId: 'club-1',
    })
  })

  it('refuse une invitation sans club (R28)', () => {
    expect(() => creerInvitationCoach({ clubId: '' })).toThrow(
      InvitationCoachInvalideError,
    )
  })
})

// ---------------------------------------------------------------------------
// peutGererInvitation — génération / révocation réservées à l'admin (R29)
// ---------------------------------------------------------------------------
describe('peutGererInvitation', () => {
  it("autorise l'admin (R29)", () => {
    expect(peutGererInvitation({ role: 'admin' })).toBe(true)
  })

  it('refuse un coach permanent (R29)', () => {
    expect(peutGererInvitation({ role: 'coach' })).toBe(false)
  })

  it('refuse un acteur sans rôle (R5, R29)', () => {
    expect(peutGererInvitation({ role: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validerInscriptionCoach — identifiants email + mot de passe (R30)
// ---------------------------------------------------------------------------
describe('validerInscriptionCoach', () => {
  it('normalise un email valide et un mot de passe suffisant (R30)', () => {
    expect(
      validerInscriptionCoach({
        email: '  Coach@Example.com ',
        motDePasse: 'motdepasse',
      }),
    ).toEqual({ email: 'coach@example.com', motDePasse: 'motdepasse' })
  })

  it('refuse un email vide (R30)', () => {
    expect(() =>
      validerInscriptionCoach({ email: '  ', motDePasse: 'motdepasse' }),
    ).toThrow(InvitationCoachInvalideError)
  })

  it('refuse un email sans @ (R30)', () => {
    expect(() =>
      validerInscriptionCoach({ email: 'pasunemail', motDePasse: 'motdepasse' }),
    ).toThrow(InvitationCoachInvalideError)
  })

  it('refuse un mot de passe trop court (R30)', () => {
    expect(() =>
      validerInscriptionCoach({ email: 'coach@example.com', motDePasse: '123' }),
    ).toThrow(InvitationCoachInvalideError)
  })
})

/**
 * Message d'échec de création du compte à l'inscription (spec #2 R32 ; revue du
 * 2026-10-03, constat m6) : seul un e-mail DÉJÀ UTILISÉ donne le message R32
 * (« connectez-vous ») ; les autres refus de l'API Auth ont leur propre message.
 */
describe('messageEchecCreationCompte (spec #2 R32)', () => {
  it('e-mail déjà associé à un compte → refus invitant à se connecter (R32)', () => {
    for (const code of ['email_exists', 'user_already_exists']) {
      expect(messageEchecCreationCompte(code)).toMatch(/existe déjà.*Connectez-vous/)
    }
  })

  it('mot de passe refusé → message sur le mot de passe, pas sur l’e-mail', () => {
    const message = messageEchecCreationCompte('weak_password')
    expect(message).toMatch(/mot de passe/i)
    expect(message).not.toMatch(/existe déjà/)
  })

  it('e-mail invalide → message sur l’adresse e-mail', () => {
    expect(messageEchecCreationCompte('email_address_invalid')).toMatch(/adresse e-mail/i)
  })

  it('autre erreur ou code absent → échec générique, sans prétendre que le compte existe', () => {
    for (const code of [undefined, 'over_request_rate_limit', 'unexpected_failure']) {
      const message = messageEchecCreationCompte(code)
      expect(message).toMatch(/L’inscription a échoué|L'inscription a échoué/)
      expect(message).not.toMatch(/existe déjà/)
    }
  })
})
