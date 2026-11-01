import { describe, expect, it } from 'vitest'

import {
  construireRapport,
  dateExecution,
  ligneLog,
  trancheAge,
  verifierSecret,
  type DonneesRapport,
} from './rapport'

const VIDE: DonneesRapport = { clubs: [], grimpeurs: [], rencontres: [], equipes: [] }

describe('verifierSecret — garde du déclencheur', () => {
  it('accepte l’en-tête Bearer portant le secret configuré (R4)', () => {
    expect(verifierSecret('Bearer s3cr3t-tres-long', 's3cr3t-tres-long')).toBe('ok')
  })

  it('refuse un appel sans en-tête (R4)', () => {
    expect(verifierSecret(null, 's3cr3t-tres-long')).toBe('refuse')
  })

  it('refuse un mauvais secret, même de même longueur (R4)', () => {
    expect(verifierSecret('Bearer s3cr3t-tres-lonG', 's3cr3t-tres-long')).toBe('refuse')
    expect(verifierSecret('Bearer autre', 's3cr3t-tres-long')).toBe('refuse')
  })

  it('refuse un secret transmis sans le préfixe Bearer (R4)', () => {
    expect(verifierSecret('s3cr3t-tres-long', 's3cr3t-tres-long')).toBe('refuse')
  })

  it('signale un secret non configuré, quel que soit l’en-tête (R5)', () => {
    expect(verifierSecret('Bearer ', undefined)).toBe('non_configure')
    expect(verifierSecret('Bearer x', '')).toBe('non_configure')
    expect(verifierSecret(null, undefined)).toBe('non_configure')
  })
})

describe('trancheAge — âge en saison (R7)', () => {
  it('classe enfant jusqu’à 12 ans, pivot à 13, ado de 14 à 19, adulte dès 20 (R7, spec #20 R33)', () => {
    expect(trancheAge(2020, 2026)).toBe('enfant')
    expect(trancheAge(2014, 2026)).toBe('enfant')
    expect(trancheAge(2013, 2026)).toBe('pivot')
    expect(trancheAge(2012, 2026)).toBe('ado')
    expect(trancheAge(2007, 2026)).toBe('ado')
    expect(trancheAge(2006, 2026)).toBe('adulte')
    expect(trancheAge(1980, 2026)).toBe('adulte')
  })
})

describe('dateExecution — fuseau Europe/Paris (Vocabulaire)', () => {
  it('rend la date du jour à Paris, même quand UTC est encore la veille', () => {
    expect(dateExecution(new Date('2026-10-16T06:00:00Z'))).toBe('2026-10-16')
    expect(dateExecution(new Date('2026-10-15T22:30:00Z'))).toBe('2026-10-16')
  })
})

describe('construireRapport', () => {
  const donnees: DonneesRapport = {
    clubs: [
      { id: 'c-z', nom: 'Zénith Escalade' },
      { id: 'c-a', nom: 'ASM Grimpe' },
      { id: 'c-e', nom: 'Écureuils' },
    ],
    grimpeurs: [
      { club_id: 'c-a', annee_naissance: 2015 }, // enfant (11)
      { club_id: 'c-a', annee_naissance: 2013 }, // pivot
      { club_id: 'c-a', annee_naissance: 2010 }, // ado (16)
      { club_id: 'c-z', annee_naissance: 2012 }, // ado (14)
      { club_id: 'c-z', annee_naissance: 2000 }, // adulte (spec #20 R33)
    ],
    rencontres: [
      { id: 'r-avant', date_rencontre: '2026-08-31', categorie: 'enfant', phase: 'resultats_publics', club_porteur_id: 'c-a' },
      { id: 'r-ado', date_rencontre: '2026-11-07', categorie: 'ado', phase: 'pre_competition', club_porteur_id: 'c-z' },
      { id: 'r-enf', date_rencontre: '2026-11-07', categorie: 'enfant', phase: 'pre_competition', club_porteur_id: 'c-z' },
      { id: 'r-debut', date_rencontre: '2026-09-01', categorie: 'enfant', phase: 'cloture', club_porteur_id: 'c-a' },
      { id: 'r-fin', date_rencontre: '2027-08-31', categorie: 'ado', phase: 'pre_competition', club_porteur_id: 'c-e' },
      { id: 'r-apres', date_rencontre: '2027-09-01', categorie: 'ado', phase: 'pre_competition', club_porteur_id: 'c-e' },
    ],
    equipes: [{ rencontre_id: 'r-enf' }, { rencontre_id: 'r-enf' }, { rencontre_id: 'r-ado' }, { rencontre_id: 'r-avant' }],
  }
  const rapport = construireRapport(donnees, '2026-10-16')

  it('porte la date d’exécution et la saison courante (R6)', () => {
    expect(rapport.dateExecution).toBe('2026-10-16')
    expect(rapport.saison).toBe(2026)
    expect(rapport.libelleSaison).toBe('2026–2027')
  })

  it('compte les clubs (R8)', () => {
    expect(rapport.nombreClubs).toBe(3)
  })

  it('détaille chaque club par tranche, trié par nom sans tenir compte des accents ; club vide à 0 (R9)', () => {
    expect(rapport.clubs).toEqual([
      { nom: 'ASM Grimpe', enfant: 1, pivot: 1, ado: 1, adulte: 0, total: 3 },
      { nom: 'Écureuils', enfant: 0, pivot: 0, ado: 0, adulte: 0, total: 0 },
      { nom: 'Zénith Escalade', enfant: 0, pivot: 0, ado: 1, adulte: 1, total: 2 },
    ])
  })

  it('donne les totaux tous clubs, total général = somme des clubs (R10)', () => {
    expect(rapport.totaux).toEqual({ enfant: 1, pivot: 1, ado: 2, adulte: 1, total: 5 })
    expect(rapport.clubs.reduce((s, c) => s + c.total, 0)).toBe(rapport.totaux.total)
  })

  it('ne liste que les rencontres de la saison, bornes incluses, avec porteur et équipes (R11)', () => {
    expect(rapport.rencontres.map((r) => r.date)).not.toContain('2026-08-31')
    expect(rapport.rencontres.map((r) => r.date)).not.toContain('2027-09-01')
    expect(rapport.rencontres).toContainEqual({
      date: '2026-11-07',
      clubPorteur: 'Zénith Escalade',
      categorie: 'enfant',
      phase: 'pre_competition',
      equipes: 2,
    })
    expect(rapport.rencontres.find((r) => r.date === '2027-08-31')?.equipes).toBe(0)
  })

  it('trie les rencontres par date puis enfant avant ado (R12)', () => {
    expect(rapport.rencontres.map((r) => `${r.date} ${r.categorie}`)).toEqual([
      '2026-09-01 enfant',
      '2026-11-07 enfant',
      '2026-11-07 ado',
      '2027-08-31 ado',
    ])
  })

  it('compte les rencontres de la saison par catégorie (R13)', () => {
    expect(rapport.nombreRencontres).toEqual({ enfant: 2, ado: 2, adulte: 0, total: 4 })
  })

  it('trie et compte aussi les rencontres adultes, après l’ado (spec #20 R33)', () => {
    const avecAdulte = construireRapport(
      {
        ...VIDE,
        rencontres: [
          { id: 'a', date_rencontre: '2026-11-07', categorie: 'adulte', phase: 'pre_competition', club_porteur_id: 'x' },
          { id: 'b', date_rencontre: '2026-11-07', categorie: 'ado', phase: 'pre_competition', club_porteur_id: 'x' },
          { id: 'c', date_rencontre: '2026-11-07', categorie: 'enfant', phase: 'pre_competition', club_porteur_id: 'x' },
        ],
      },
      '2027-03-10',
    )
    expect(avecAdulte.rencontres.map((r) => r.categorie)).toEqual(['enfant', 'ado', 'adulte'])
    expect(avecAdulte.nombreRencontres).toEqual({ enfant: 1, ado: 1, adulte: 1, total: 3 })
  })

  it('produit un rapport à zéro sur une base vide (cas limite)', () => {
    const vide = construireRapport(VIDE, '2027-03-10')
    expect(vide.saison).toBe(2026)
    expect(vide.nombreClubs).toBe(0)
    expect(vide.totaux).toEqual({ enfant: 0, pivot: 0, ado: 0, adulte: 0, total: 0 })
    expect(vide.nombreRencontres).toEqual({ enfant: 0, ado: 0, adulte: 0, total: 0 })
  })
})

describe('ligneLog (R14)', () => {
  it('préfixe la ligne par [rapport-periodique] suivi du contenu complet', () => {
    const rapport = construireRapport(VIDE, '2026-10-16')
    const ligne = ligneLog(rapport)
    expect(ligne.startsWith('[rapport-periodique] ')).toBe(true)
    expect(JSON.parse(ligne.slice('[rapport-periodique] '.length))).toEqual(rapport)
    expect(ligne).not.toContain('\n')
  })
})
