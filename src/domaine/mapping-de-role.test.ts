import { describe, it, expect } from 'vitest'
import {
  comptesPermanents,
  creerMappingDeRole,
  MappingDeRoleInvalideError,
  SuppressionCompteRefuseeError,
  verifierSuppressionCompte,
} from './mapping-de-role'

// Spec #2 « Authentification & sessions QR » — mapping de rôle (R1–R5).
// Domaine pur : valide et normalise l'attribution d'un rôle applicatif (+ club
// pour un coach) à un compte permanent, avant toute écriture Supabase. Reflète la
// contrainte SQL `chk_compte_role_club`. Aucune dépendance Supabase.

describe('spec #2 — Mapping de rôle (R1–R5)', () => {
  it('accepte un mapping admin sans club (R1, R3)', () => {
    // Un admin porte le rôle admin et n'a PAS de club (R3).
    expect(
      creerMappingDeRole({ utilisateurId: 'u-1', role: 'admin', clubId: null }),
    ).toEqual({ utilisateurId: 'u-1', role: 'admin', clubId: null })
  })

  it('accepte un mapping coach rattaché à un club (R1, R3)', () => {
    expect(
      creerMappingDeRole({
        utilisateurId: 'u-2',
        role: 'coach',
        clubId: 'club-a',
      }),
    ).toEqual({ utilisateurId: 'u-2', role: 'coach', clubId: 'club-a' })
  })

  it('force le club à null pour un admin même si un club est fourni (R3)', () => {
    // Un admin n'est rattaché à aucun club : on normalise à null.
    expect(
      creerMappingDeRole({
        utilisateurId: 'u-1',
        role: 'admin',
        clubId: 'club-a',
      }),
    ).toEqual({ utilisateurId: 'u-1', role: 'admin', clubId: null })
  })

  it('refuse un rôle hors admin/coach — un compte permanent ne peut être juge (R1, R2)', () => {
    expect(() =>
      creerMappingDeRole({ utilisateurId: 'u-3', role: 'juge' as never, clubId: null }),
    ).toThrow(MappingDeRoleInvalideError)
  })

  it('refuse un coach sans club — le club est obligatoire (R3)', () => {
    expect(() =>
      creerMappingDeRole({ utilisateurId: 'u-2', role: 'coach', clubId: null }),
    ).toThrow(MappingDeRoleInvalideError)
  })

  it('refuse un coach avec un club vide (R3)', () => {
    expect(() =>
      creerMappingDeRole({ utilisateurId: 'u-2', role: 'coach', clubId: '  ' }),
    ).toThrow(MappingDeRoleInvalideError)
  })

  it('refuse un mapping sans compte cible (R4)', () => {
    expect(() =>
      creerMappingDeRole({ utilisateurId: '', role: 'admin', clubId: null }),
    ).toThrow(MappingDeRoleInvalideError)
  })
})

// Spec #2 — suppression d'un compte permanent (R41–R46, rév. 2026-10-16).
describe('spec #2 — Suppression d’un compte permanent (R41–R46)', () => {
  const admin = { id: 'admin-1', role: 'admin' as const }

  it('l’admin peut supprimer un compte coach (R41)', () => {
    expect(verifierSuppressionCompte({ demandeur: admin, cibleId: 'coach-1' })).toBe('coach-1')
  })

  it('l’admin peut supprimer un autre admin ou un compte sans rôle (R41)', () => {
    expect(verifierSuppressionCompte({ demandeur: admin, cibleId: 'admin-2' })).toBe('admin-2')
    expect(verifierSuppressionCompte({ demandeur: admin, cibleId: 'sans-role' })).toBe('sans-role')
  })

  it('refuse la suppression de son propre compte (R41, R45)', () => {
    expect(() =>
      verifierSuppressionCompte({ demandeur: admin, cibleId: ' admin-1 ' }),
    ).toThrow(SuppressionCompteRefuseeError)
  })

  it('refuse une demande émanant d’un non-admin (R45)', () => {
    for (const role of ['coach', null] as const) {
      expect(() =>
        verifierSuppressionCompte({ demandeur: { id: 'x', role }, cibleId: 'coach-1' }),
      ).toThrow(SuppressionCompteRefuseeError)
    }
    expect(() =>
      verifierSuppressionCompte({ demandeur: null, cibleId: 'coach-1' }),
    ).toThrow(SuppressionCompteRefuseeError)
  })

  it('refuse une demande sans compte cible (R45)', () => {
    expect(() => verifierSuppressionCompte({ demandeur: admin, cibleId: '  ' })).toThrow(
      SuppressionCompteRefuseeError,
    )
  })

  it('ne liste que les comptes permanents, pas les comptes anonymes des sessions QR (R46)', () => {
    expect(
      comptesPermanents([
        { id: 'a', email: 'a@x.fr', is_anonymous: false },
        { id: 'q', email: undefined, is_anonymous: true },
        { id: 'b', email: 'b@x.fr' },
      ]),
    ).toEqual([
      { id: 'a', email: 'a@x.fr' },
      { id: 'b', email: 'b@x.fr' },
    ])
  })
})
