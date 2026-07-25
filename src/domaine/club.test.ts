import { describe, it, expect } from 'vitest'
import { normaliserNomClub, NomClubInvalideError, NOM_CLUB_MAX } from './club'

// Spec #1 « Rôles & autorisations » — CRUD club réservé à l'admin (R11).
// Domaine pur : valide et normalise le nom d'un club avant toute écriture
// Supabase (la table `club.nom` est `text not null unique`). Aucune dépendance
// Supabase ici — uniquement les invariants de saisie.

describe('Nom de club (R11)', () => {
  it('normalise un nom valide en retirant les espaces de bord', () => {
    expect(normaliserNomClub('  Club A  ')).toBe('Club A')
  })

  it('réduit les espaces internes multiples à un seul', () => {
    expect(normaliserNomClub('Club   Alpha')).toBe('Club Alpha')
  })

  it('rejette un nom vide', () => {
    expect(() => normaliserNomClub('')).toThrow(NomClubInvalideError)
  })

  it('rejette un nom composé uniquement d’espaces', () => {
    expect(() => normaliserNomClub('   ')).toThrow(NomClubInvalideError)
  })

  it('accepte un nom à la longueur maximale', () => {
    const nom = 'x'.repeat(NOM_CLUB_MAX)
    expect(normaliserNomClub(nom)).toBe(nom)
  })

  it('rejette un nom dépassant la longueur maximale', () => {
    expect(() => normaliserNomClub('x'.repeat(NOM_CLUB_MAX + 1))).toThrow(
      NomClubInvalideError,
    )
  })
})
