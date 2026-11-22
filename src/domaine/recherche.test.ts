import { describe, expect, it } from 'vitest'
import { filtrerGrimpeursRecherche } from './recherche'

// Recherche nom/prénom partagée : spec #5 R12bis (ajout en équipe, prêt),
// spec #7 R12b (classement), spec #9 R10 (saisie admin), spec #10 R14b (juge
// vitesse) — rév. 2026-11-22.
describe('Recherche nom/prénom (spec #5 R12bis, #7 R12b, #9 R10, #10 R14b)', () => {
  const roster = [
    { id: '1', prenom: 'Ana', nom: 'Alpha' },
    { id: '2', prenom: 'Éléonore', nom: 'Dupré' },
    { id: '3', prenom: 'Bob', nom: 'Alpha' },
    { id: '4', prenom: 'Cléo', nom: 'Bravo' },
  ]
  const ids = (q: string) => filtrerGrimpeursRecherche(roster, q).map((g) => g.id)

  it('une recherche vide (ou blanche) propose tout le roster', () => {
    expect(ids('')).toEqual(['1', '2', '3', '4'])
    expect(ids('   ')).toEqual(['1', '2', '3', '4'])
  })

  it('filtre sur le nom ou le prénom, insensible à la casse', () => {
    expect(ids('ALPHA')).toEqual(['1', '3'])
    expect(ids('bob')).toEqual(['3'])
  })

  it('est insensible aux accents, dans les deux sens', () => {
    expect(ids('eleonore')).toEqual(['2'])
    expect(ids('dupré')).toEqual(['2'])
    expect(ids('cleo')).toEqual(['4'])
    expect(ids('clêo')).toEqual(['4'])
  })

  it('exige chaque terme, dans n’importe quel ordre', () => {
    expect(ids('ana alp')).toEqual(['1'])
    expect(ids('alpha ANA')).toEqual(['1'])
    expect(ids('bravo cleo')).toEqual(['4'])
    expect(ids('ana dupre')).toEqual([])
  })

  it('préserve l’ordre et renvoie les objets d’origine', () => {
    expect(filtrerGrimpeursRecherche(roster, 'a')[0]).toBe(roster[0])
  })
})
