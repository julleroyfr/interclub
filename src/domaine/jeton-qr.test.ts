import { describe, it, expect } from 'vitest'
import {
  creerJetonQr,
  peutGererJeton,
  revoquerJeton,
  regenererJeton,
  JetonQrInvalideError,
} from './jeton-qr'

// Spec #2 « Authentification & sessions QR » — jetons QR (R9, R15–R23).
// Domaine pur : nature/périmètre d'un jeton, matrice « qui peut générer/révoquer »,
// révocation et régénération. Aucune dépendance Supabase (la valeur/`actif` en base
// et les policies RLS sont testées ailleurs : migration + cahier).

describe('Création & périmètre d’un jeton (R9, R17)', () => {
  it('accepte un jeton coach temporaire = un club, sans voie (R9a)', () => {
    expect(
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'coach_temporaire',
        clubId: 'club-a',
        voieVitesseId: null,
      }),
    ).toEqual({
      rencontreId: 'r-1',
      nature: 'coach_temporaire',
      clubId: 'club-a',
      voieVitesseId: null,
    })
  })

  it('accepte un jeton juge = une voie de vitesse, sans club (R9b, R17)', () => {
    expect(
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'juge',
        clubId: null,
        voieVitesseId: 'voie-1',
      }),
    ).toEqual({
      rencontreId: 'r-1',
      nature: 'juge',
      clubId: null,
      voieVitesseId: 'voie-1',
    })
  })

  it('refuse un coach temporaire sans club (R9a)', () => {
    expect(() =>
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'coach_temporaire',
        clubId: null,
        voieVitesseId: null,
      }),
    ).toThrow(JetonQrInvalideError)
  })

  it('refuse un coach temporaire portant une voie (R9a)', () => {
    expect(() =>
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'coach_temporaire',
        clubId: 'club-a',
        voieVitesseId: 'voie-1',
      }),
    ).toThrow(JetonQrInvalideError)
  })

  it('refuse un juge sans voie (R9b)', () => {
    expect(() =>
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'juge',
        clubId: null,
        voieVitesseId: null,
      }),
    ).toThrow(JetonQrInvalideError)
  })

  it('refuse un juge portant un club (R9b)', () => {
    expect(() =>
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'juge',
        clubId: 'club-a',
        voieVitesseId: 'voie-1',
      }),
    ).toThrow(JetonQrInvalideError)
  })

  it('refuse un jeton sans rencontre', () => {
    expect(() =>
      creerJetonQr({
        rencontreId: '',
        nature: 'juge',
        clubId: null,
        voieVitesseId: 'voie-1',
      }),
    ).toThrow(JetonQrInvalideError)
  })

  it('refuse une nature inconnue', () => {
    expect(() =>
      creerJetonQr({
        rencontreId: 'r-1',
        nature: 'visiteur' as never,
        clubId: null,
        voieVitesseId: null,
      }),
    ).toThrow(JetonQrInvalideError)
  })
})

describe('Qui peut générer/révoquer un jeton (R15, R16, R20, R21)', () => {
  const jetonCoachA = { nature: 'coach_temporaire' as const, clubId: 'club-a' }
  const jetonCoachB = { nature: 'coach_temporaire' as const, clubId: 'club-b' }
  const jetonJuge = { nature: 'juge' as const, clubId: null }

  it('admin peut gérer tout jeton (R15, R20)', () => {
    const admin = { role: 'admin' as const, clubId: null }
    expect(peutGererJeton(admin, jetonCoachA)).toBe(true)
    expect(peutGererJeton(admin, jetonCoachB)).toBe(true)
    expect(peutGererJeton(admin, jetonJuge)).toBe(true)
  })

  it('coach permanent peut gérer le jeton coach temporaire de SON club (R16, R21)', () => {
    const coachA = { role: 'coach' as const, clubId: 'club-a' }
    expect(peutGererJeton(coachA, jetonCoachA)).toBe(true)
  })

  it('coach permanent NE peut PAS gérer le jeton d’un autre club (R16 ; négatif)', () => {
    const coachA = { role: 'coach' as const, clubId: 'club-a' }
    expect(peutGererJeton(coachA, jetonCoachB)).toBe(false)
  })

  it('coach permanent NE peut PAS gérer un jeton juge (R17 ; négatif)', () => {
    const coachA = { role: 'coach' as const, clubId: 'club-a' }
    expect(peutGererJeton(coachA, jetonJuge)).toBe(false)
  })

  it('un compte sans rôle ne peut rien gérer (R5 fail-closed ; négatif)', () => {
    const sansRole = { role: null, clubId: null }
    expect(peutGererJeton(sansRole, jetonCoachA)).toBe(false)
    expect(peutGererJeton(sansRole, jetonJuge)).toBe(false)
  })
})

describe('Révocation (R22) & régénération (R23)', () => {
  const jeton = {
    rencontreId: 'r-1',
    nature: 'juge' as const,
    clubId: null,
    voieVitesseId: 'voie-1',
    valeur: 'val-ancienne',
    actif: true,
  }

  it('révoquer rend le jeton inactif (R22)', () => {
    expect(revoquerJeton(jeton)).toEqual({ ...jeton, actif: false })
  })

  it('régénérer produit un nouveau jeton actif et révoque l’ancien (R23)', () => {
    const { ancien, nouveau } = regenererJeton(jeton, 'val-nouvelle')
    // L'ancien est révoqué (R22 s'applique à l'ancien).
    expect(ancien).toEqual({ ...jeton, actif: false })
    // Le nouveau garde le même périmètre, une valeur DISTINCTE, et est actif.
    expect(nouveau).toEqual({
      rencontreId: 'r-1',
      nature: 'juge',
      clubId: null,
      voieVitesseId: 'voie-1',
      valeur: 'val-nouvelle',
      actif: true,
    })
    expect(nouveau.valeur).not.toBe(ancien.valeur)
  })

  it('refuse une régénération avec la même valeur — le nouveau doit être distinct (R23)', () => {
    expect(() => regenererJeton(jeton, 'val-ancienne')).toThrow(
      JetonQrInvalideError,
    )
  })
})
