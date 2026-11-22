import { describe, expect, it } from 'vitest'

import {
  DUREE_LIEN_REINITIALISATION_S,
  MESSAGE_DEMANDE_ENVOYEE,
  ReinitialisationInvalideError,
  destinationSelonRole,
  estSessionDeReinitialisation,
  validerDemandeReinitialisation,
  validerNouveauMotDePasse,
} from './reinitialisation-mot-de-passe'

describe('spec #2 — demande de réinitialisation (R48, R49)', () => {
  it('normalise l’adresse (espaces, casse)', () => {
    expect(validerDemandeReinitialisation('  Coach@Test.Local ')).toBe('coach@test.local')
  })

  it('refuse une adresse vide ou mal formée, sans envoi (R49)', () => {
    expect(() => validerDemandeReinitialisation('')).toThrow(ReinitialisationInvalideError)
    expect(() => validerDemandeReinitialisation('   ')).toThrow('Renseignez votre e-mail.')
    expect(() => validerDemandeReinitialisation('pas-une-adresse')).toThrow(
      "L'e-mail n'est pas valide.",
    )
  })

  it('le message de confirmation ne dit pas si le compte existe (R49)', () => {
    expect(MESSAGE_DEMANDE_ENVOYEE).toBe(
      'Si un compte existe pour cette adresse, un e-mail vient de lui être envoyé.',
    )
  })
})

describe('spec #2 — nouveau mot de passe (R51)', () => {
  it('accepte un mot de passe d’au moins 6 caractères saisi deux fois', () => {
    expect(validerNouveauMotDePasse({ motDePasse: 'abcdef', confirmation: 'abcdef' })).toBe(
      'abcdef',
    )
  })

  it('refuse moins de 6 caractères', () => {
    expect(() => validerNouveauMotDePasse({ motDePasse: 'abcde', confirmation: 'abcde' })).toThrow(
      'Le mot de passe doit contenir au moins 6 caractères.',
    )
  })

  it('refuse deux saisies différentes', () => {
    expect(() =>
      validerNouveauMotDePasse({ motDePasse: 'abcdef', confirmation: 'abcdeg' }),
    ).toThrow('Les deux mots de passe ne correspondent pas.')
  })

  it('arrive dans l’espace du rôle, comme après une connexion (R51, R5)', () => {
    expect(destinationSelonRole('admin')).toBe('/admin')
    expect(destinationSelonRole('coach')).toBe('/coach')
    expect(destinationSelonRole(null)).toBe('/')
    expect(destinationSelonRole(undefined)).toBe('/')
  })
})

describe('spec #2 — écran réservé au lien reçu par e-mail (R50, R53)', () => {
  const maintenant = 1_800_000_000

  it('le lien vaut 1 heure (R50)', () => {
    expect(DUREE_LIEN_REINITIALISATION_S).toBe(3600)
  })

  it('accepte une session ouverte par le lien e-mail il y a moins d’une heure', () => {
    expect(estSessionDeReinitialisation([{ method: 'otp', timestamp: maintenant - 60 }], maintenant))
      .toBe(true)
    expect(
      estSessionDeReinitialisation([{ method: 'otp', timestamp: maintenant - 3600 }], maintenant),
    ).toBe(true)
  })

  it('refuse une session de lien vieille de plus d’une heure', () => {
    expect(
      estSessionDeReinitialisation([{ method: 'otp', timestamp: maintenant - 3601 }], maintenant),
    ).toBe(false)
  })

  it('refuse une session ordinaire, une session QR ou l’absence de session', () => {
    expect(
      estSessionDeReinitialisation([{ method: 'password', timestamp: maintenant }], maintenant),
    ).toBe(false)
    expect(
      estSessionDeReinitialisation([{ method: 'anonymous', timestamp: maintenant }], maintenant),
    ).toBe(false)
    expect(estSessionDeReinitialisation([], maintenant)).toBe(false)
    expect(estSessionDeReinitialisation(undefined, maintenant)).toBe(false)
  })
})
