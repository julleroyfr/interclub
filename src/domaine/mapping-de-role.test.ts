import { describe, it, expect } from 'vitest'
import {
  creerMappingDeRole,
  MappingDeRoleInvalideError,
} from './mapping-de-role'

// Spec #2 « Authentification & sessions QR » — mapping de rôle (R1–R5).
// Domaine pur : valide et normalise l'attribution d'un rôle applicatif (+ club
// pour un coach) à un compte permanent, avant toute écriture Supabase. Reflète la
// contrainte SQL `chk_compte_role_club`. Aucune dépendance Supabase.

describe('Mapping de rôle (R1–R5)', () => {
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
