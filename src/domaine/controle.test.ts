import { describe, it, expect } from 'vitest'
import {
  modeControle,
  peutCocher,
  libelleIssueVoie,
  libelleIssueBloc,
  trierLignes,
  filtrerLignes,
  progression,
  progressionGlobale,
  nomCourtAuteur,
  type LigneControle,
} from './controle'

/** Fabrique une ligne de contrôle (valeurs par défaut neutres). */
function ligne(p: Partial<LigneControle> & Pick<LigneControle, 'nom' | 'prenom'>): LigneControle {
  return {
    resultatId: `${p.nom}-${p.prenom}`,
    clubNom: 'Club A',
    clubAccueilNom: null,
    issueLibelle: 'Top',
    controleLe: null,
    controlePar: null,
    ...p,
  }
}

const cochee = { controleLe: '2026-03-14T18:42:00Z', controlePar: 'Julien L.' }

describe('spec #16 — disponibilité de l’écran selon la phase (R2)', () => {
  it('④ clôture : contrôle (coches modifiables) (R2)', () => {
    expect(modeControle('cloture')).toBe('controle')
  })

  it('⑤ résultats publics : lecture seule (R2)', () => {
    expect(modeControle('resultats_publics')).toBe('lecture')
  })

  it('①, ② et ③ : écran indisponible (404) (R2)', () => {
    expect(modeControle('pre_competition')).toBeNull()
    expect(modeControle('preparation')).toBeNull()
    expect(modeControle('competition')).toBeNull()
  })
})

describe('spec #16 — écriture d’une coche selon la phase (R13)', () => {
  it('autorisée uniquement en ④ clôture (R13)', () => {
    expect(peutCocher('cloture')).toBe(true)
  })

  it('refusée en ⑤ (lecture seule) et avant la ④ (R13/R2)', () => {
    expect(peutCocher('resultats_publics')).toBe(false)
    expect(peutCocher('competition')).toBe(false)
    expect(peutCocher('preparation')).toBe(false)
    expect(peutCocher('pre_competition')).toBe(false)
  })
})

describe('spec #16 — issue affichée, sans points (R8)', () => {
  it('voie : libellés lisibles de chaque issue (R8)', () => {
    expect(libelleIssueVoie('top')).toBe('Top')
    expect(libelleIssueVoie('prise_valorisee')).toBe('Prise valorisée')
    expect(libelleIssueVoie('zone2')).toBe('Zone 2')
    expect(libelleIssueVoie('zone1')).toBe('Zone 1')
    expect(libelleIssueVoie('echec')).toBe('Échec')
    expect(libelleIssueVoie('np')).toBe('NP')
  })

  it('bloc : un palier s’affiche par son libellé (R8)', () => {
    expect(libelleIssueBloc('palier', '2e essai')).toBe('2e essai')
    expect(libelleIssueBloc('palier', 'Bloc complet')).toBe('Bloc complet')
  })

  it('bloc : Échec et NP (R8)', () => {
    expect(libelleIssueBloc('echec', null)).toBe('Échec')
    expect(libelleIssueBloc('np', null)).toBe('NP')
  })

  it('bloc : palier sans libellé connu → libellé générique, jamais de points (R8)', () => {
    expect(libelleIssueBloc('palier', null)).toBe('Palier')
  })
})

describe('spec #16 — tri des lignes (R7)', () => {
  it('trie par nom puis prénom, en ordre alphabétique français (R7)', () => {
    const lignes = [
      ligne({ nom: 'Martin', prenom: 'Léo' }),
      ligne({ nom: 'Écuyer', prenom: 'Zoé' }),
      ligne({ nom: 'Bernard', prenom: 'Lina' }),
      ligne({ nom: 'Martin', prenom: 'Alice' }),
    ]
    expect(trierLignes(lignes).map((l) => `${l.nom} ${l.prenom}`)).toEqual([
      'Bernard Lina',
      'Écuyer Zoé',
      'Martin Alice',
      'Martin Léo',
    ])
  })

  it('ne modifie pas le tableau d’entrée (R7)', () => {
    const lignes = [ligne({ nom: 'B', prenom: 'x' }), ligne({ nom: 'A', prenom: 'y' })]
    trierLignes(lignes)
    expect(lignes[0]!.nom).toBe('B')
  })
})

describe('spec #16 — filtres d’affichage (R9)', () => {
  const lignes = [
    ligne({ nom: 'Lefèvre', prenom: 'Tom' }),
    ligne({ nom: 'Garcia', prenom: 'Inès', ...cochee }),
    ligne({ nom: 'Roux', prenom: 'Emma' }),
  ]

  it('sans filtre : toutes les lignes (R9)', () => {
    expect(filtrerLignes(lignes, { recherche: '', nonControleesSeulement: false })).toHaveLength(3)
  })

  it('recherche sur le nom, insensible à la casse et aux accents (R9)', () => {
    const r = filtrerLignes(lignes, { recherche: 'LEFEV', nonControleesSeulement: false })
    expect(r.map((l) => l.nom)).toEqual(['Lefèvre'])
  })

  it('recherche sur le prénom (R9)', () => {
    const r = filtrerLignes(lignes, { recherche: 'ines', nonControleesSeulement: false })
    expect(r.map((l) => l.nom)).toEqual(['Garcia'])
  })

  it('recherche « prénom nom » comme « nom prénom » (R9)', () => {
    expect(
      filtrerLignes(lignes, { recherche: 'emma roux', nonControleesSeulement: false }),
    ).toHaveLength(1)
    expect(
      filtrerLignes(lignes, { recherche: 'roux emma', nonControleesSeulement: false }),
    ).toHaveLength(1)
  })

  it('« non contrôlées seulement » masque les lignes cochées (R9)', () => {
    const r = filtrerLignes(lignes, { recherche: '', nonControleesSeulement: true })
    expect(r.map((l) => l.nom)).toEqual(['Lefèvre', 'Roux'])
  })

  it('les deux filtres se cumulent (R9)', () => {
    expect(
      filtrerLignes(lignes, { recherche: 'garcia', nonControleesSeulement: true }),
    ).toHaveLength(0)
  })
})

describe('spec #16 — progression du contrôle d’un support (R5)', () => {
  it('compte les lignes cochées sur le total (R5)', () => {
    const p = progression([
      ligne({ nom: 'A', prenom: 'a', ...cochee }),
      ligne({ nom: 'B', prenom: 'b' }),
      ligne({ nom: 'C', prenom: 'c', ...cochee }),
    ])
    expect(p).toEqual({ controlees: 2, total: 3, complet: false })
  })

  it('support entièrement contrôlé quand toutes les lignes sont cochées (R5)', () => {
    const p = progression([ligne({ nom: 'A', prenom: 'a', ...cochee })])
    expect(p).toEqual({ controlees: 1, total: 1, complet: true })
  })

  it('support sans aucun résultat : 0/0, jamais « complet » (R5)', () => {
    expect(progression([])).toEqual({ controlees: 0, total: 0, complet: false })
  })

  it('une coche dont l’auteur a été supprimé reste une coche (controle_le seul) (R5/R11)', () => {
    const p = progression([ligne({ nom: 'A', prenom: 'a', controleLe: '2026-03-14T18:42:00Z' })])
    expect(p.controlees).toBe(1)
  })
})

describe('spec #16 — progression globale de la rencontre (R3)', () => {
  it('additionne les progressions de tous les supports (R3)', () => {
    const p = progressionGlobale([
      [ligne({ nom: 'A', prenom: 'a', ...cochee }), ligne({ nom: 'B', prenom: 'b' })],
      [ligne({ nom: 'C', prenom: 'c', ...cochee })],
      [],
    ])
    expect(p).toEqual({ controlees: 2, total: 3, complet: false })
  })

  it('rencontre sans aucune ligne : 0/0 (R3)', () => {
    expect(progressionGlobale([])).toEqual({ controlees: 0, total: 0, complet: false })
  })
})

describe('spec #16 — auteur affiché d’une coche (R11)', () => {
  it('nom court = partie de l’email avant « @ » (R11)', () => {
    expect(nomCourtAuteur('julien.leroy@club.fr')).toBe('julien.leroy')
  })

  it('auteur inconnu (compte supprimé ou sans email) → null (R11)', () => {
    expect(nomCourtAuteur(null)).toBeNull()
    expect(nomCourtAuteur('')).toBeNull()
  })
})
