import { describe, expect, it } from 'vitest'

import { grimpeursDuClassement } from './grimpeurs-affiches'

// Spec #11 R8bis (rév. 2026-11-10) : un écran de classement ne se relit que pour
// une écriture concernant un grimpeur composé dans la rencontre.

const ligne = (grimpeurId: string) => ({ grimpeurId })

describe('grimpeursDuClassement', () => {
  it('réunit les grimpeurs des classements filles et garçons', () => {
    expect(
      grimpeursDuClassement({ filles: [ligne('f1'), ligne('f2')], garcons: [ligne('g1')] }),
    ).toEqual(['f1', 'f2', 'g1'])
  })

  it('classement vide : aucun grimpeur', () => {
    expect(grimpeursDuClassement({ filles: [], garcons: [] })).toEqual([])
  })
})
