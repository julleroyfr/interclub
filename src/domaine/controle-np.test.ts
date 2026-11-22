import { describe, expect, it } from 'vitest'

import {
  apercuCloture,
  controleNp,
  elementsFiche,
  lignesNpParClub,
  nomFichierNp,
  signalNp,
  transitionAConfirmer,
  type BlocNp,
  type EntreeControleNp,
  type FicheNp,
  type GrimpeurNp,
  type VoieNp,
} from './controle-np'

// Spec #3 R17bis (confirmation de la clôture) et R41l–R41s (contrôle des NP).
// Fonctions pures : le chargeur lit compositions, structure et résultats ; un
// grimpeur prêté arrive déjà rattaché à son club d'accueil.

const blocs: BlocNp[] = [
  { id: 'b2', code: 'B2', ordre: 2 },
  { id: 'b1', code: 'B1', ordre: 1 },
]

const voies: VoieNp[] = [
  { id: 'm1', niveau: 'M1', libelle: 'M1', cotation: '4c', ordre: 1 },
  { id: 'm2a', niveau: 'M2', libelle: 'M2 Noire', cotation: '5a', ordre: 2 },
  { id: 'm2b', niveau: 'M2', libelle: 'M2 Jaune', cotation: '5a', ordre: 3 },
  { id: 'm3', niveau: 'M3', libelle: 'M3', cotation: '5b', ordre: 4 },
  { id: 'm4', niveau: 'M4', libelle: 'M4', cotation: '5c', ordre: 5 },
]

const g = (id: string, nom: string, clubNom: string, groupeDepart: string | null, equipeNom = 'Équipe 1'): GrimpeurNp => ({
  grimpeurId: id,
  nom,
  prenom: 'P',
  clubId: clubNom.toLowerCase(),
  clubNom,
  equipeNom,
  groupeDepart,
})

function entreeEnfant(partiel: Partial<EntreeControleNp> = {}): EntreeControleNp {
  return {
    categorie: 'enfant',
    avecVitesse: true,
    blocs,
    voies,
    grimpeurs: [],
    resultatsVoie: [],
    resultatsBloc: [],
    vitesses: [],
    ...partiel,
  }
}

/** Fiche complète d'un enfant M1 tout saisi, à décliner dans les tests de signal. */
const ficheEnfantComplete = (): FicheNp => ({
  blocs: [
    { code: 'B1', issue: 'echec', palier: null },
    { code: 'B2', issue: 'palier', palier: '1er essai' },
  ],
  voies: [
    { niveau: 'M1', libelle: 'M1', cotation: '4c', issue: 'top' },
    { niveau: 'M2', libelle: 'M2 Noire', cotation: '5a', issue: 'echec' },
    { niveau: 'M3', libelle: 'M3', cotation: '5b', issue: 'top' },
  ],
  nbVoies: 3,
  vitesse: { etat: 'temps', temps: 21.37 },
})

const np = { issue: 'np' as const }

describe('spec #3 — confirmation avant la clôture (R17bis a, e)', () => {
  it('③ → ④ demande une confirmation (R17bis a)', () => {
    expect(transitionAConfirmer('competition', 'cloture')).toBe(true)
  })

  it.each([
    ['pre_competition', 'preparation'],
    ['preparation', 'competition'],
    ['competition', 'preparation'],
    ['competition', 'pre_competition'],
    ['cloture', 'competition'],
    ['cloture', 'resultats_publics'],
    ['resultats_publics', 'cloture'],
  ] as const)('%s → %s reste sans confirmation (R17bis e)', (de, vers) => {
    expect(transitionAConfirmer(de, vers)).toBe(false)
  })
})

describe('spec #3 — aperçu chiffré de la clôture (R17bis c)', () => {
  it('enfant : NP de voie = niveaux du groupe sans aucun résultat, NP de bloc = blocs sans résultat', () => {
    const r = apercuCloture(
      entreeEnfant({
        grimpeurs: [g('a', 'A', 'Bordeaux', 'M2'), g('b', 'B', 'Bordeaux', 'M1')],
        // a (M2, M3, M4) : un résultat sur M2 (voie Jaune) ⇒ M3, M4 manquants.
        // b (M1, M2, M3) : rien ⇒ 3 manquants.
        resultatsVoie: [{ grimpeurId: 'a', voieId: 'm2b', issue: 'top' }],
        resultatsBloc: [{ grimpeurId: 'a', blocId: 'b1', issue: 'echec', palier: null }],
        vitesses: [{ grimpeurId: 'a', issue: 'temps', temps: 20 }],
      }),
    )
    expect(r.total).toEqual({ voies: 5, blocs: 3, vitessesNonSaisies: 1 })
    expect(r.parClub).toEqual([{ clubId: 'bordeaux', clubNom: 'Bordeaux', voies: 5, blocs: 3, vitessesNonSaisies: 1 }])
  })

  it('enfant : un niveau sans voie dans la structure ne compte pas (spec #6 R18)', () => {
    const r = apercuCloture(entreeEnfant({ voies: voies.filter((v) => v.niveau !== 'M4'), grimpeurs: [g('a', 'A', 'Bdx', 'M2')] }))
    expect(r.total.voies).toBe(2)
  })

  it('enfant : un enfant sans groupe ne donne aucun NP de voie', () => {
    const r = apercuCloture(entreeEnfant({ grimpeurs: [g('a', 'A', 'Bdx', null)] }))
    expect(r.total.voies).toBe(0)
    expect(r.total.blocs).toBe(2)
  })

  it('ado/adulte : voies manquantes = 6 − n par grimpeur', () => {
    const r = apercuCloture({
      ...entreeEnfant(),
      categorie: 'ado',
      grimpeurs: [g('a', 'A', 'Bdx', null), g('b', 'B', 'Bdx', null)],
      resultatsVoie: [
        { grimpeurId: 'a', voieId: 'm1', issue: 'top' },
        { grimpeurId: 'a', voieId: 'm2a', issue: 'zone1' },
      ],
    })
    expect(r.total.voies).toBe(4 + 6)
  })

  it('sans épreuve de vitesse : aucune vitesse non saisie (épreuve absente ignorée)', () => {
    const r = apercuCloture(entreeEnfant({ avecVitesse: false, grimpeurs: [g('a', 'A', 'Bdx', 'M1')] }))
    expect(r.total.vitessesNonSaisies).toBe(0)
  })

  it('clubs sans manque exclus, triés par nom ; aucun manque ⇒ liste vide', () => {
    const complet = (id: string) => [
      { grimpeurId: id, voieId: 'm1', issue: 'top' },
      { grimpeurId: id, voieId: 'm2a', issue: 'top' },
      { grimpeurId: id, voieId: 'm3', issue: 'top' },
    ]
    const r = apercuCloture(
      entreeEnfant({
        grimpeurs: [g('a', 'A', 'Talence', 'M1'), g('b', 'B', 'Arcachon', 'M1'), g('c', 'C', 'Mérignac', 'M1')],
        resultatsVoie: [...complet('a'), ...complet('b'), ...complet('c')],
        resultatsBloc: ['a', 'b', 'c'].flatMap((id) => [
          { grimpeurId: id, blocId: 'b1', issue: 'echec', palier: null },
          { grimpeurId: id, blocId: 'b2', issue: 'echec', palier: null },
        ]),
        vitesses: [
          { grimpeurId: 'a', issue: 'temps', temps: 1 },
          { grimpeurId: 'b', issue: 'chute', temps: null },
        ],
      }),
    )
    expect(r.parClub.map((c) => c.clubNom)).toEqual(['Mérignac'])
    const vide = apercuCloture(entreeEnfant({ avecVitesse: false }))
    expect(vide.parClub).toEqual([])
    expect(vide.total).toEqual({ voies: 0, blocs: 0, vitessesNonSaisies: 0 })
  })
})

describe('spec #3 — sections du contrôle des NP, enfant (R41l, R41m, R41n)', () => {
  const grimpeurs = [g('a', 'ZOLA', 'Talence', 'M2'), g('b', 'ARNAUD', 'Bordeaux', 'M1'), g('c', 'BRUN', 'Bordeaux', 'M1')]
  const entree = entreeEnfant({
    grimpeurs,
    resultatsVoie: [
      { grimpeurId: 'a', voieId: 'm2a', ...np },
      { grimpeurId: 'a', voieId: 'm3', issue: 'top' },
      { grimpeurId: 'a', voieId: 'm4', ...np },
      { grimpeurId: 'b', voieId: 'm1', issue: 'top' },
      { grimpeurId: 'b', voieId: 'm2b', issue: 'echec' },
      { grimpeurId: 'b', voieId: 'm3', ...np },
      { grimpeurId: 'c', voieId: 'm1', issue: 'top' },
      { grimpeurId: 'c', voieId: 'm2a', issue: 'top' },
      { grimpeurId: 'c', voieId: 'm3', issue: 'top' },
    ],
    resultatsBloc: [
      { grimpeurId: 'a', blocId: 'b1', ...np, palier: null },
      { grimpeurId: 'a', blocId: 'b2', ...np, palier: null },
      { grimpeurId: 'b', blocId: 'b1', issue: 'echec', palier: null },
      { grimpeurId: 'b', blocId: 'b2', ...np, palier: null },
      { grimpeurId: 'c', blocId: 'b1', issue: 'echec', palier: null },
      { grimpeurId: 'c', blocId: 'b2', issue: 'palier', palier: '1er essai' },
    ],
    vitesses: [
      { grimpeurId: 'a', issue: 'temps', temps: 29.11 },
      { grimpeurId: 'b', issue: 'non_presentation', temps: null },
    ],
  })
  const r = controleNp(entree)

  it('ordre : vitesse, blocs dans l’ordre de la structure, niveaux M1…T10 ; sections vides omises (R41l)', () => {
    expect(r.sections.map((s) => s.titre)).toEqual(['Vitesse', 'Bloc B1', 'Bloc B2', 'Niveau M2', 'Niveau M3', 'Niveau M4'])
  })

  it('vitesse : non-présentation et non saisie, en le précisant (R41n a)', () => {
    const vitesse = r.sections[0]
    expect(vitesse.lignes.map((l) => [l.grimpeur.grimpeurId, l.vitesse])).toEqual([
      ['b', 'np'],
      ['c', 'non_saisie'],
    ])
  })

  it('bloc : grimpeurs NP sur ce bloc (R41n b)', () => {
    expect(r.sections[1].lignes.map((l) => l.grimpeur.grimpeurId)).toEqual(['a'])
    expect(r.sections[2].lignes.map((l) => l.grimpeur.grimpeurId)).toEqual(['b', 'a'])
  })

  it('niveau : enfants ayant un NP sur une voie du niveau (R41n c)', () => {
    expect(r.sections[3].lignes.map((l) => l.grimpeur.grimpeurId)).toEqual(['a'])
    expect(r.sections[4].lignes.map((l) => l.grimpeur.grimpeurId)).toEqual(['b'])
  })

  it('lignes triées par club, puis nom, puis prénom (R41n)', () => {
    // Bloc B2 : ARNAUD (Bordeaux) avant ZOLA (Talence).
    expect(r.sections[2].lignes.map((l) => l.grimpeur.nom)).toEqual(['ARNAUD', 'ZOLA'])
  })

  it('nombre de lignes = somme des lignes des sections (R41n, R41k)', () => {
    expect(r.nbLignes).toBe(2 + 1 + 2 + 1 + 1 + 1)
  })

  it('attendus : engagés pour vitesse et blocs, enfants du niveau pour un niveau (R41m)', () => {
    expect(r.sections[0].attendus).toBe(3)
    expect(r.sections[1].attendus).toBe(3)
    // M2 : a (M2) + b, c (M1) ⇒ 3 ; M4 : a seul.
    expect(r.sections[3].attendus).toBe(3)
    expect(r.sections[5].attendus).toBe(1)
  })

  it('un niveau liste ses voies (libellé et cotation, ordre de la structure) (R41m)', () => {
    expect(r.sections[3].voies).toEqual(['M2 Noire (5a)', 'M2 Jaune (5a)'])
    expect(r.sections[0].voies).toEqual([])
  })

  it('sans épreuve de vitesse : pas de section Vitesse (R41l a)', () => {
    expect(controleNp({ ...entree, avecVitesse: false }).sections[0].titre).toBe('Bloc B1')
  })

  it('aucune ligne ⇒ aucune section (R41l)', () => {
    expect(controleNp(entreeEnfant({ avecVitesse: false })).sections).toEqual([])
  })
})

describe('spec #3 — fiche complète d’une ligne (R41o)', () => {
  const entree = entreeEnfant({
    grimpeurs: [g('a', 'A', 'Bdx', 'M2')],
    resultatsVoie: [
      { grimpeurId: 'a', voieId: 'm4', ...np },
      { grimpeurId: 'a', voieId: 'm2b', issue: 'top' },
      { grimpeurId: 'a', voieId: 'm3', issue: 'prise_valorisee' },
    ],
    resultatsBloc: [
      { grimpeurId: 'a', blocId: 'b2', issue: 'palier', palier: '2e essai' },
      { grimpeurId: 'a', blocId: 'b1', ...np, palier: null },
    ],
    vitesses: [{ grimpeurId: 'a', issue: 'temps', temps: 18.86 }],
  })
  const fiche = controleNp(entree).sections[0].lignes[0].fiche

  it('blocs dans l’ordre de la structure, palier compris (R41o a)', () => {
    expect(fiche.blocs).toEqual([
      { code: 'B1', issue: 'np', palier: null },
      { code: 'B2', issue: 'palier', palier: '2e essai' },
    ])
  })

  it('enfant : voies triées par niveau, avec libellé et cotation (R41o b)', () => {
    expect(fiche.voies).toEqual([
      { niveau: 'M2', libelle: 'M2 Jaune', cotation: '5a', issue: 'top' },
      { niveau: 'M3', libelle: 'M3', cotation: '5b', issue: 'prise_valorisee' },
      { niveau: 'M4', libelle: 'M4', cotation: '5c', issue: 'np' },
    ])
    expect(fiche.nbVoies).toBe(3)
  })

  it('vitesse : temps, NP ou non saisie (R41o c)', () => {
    expect(fiche.vitesse).toEqual({ etat: 'temps', temps: 18.86 })
  })

  it('un bloc sans résultat apparaît « non saisi » (cas hors clôture)', () => {
    const f = controleNp(entreeEnfant({ grimpeurs: [g('a', 'A', 'Bdx', 'M1')] })).sections[0].lignes[0].fiche
    expect(f.blocs[0]).toEqual({ code: 'B1', issue: null, palier: null })
    expect(f.vitesse).toEqual({ etat: 'non_saisie', temps: null })
  })
})

describe('spec #3 — ado / adulte : section « Moins de 6 voies » (R41l c, R41n d)', () => {
  const entree: EntreeControleNp = {
    ...entreeEnfant(),
    categorie: 'ado',
    avecVitesse: false,
    grimpeurs: [g('a', 'A', 'Bdx', null), g('b', 'B', 'Bdx', null)],
    resultatsVoie: [
      ...['m1', 'm2a', 'm2b', 'm3', 'm4', 'm1'].map((voieId, i) => ({ grimpeurId: 'a', voieId: i === 5 ? 'x' : voieId, issue: 'top' })),
      { grimpeurId: 'b', voieId: 'm1', issue: 'zone1' },
    ],
    resultatsBloc: ['a', 'b'].flatMap((id) => [
      { grimpeurId: id, blocId: 'b1', issue: 'echec', palier: null },
      { grimpeurId: id, blocId: 'b2', issue: 'echec', palier: null },
    ]),
  }
  const r = controleNp(entree)

  it('une seule section de voies, sans niveaux, avec le compteur n/6', () => {
    expect(r.sections.map((s) => s.titre)).toEqual(['Moins de 6 voies'])
    expect(r.sections[0].lignes.map((l) => [l.grimpeur.grimpeurId, l.fiche.nbVoies])).toEqual([['b', 1]])
    expect(r.sections[0].attendus).toBe(2)
  })

  it('la fiche ado ne détaille pas les voies (compteur seul)', () => {
    expect(r.sections[0].lignes[0].fiche.voies).toEqual([])
  })
})

describe('spec #3 — signal d’une ligne (R41p)', () => {
  const enfant = (modif: (f: FicheNp) => void) => {
    const f = ficheEnfantComplete()
    modif(f)
    return signalNp(f, 'enfant', true)
  }
  const toutNp = (f: FicheNp) => {
    f.blocs.forEach((b) => (b.issue = 'np'))
    f.voies.forEach((v) => (v.issue = 'np'))
  }

  it('fiche complète ⇒ aucun signal', () => {
    expect(enfant(() => {})).toBeNull()
  })

  it('a. tout NP, vitesse NP ou non saisie ⇒ « Tout NP : absent ? » (neutre)', () => {
    expect(enfant((f) => { toutNp(f); f.vitesse = { etat: 'np', temps: null } })).toEqual({ texte: 'Tout NP : absent ?', niveau: 'neutre' })
    expect(enfant((f) => { toutNp(f); f.vitesse = { etat: 'non_saisie', temps: null } })?.texte).toBe('Tout NP : absent ?')
  })

  it('b. vitesse NP, ni bloc ni voie NP ⇒ « Vitesse NP, fiche complète » (alerte)', () => {
    expect(enfant((f) => (f.vitesse = { etat: 'np', temps: null }))).toEqual({ texte: 'Vitesse NP, fiche complète', niveau: 'alerte' })
    expect(enfant((f) => (f.vitesse = { etat: 'non_saisie', temps: null }))?.texte).toBe('Vitesse NP, fiche complète')
  })

  it('c. un temps, tous les blocs NP, aucune voie saisie ⇒ « Rien saisi sauf vitesse » (alerte)', () => {
    expect(enfant(toutNp)).toEqual({ texte: 'Rien saisi sauf vitesse', niveau: 'alerte' })
  })

  it('d. aucune voie saisie, hors a. et c. ⇒ « Aucune voie saisie » (alerte)', () => {
    expect(enfant((f) => f.voies.forEach((v) => (v.issue = 'np')))).toEqual({ texte: 'Aucune voie saisie', niveau: 'alerte' })
  })

  it('e. enfant : tous les blocs NP et au moins 2 voies NP ⇒ « Peu de saisies » (attention)', () => {
    expect(enfant((f) => { f.blocs.forEach((b) => (b.issue = 'np')); f.voies[1].issue = 'np'; f.voies[2].issue = 'np' })).toEqual({ texte: 'Peu de saisies', niveau: 'attention' })
    expect(enfant((f) => { f.blocs.forEach((b) => (b.issue = 'np')); f.voies[2].issue = 'np' })).toBeNull()
  })

  it('b. ne s’applique pas si un bloc ou une voie est NP', () => {
    expect(enfant((f) => { f.vitesse = { etat: 'np', temps: null }; f.blocs[0].issue = 'np' })).toBeNull()
  })

  it('« tous les blocs » est vrai sans bloc (a.)', () => {
    expect(enfant((f) => { f.blocs = []; f.voies.forEach((v) => (v.issue = 'np')); f.vitesse = { etat: 'np', temps: null } })?.texte).toBe('Tout NP : absent ?')
  })

  it('sans épreuve de vitesse : a. possible, b. jamais', () => {
    const f = ficheEnfantComplete()
    f.vitesse = { etat: 'sans_epreuve', temps: null }
    expect(signalNp(f, 'enfant', false)).toBeNull()
    toutNp(f)
    expect(signalNp(f, 'enfant', false)?.texte).toBe('Tout NP : absent ?')
  })

  describe('ado / adulte (compteur n/6)', () => {
    const ado = (nbVoies: number, blocsNp: boolean, vitesse: FicheNp['vitesse']) =>
      signalNp(
        {
          blocs: [{ code: 'B1', issue: blocsNp ? 'np' : 'echec', palier: null }],
          voies: [],
          nbVoies,
          vitesse,
        },
        'ado',
        true,
      )

    it('a. 0/6, blocs NP, vitesse NP ⇒ absent ?', () => {
      expect(ado(0, true, { etat: 'np', temps: null })?.texte).toBe('Tout NP : absent ?')
    })
    it('b. 6/6, aucun bloc NP, vitesse non saisie ⇒ vitesse NP, fiche complète', () => {
      expect(ado(6, false, { etat: 'non_saisie', temps: null })?.texte).toBe('Vitesse NP, fiche complète')
    })
    it('c. un temps, blocs NP, 0/6 ⇒ rien saisi sauf vitesse', () => {
      expect(ado(0, true, { etat: 'temps', temps: 12 })?.texte).toBe('Rien saisi sauf vitesse')
    })
    it('d. 0/6 avec des blocs ⇒ aucune voie saisie', () => {
      expect(ado(0, false, { etat: 'temps', temps: 12 })?.texte).toBe('Aucune voie saisie')
    })
    it('e. « Peu de saisies » est réservé à l’enfant', () => {
      expect(ado(2, true, { etat: 'temps', temps: 12 })).toBeNull()
    })
  })
})

describe('spec #3 — lignes du PDF par club (R41s)', () => {
  const r = controleNp(
    entreeEnfant({
      grimpeurs: [
        g('a', 'ZOLA', 'Bordeaux', 'M1', 'Bordeaux 2'),
        g('b', 'ARNAUD', 'Bordeaux', 'M1', 'Bordeaux 2'),
        g('c', 'MARTIN', 'Bordeaux', 'M1', 'Bordeaux 1'),
        g('d', 'DUPONT', 'Talence', 'M1'),
      ],
      avecVitesse: false,
      resultatsBloc: ['a', 'b', 'c', 'd'].flatMap((id) => [
        { grimpeurId: id, blocId: 'b1', ...np, palier: null },
        { grimpeurId: id, blocId: 'b2', ...(id === 'a' ? np : { issue: 'echec' as const }), palier: null },
      ]),
    }),
  )

  it('un club par club ayant au moins une ligne, trié par nom', () => {
    expect(lignesNpParClub(r).map((c) => c.clubNom)).toEqual(['Bordeaux', 'Talence'])
  })

  it('une seule ligne par grimpeur, triée par équipe puis nom, prénom', () => {
    const bdx = lignesNpParClub(r)[0]
    expect(bdx.lignes.map((l) => l.grimpeur.grimpeurId)).toEqual(['c', 'b', 'a'])
  })
})

describe('spec #3 — noms des fichiers PDF (R41r, R41s)', () => {
  it('par niveau : np-<date>-par-niveau.pdf', () => {
    expect(nomFichierNp('2026-11-21')).toBe('np-2026-11-21-par-niveau.pdf')
  })

  it('par club : nom du club sans accent ni espace', () => {
    expect(nomFichierNp('2026-11-21', "BASSIN D'ARCACHON SUD ESCALADE")).toBe('np-2026-11-21-bassin-d-arcachon-sud-escalade.pdf')
    expect(nomFichierNp('2026-11-21', 'S.A.G.C. Escalade')).toBe('np-2026-11-21-s-a-g-c-escalade.pdf')
    expect(nomFichierNp('2026-11-21', 'Mérignac  Grimpe ')).toBe('np-2026-11-21-merignac-grimpe.pdf')
  })
})

describe('spec #3 — textes de la fiche complète (R41o)', () => {
  it('enfant : blocs, voies « niveau + issue », vitesse ; NP mis en évidence', () => {
    const f = ficheEnfantComplete()
    f.voies[1].issue = 'np'
    expect(elementsFiche(f, 'enfant')).toEqual([
      { texte: 'B1 Échec', np: false },
      { texte: 'B2 Palier 1er essai', np: false },
      { texte: 'M1 Top', np: false },
      { texte: 'M2 NP', np: true },
      { texte: 'M3 Top', np: false },
      { texte: 'Vit 21,37 s', np: false },
    ])
  })

  it('libellés d’issue, bloc non saisi, vitesse NP / non saisie / chute / sans épreuve', () => {
    const f: FicheNp = {
      blocs: [{ code: 'B1', issue: null, palier: null }],
      voies: [
        { niveau: 'T1', libelle: 'T1', cotation: '4c', issue: 'prise_valorisee' },
        { niveau: 'T2', libelle: 'T2', cotation: '5a', issue: 'top_moulinette' },
      ],
      nbVoies: 2,
      vitesse: { etat: 'np', temps: null },
    }
    expect(elementsFiche(f, 'enfant').map((e) => e.texte)).toEqual(['B1 non saisi', 'T1 Prise valorisée', 'T2 Top moulinette', 'Vit NP'])
    expect(elementsFiche(f, 'enfant')[0].np).toBe(true)
    expect(elementsFiche({ ...f, vitesse: { etat: 'non_saisie', temps: null } }, 'enfant').at(-1)).toEqual({ texte: 'Vit non saisie', np: true })
    expect(elementsFiche({ ...f, vitesse: { etat: 'chute', temps: null } }, 'enfant').at(-1)).toEqual({ texte: 'Vit chute', np: false })
    expect(elementsFiche({ ...f, vitesse: { etat: 'sans_epreuve', temps: null } }, 'enfant').at(-1)?.texte).toBe('T2 Top moulinette')
  })

  it('ado / adulte : compteur « Voies n/6 », mis en évidence sous 6', () => {
    const f: FicheNp = { blocs: [], voies: [], nbVoies: 4, vitesse: { etat: 'temps', temps: 12.9 } }
    expect(elementsFiche(f, 'ado')).toEqual([
      { texte: 'Voies 4/6', np: true },
      { texte: 'Vit 12,90 s', np: false },
    ])
    expect(elementsFiche({ ...f, nbVoies: 6 }, 'adulte')[0]).toEqual({ texte: 'Voies 6/6', np: false })
  })
})
