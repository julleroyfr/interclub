import { describe, it, expect } from 'vitest'
import {
  issuesVoieSaisissables,
  validerIssueVoie,
  validerResultatBloc,
  verifierAjoutVoieAdo,
  manquantsCloture,
  PLAFOND_VOIES_ADO,
  ResultatInvalideError,
} from './resultat'
import { voiesDuGroupeDepart } from './engagement'

describe('issues de voie saisissables selon catégorie/type (R10/R12)', () => {
  it('enfant tête : Top, Prise valorisée, Échec (R10)', () => {
    expect(issuesVoieSaisissables('enfant', 'tete')).toEqual([
      'top',
      'prise_valorisee',
      'echec',
    ])
  })
  it('enfant moulinette : pas de prise valorisée (R10)', () => {
    expect(issuesVoieSaisissables('enfant', 'moulinette')).toEqual(['top', 'echec'])
  })
  it('ado : Top, Zone 2, Zone 1, Échec (R12)', () => {
    expect(issuesVoieSaisissables('ado', 'tete')).toEqual([
      'top',
      'zone2',
      'zone1',
      'echec',
    ])
  })
})

describe("validation d'une issue de voie saisie (R10/R12)", () => {
  it('refuse la prise valorisée sur une voie moulinette (R10)', () => {
    expect(() => validerIssueVoie('prise_valorisee', 'enfant', 'moulinette')).toThrow(
      ResultatInvalideError,
    )
  })
  it('refuse une issue de zone en catégorie enfant (R12)', () => {
    expect(() => validerIssueVoie('zone1', 'enfant', 'tete')).toThrow(ResultatInvalideError)
  })
  it('refuse la prise valorisée en catégorie ado (R12)', () => {
    expect(() => validerIssueVoie('prise_valorisee', 'ado', 'tete')).toThrow(
      ResultatInvalideError,
    )
  })
  it('accepte un Top dans les deux catégories (R10/R12)', () => {
    expect(() => validerIssueVoie('top', 'enfant', 'tete')).not.toThrow()
    expect(() => validerIssueVoie('top', 'ado', 'tete')).not.toThrow()
  })
  it('refuse NP saisi par le coach — posé automatiquement à la clôture (R18)', () => {
    expect(() => validerIssueVoie('np', 'enfant', 'tete')).toThrow(ResultatInvalideError)
  })
})

describe("validation d'un résultat de bloc (R16)", () => {
  const paliers = ['p1', 'p2', 'p3']
  it('accepte un palier appartenant au bloc (R16)', () => {
    expect(() =>
      validerResultatBloc({ issue: 'palier', palierId: 'p2', paliersDuBloc: paliers }),
    ).not.toThrow()
  })
  it('refuse un palier étranger au bloc (R16)', () => {
    expect(() =>
      validerResultatBloc({ issue: 'palier', palierId: 'zzz', paliersDuBloc: paliers }),
    ).toThrow(ResultatInvalideError)
  })
  it("refuse un palier manquant quand l'issue est « palier » (R16)", () => {
    expect(() =>
      validerResultatBloc({ issue: 'palier', palierId: null, paliersDuBloc: paliers }),
    ).toThrow(ResultatInvalideError)
  })
  it('accepte un échec sans palier (R16)', () => {
    expect(() =>
      validerResultatBloc({ issue: 'echec', palierId: null, paliersDuBloc: paliers }),
    ).not.toThrow()
  })
  it('refuse NP saisi par le coach (R18)', () => {
    expect(() =>
      validerResultatBloc({ issue: 'np', palierId: null, paliersDuBloc: paliers }),
    ).toThrow(ResultatInvalideError)
  })
})

describe("ajout d'une voie ado — unicité et plafond (R11/R13/R14)", () => {
  it('plafond de 6 voies : refuse la 7ᵉ (R14)', () => {
    const six = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']
    expect(() =>
      verifierAjoutVoieAdo({ voiesSaisiesIds: six, voieCandidateId: 'v7' }),
    ).toThrow(ResultatInvalideError)
    expect(PLAFOND_VOIES_ADO).toBe(6)
  })
  it('refuse une voie déjà réalisée par le grimpeur (R13)', () => {
    expect(() =>
      verifierAjoutVoieAdo({ voiesSaisiesIds: ['v1', 'v2'], voieCandidateId: 'v2' }),
    ).toThrow(ResultatInvalideError)
  })
  it('autorise deux voies distinctes de même niveau (R11)', () => {
    // v_t5a et v_t5b : deux voies T5 distinctes (identité par id, pas par niveau)
    expect(() =>
      verifierAjoutVoieAdo({ voiesSaisiesIds: ['v_t5a'], voieCandidateId: 'v_t5b' }),
    ).not.toThrow()
  })
})

describe('NP automatique à la clôture (R9/R18)', () => {
  it('enfant : passe en NP les voies attendues (3 du groupe) non saisies (R9/R18)', () => {
    // Groupe M2 → M2·M3·M4 : 3 voies attendues (R9, cf. R20 spec #5)
    const attendus = voiesDuGroupeDepart('M2')
    expect(manquantsCloture(attendus, ['M2'])).toEqual(['M3', 'M4'])
  })
  it('ne touche pas un attendu déjà saisi (idempotent, R18)', () => {
    expect(manquantsCloture(['B1', 'B2'], ['B1', 'B2'])).toEqual([])
  })
  it('blocs : passe en NP B1/B2 non saisis (R18)', () => {
    expect(manquantsCloture(['B1', 'B2'], ['B1'])).toEqual(['B2'])
  })
})
