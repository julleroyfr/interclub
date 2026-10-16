import { describe, it, expect } from 'vitest'
import {
  REPERE_VOIE_MAX,
  RepereVoieInvalideError,
  libellesVoies,
  normaliserRepereVoie,
  repereModifiable,
  trierVoiesStructure,
} from './voie'

// Spec #3 « Écrans de paramétrage » — repère (R49) et libellé d'affichage (R50)
// d'une voie de difficulté de rencontre. Domaine pur : la normalisation est
// rejouée par la Server Action ; la base garantit la borne (check) et l'unicité
// par niveau (index unique partiel, R49c — vérifiée au cahier de test).

const voie = (id: string, niveau: string, ordre: number, repere: string | null = null) => ({
  id,
  niveau,
  ordre,
  repere,
})

describe('spec #3 — Repère de voie (R49)', () => {
  it('normalise les espaces de bord et internes (R49a, R4)', () => {
    expect(normaliserRepereVoie('  Relais   12 ')).toBe('Relais 12')
  })

  it('une saisie vide ou blanche signifie « pas de repère » (R49a)', () => {
    expect(normaliserRepereVoie('')).toBeNull()
    expect(normaliserRepereVoie('   ')).toBeNull()
    expect(normaliserRepereVoie(null)).toBeNull()
    expect(normaliserRepereVoie(undefined)).toBeNull()
  })

  it('accepte un repère à la longueur maximale (R49b)', () => {
    const repere = 'x'.repeat(REPERE_VOIE_MAX)
    expect(normaliserRepereVoie(repere)).toBe(repere)
  })

  it('refuse un repère de plus de 30 caractères (R49b)', () => {
    expect(REPERE_VOIE_MAX).toBe(30)
    expect(() => normaliserRepereVoie('x'.repeat(REPERE_VOIE_MAX + 1))).toThrow(
      RepereVoieInvalideError,
    )
  })

  it('est modifiable de la pré-compétition à la compétition, figé ensuite (R49d)', () => {
    expect(repereModifiable('pre_competition')).toBe(true)
    expect(repereModifiable('preparation')).toBe(true)
    expect(repereModifiable('competition')).toBe(true)
    expect(repereModifiable('cloture')).toBe(false)
    expect(repereModifiable('resultats_publics')).toBe(false)
  })
})

describe('spec #3 — Libellé d’une voie (R50)', () => {
  it('voie avec repère → niveau + repère (R50a)', () => {
    const l = libellesVoies([voie('a', 'T5', 1, 'Jaune'), voie('b', 'T6', 2, 'Relais 12')])
    expect(l.get('a')).toBe('T5 Jaune')
    expect(l.get('b')).toBe('T6 Relais 12')
  })

  it('niveau unique sans repère → niveau seul (R50c)', () => {
    const l = libellesVoies([voie('a', 'T5', 1), voie('b', 'T7', 2)])
    expect(l.get('a')).toBe('T5')
    expect(l.get('b')).toBe('T7')
  })

  it('niveau doublé sans repère → lettre selon l’ordre (R50b)', () => {
    const l = libellesVoies([voie('a', 'T5', 5), voie('b', 'T5', 6), voie('c', 'T6', 7)])
    expect(l.get('a')).toBe('T5 a')
    expect(l.get('b')).toBe('T5 b')
    expect(l.get('c')).toBe('T6')
  })

  it('la lettre suit l’ordre, pas la position dans la liste reçue (R50b)', () => {
    const l = libellesVoies([voie('b', 'T5', 9), voie('a', 'T5', 3), voie('c', 'T5', 6)])
    expect(l.get('a')).toBe('T5 a')
    expect(l.get('c')).toBe('T5 b')
    expect(l.get('b')).toBe('T5 c')
  })

  it('la lettre compte aussi les voies repérées : elle ne bouge pas quand un repère est posé ailleurs (R50b)', () => {
    const avant = libellesVoies([voie('a', 'T5', 5), voie('b', 'T5', 6)])
    const apres = libellesVoies([voie('a', 'T5', 5, 'Jaune'), voie('b', 'T5', 6)])
    expect(avant.get('b')).toBe('T5 b')
    expect(apres.get('a')).toBe('T5 Jaune')
    expect(apres.get('b')).toBe('T5 b')
  })

  it('au-delà de 26 voies d’un niveau, le rang est affiché en chiffres (R50b)', () => {
    const voies = Array.from({ length: 27 }, (_, i) => voie(`v${i}`, 'T5', i + 1))
    const l = libellesVoies(voies)
    expect(l.get('v0')).toBe('T5 a')
    expect(l.get('v25')).toBe('T5 z')
    expect(l.get('v26')).toBe('T5 27')
  })

  it('liste vide → aucun libellé', () => {
    expect(libellesVoies([]).size).toBe(0)
  })
})

describe('spec #3 — Tri des voies de la structure (R42, rév. 2026-10-16)', () => {
  const v = (niveau: string, libelle: string) => ({ niveau, libelle })

  it('trie par niveau : moulinette M1→M4 puis tête T1→T10 (ordre numérique)', () => {
    const tries = trierVoiesStructure([
      v('T10', 'T10'),
      v('T2', 'T2'),
      v('M3', 'M3'),
      v('T1', 'T1'),
      v('M1', 'M1'),
    ])
    expect(tries.map((x) => x.niveau)).toEqual(['M1', 'M3', 'T1', 'T2', 'T10'])
  })

  it('au sein d’un niveau, trie par libellé : alphabétique, casse ignorée, nombres naturels', () => {
    const tries = trierVoiesStructure([
      v('T5', 'T5 Relais 12'),
      v('T6', 'T6 a'),
      v('T5', 'T5 Jaune'),
      v('T5', 'T5 Relais 2'),
      v('T5', 'T5 c'),
    ])
    expect(tries.map((x) => x.libelle)).toEqual([
      'T5 c',
      'T5 Jaune',
      'T5 Relais 2',
      'T5 Relais 12',
      'T6 a',
    ])
  })

  it('ne modifie pas la liste reçue', () => {
    const voies = [v('T2', 'T2'), v('T1', 'T1')]
    trierVoiesStructure(voies)
    expect(voies.map((x) => x.niveau)).toEqual(['T2', 'T1'])
  })
})
