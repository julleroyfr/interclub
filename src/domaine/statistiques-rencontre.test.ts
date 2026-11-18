import { describe, expect, it } from 'vitest'

import {
  avancementSaisie,
  bilanRencontre,
  clubsSansGroupe,
  effectifs,
  repartitionParGroupe,
  sectionsStatistiques,
  type ClubStat,
  type EnfantStat,
} from './statistiques-rencontre'

// Spec #3 R41e–R41j — statistiques du tableau de bord d'une rencontre enfant.
// Fonctions pures : les lectures (compositions, résultats, vitesse) sont faites
// par le chargeur ; un enfant prêté arrive déjà rattaché à son club d'accueil.

const clubs: ClubStat[] = [
  { id: 'tal', nom: 'Talence Escalade' },
  { id: 'bdx', nom: 'Bordeaux EC' },
  { id: 'mer', nom: 'Mérignac Grimpe' },
]

const enfants: EnfantStat[] = [
  { grimpeurId: 'a', clubId: 'bdx', sexe: 'F', groupeDepart: 'M1' },
  { grimpeurId: 'b', clubId: 'bdx', sexe: 'H', groupeDepart: 'M1' },
  { grimpeurId: 'c', clubId: 'bdx', sexe: 'H', groupeDepart: 'T2' },
  { grimpeurId: 'd', clubId: 'tal', sexe: 'F', groupeDepart: null },
  { grimpeurId: 'e', clubId: 'tal', sexe: null, groupeDepart: 'M3' },
  { grimpeurId: 'f', clubId: 'mer', sexe: 'H', groupeDepart: null },
  { grimpeurId: 'g', clubId: 'mer', sexe: 'F', groupeDepart: null },
]

describe('spec #3 — sections affichées selon la phase (R41e, R41h–R41j)', () => {
  it.each([
    ['pre_competition', false, false, false],
    ['preparation', false, false, false],
    ['competition', true, true, false],
    ['cloture', true, false, true],
    ['resultats_publics', true, false, true],
  ] as const)('%s ⇒ alerte %s, avancement %s, bilan %s', (phase, alerte, avancement, bilan) => {
    expect(sectionsStatistiques(phase)).toEqual({
      alerteSansGroupe: alerte,
      avancement,
      bilan,
    })
  })
})

describe('spec #3 — effectifs (R41f)', () => {
  it('compte le total, les filles, les garçons et les non renseignés', () => {
    const r = effectifs(enfants, clubs)
    expect(r.total).toEqual({ filles: 3, garcons: 3, nonRenseigne: 1, total: 7 })
  })

  it('détaille par club, triés par nom, clubs sans enfant exclus', () => {
    const r = effectifs(enfants, [...clubs, { id: 'vide', nom: 'Arcachon' }])
    expect(r.parClub).toEqual([
      { clubId: 'bdx', clubNom: 'Bordeaux EC', filles: 1, garcons: 2, nonRenseigne: 0, total: 3 },
      { clubId: 'mer', clubNom: 'Mérignac Grimpe', filles: 1, garcons: 1, nonRenseigne: 0, total: 2 },
      { clubId: 'tal', clubNom: 'Talence Escalade', filles: 1, garcons: 0, nonRenseigne: 1, total: 2 },
    ])
  })

  it('aucun enfant ⇒ totaux à zéro et aucun club', () => {
    expect(effectifs([], clubs)).toEqual({
      total: { filles: 0, garcons: 0, nonRenseigne: 0, total: 0 },
      parClub: [],
    })
  })
})

describe('spec #3 — répartition par groupe de départ (R41g)', () => {
  it('une ligne par groupe M1…T8 dans l’ordre, libellée « Groupe X/n », groupes vides à 0', () => {
    const r = repartitionParGroupe(enfants)
    expect(r.groupes).toHaveLength(12)
    expect(r.groupes[0]).toEqual({ groupe: 'M1', libelle: 'Groupe M1/1', nombre: 2 })
    expect(r.groupes[1]).toEqual({ groupe: 'M2', libelle: 'Groupe M2/2', nombre: 0 })
    expect(r.groupes[2]).toEqual({ groupe: 'M3', libelle: 'Groupe M3/3', nombre: 1 })
    expect(r.groupes[5]).toEqual({ groupe: 'T2', libelle: 'Groupe T2/6', nombre: 1 })
    expect(r.groupes[11]).toEqual({ groupe: 'T8', libelle: 'Groupe T8/12', nombre: 0 })
  })

  it('compte à part les enfants sans groupe (« À définir »)', () => {
    expect(repartitionParGroupe(enfants).aDefinir).toBe(3)
  })
})

describe('spec #3 — clubs avec des enfants sans groupe de départ (R41h)', () => {
  it('liste les clubs ayant au moins un enfant sans groupe, triés par nom', () => {
    expect(clubsSansGroupe(enfants, clubs)).toEqual([
      { clubId: 'mer', clubNom: 'Mérignac Grimpe', nombre: 2 },
      { clubId: 'tal', clubNom: 'Talence Escalade', nombre: 1 },
    ])
  })

  it('tous les enfants ont un groupe ⇒ liste vide', () => {
    expect(clubsSansGroupe(enfants.filter((e) => e.groupeDepart), clubs)).toEqual([])
  })
})

describe('spec #3 — avancement de la saisie en ③ (R41i)', () => {
  const resultatsVoie = [
    { grimpeurId: 'a', issue: 'top' },
    { grimpeurId: 'a', issue: 'np' },
    { grimpeurId: 'c', issue: 'echec' },
    { grimpeurId: 'e', issue: 'top' },
    // Grimpeur hors engagement : ignoré.
    { grimpeurId: 'z', issue: 'top' },
  ]
  const resultatsBloc = [
    { grimpeurId: 'a', issue: 'palier' },
    { grimpeurId: 'b', issue: 'echec' },
    { grimpeurId: 'f', issue: 'np' },
  ]
  const vitesses = [
    { grimpeurId: 'a', issue: 'temps' },
    { grimpeurId: 'd', issue: 'chute' },
  ] as const

  it('attendus : 3 voies par enfant AYANT un groupe, 1 par bloc et par enfant, 1 vitesse par enfant', () => {
    const r = avancementSaisie({
      enfants,
      clubs,
      nbBlocs: 2,
      avecVitesse: true,
      resultatsVoie,
      resultatsBloc,
      vitesses: [...vitesses],
    })
    expect(r.total).toEqual({
      voies: { saisis: 4, attendus: 12 },
      blocs: { saisis: 3, attendus: 14 },
      vitesse: { saisis: 2, attendus: 7 },
    })
  })

  it('détaille par club, triés par nom ; tout résultat compte comme saisi, NP compris', () => {
    const r = avancementSaisie({
      enfants,
      clubs,
      nbBlocs: 2,
      avecVitesse: true,
      resultatsVoie,
      resultatsBloc,
      vitesses: [...vitesses],
    })
    expect(r.parClub.map((c) => c.clubNom)).toEqual([
      'Bordeaux EC',
      'Mérignac Grimpe',
      'Talence Escalade',
    ])
    expect(r.parClub[0]).toEqual({
      clubId: 'bdx',
      clubNom: 'Bordeaux EC',
      voies: { saisis: 3, attendus: 9 },
      blocs: { saisis: 2, attendus: 6 },
      vitesse: { saisis: 1, attendus: 3 },
    })
    // Mérignac : deux enfants sans groupe ⇒ aucune voie attendue.
    expect(r.parClub[1].voies).toEqual({ saisis: 0, attendus: 0 })
    expect(r.parClub[1].blocs).toEqual({ saisis: 1, attendus: 4 })
  })

  it('sans voie de vitesse ⇒ aucune vitesse attendue', () => {
    const r = avancementSaisie({
      enfants,
      clubs,
      nbBlocs: 2,
      avecVitesse: false,
      resultatsVoie: [],
      resultatsBloc: [],
      vitesses: [],
    })
    expect(r.total.vitesse).toEqual({ saisis: 0, attendus: 0 })
  })
})

describe('spec #3 — bilan après la compétition (R41j)', () => {
  const entree = {
    enfants,
    clubs,
    avecVitesse: true,
    resultatsVoie: [
      { grimpeurId: 'a', issue: 'np' },
      { grimpeurId: 'a', issue: 'top' },
      { grimpeurId: 'b', issue: 'np' },
      { grimpeurId: 'e', issue: 'np' },
    ],
    resultatsBloc: [
      { grimpeurId: 'c', issue: 'np' },
      { grimpeurId: 'f', issue: 'np' },
      { grimpeurId: 'f', issue: 'palier' },
    ],
    vitesses: [
      { grimpeurId: 'a', issue: 'temps' },
      { grimpeurId: 'b', issue: 'non_presentation' },
      { grimpeurId: 'c', issue: 'chute' },
      { grimpeurId: 'd', issue: 'temps' },
      { grimpeurId: 'e', issue: 'non_presentation' },
    ],
  } as const

  it('compte les NP voies / blocs, les non-présentations et les vitesses non saisies', () => {
    const r = bilanRencontre({ ...entree, resultatsVoie: [...entree.resultatsVoie], resultatsBloc: [...entree.resultatsBloc], vitesses: [...entree.vitesses] })
    expect(r.total).toEqual({ npVoies: 3, npBlocs: 2, npVitesse: 2, vitesseNonSaisie: 2 })
    expect(r.parClub).toEqual([
      { clubId: 'bdx', clubNom: 'Bordeaux EC', npVoies: 2, npBlocs: 1, npVitesse: 1, vitesseNonSaisie: 0 },
      { clubId: 'mer', clubNom: 'Mérignac Grimpe', npVoies: 0, npBlocs: 1, npVitesse: 0, vitesseNonSaisie: 2 },
      { clubId: 'tal', clubNom: 'Talence Escalade', npVoies: 1, npBlocs: 0, npVitesse: 1, vitesseNonSaisie: 0 },
    ])
  })

  it('sans voie de vitesse ⇒ aucune vitesse non saisie', () => {
    const r = bilanRencontre({ ...entree, avecVitesse: false, resultatsVoie: [], resultatsBloc: [], vitesses: [] })
    expect(r.total.vitesseNonSaisie).toBe(0)
  })
})
