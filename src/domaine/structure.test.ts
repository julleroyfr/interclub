import { describe, it, expect } from 'vitest'
import {
  LibelleStructureInvalideError,
  editionStructurePossible,
  normaliserCodeBloc,
  normaliserLibellePalier,
  refusBaremeVitesse,
  refusModificationVoie,
  refusSuppression,
} from './structure'

// Spec #3 « Écrans de paramétrage » — modification et suppression des éléments
// de la structure d'une rencontre (R51–R55). Domaine pur : les gardes sont
// rejouées par les Server Actions ; le décompte des résultats vient de la base.

describe('phases où la structure se modifie (R51)', () => {
  it('ajout, modification et suppression possibles en ① et ② (R51 rév. 2026-10-25)', () => {
    expect(editionStructurePossible('pre_competition')).toBe(true)
    expect(editionStructurePossible('preparation')).toBe(true)
  })

  it('refusées à partir de la ③ compétition (R51, R44)', () => {
    expect(editionStructurePossible('competition')).toBe(false)
    expect(editionStructurePossible('cloture')).toBe(false)
    expect(editionStructurePossible('resultats_publics')).toBe(false)
  })
})

describe('modification d’une voie portant des résultats (R55b, R55d)', () => {
  const avant = { niveau: 'T5', typeVoie: 'tete' as const }

  it('changement de niveau refusé si des résultats existent (R55b)', () => {
    expect(
      refusModificationVoie({ avant, apres: { niveau: 'T6', typeVoie: 'tete' }, nbResultats: 3 }),
    ).toBe('Niveau et type non modifiables : 3 résultats déjà saisis sur cette voie.')
  })

  it('changement de type refusé si des résultats existent (R55b)', () => {
    expect(
      refusModificationVoie({
        avant,
        apres: { niveau: 'T5', typeVoie: 'moulinette' },
        nbResultats: 1,
      }),
    ).toBe('Niveau et type non modifiables : 1 résultat déjà saisi sur cette voie.')
  })

  it('niveau et type inchangés → accepté malgré les résultats (R55d)', () => {
    expect(refusModificationVoie({ avant, apres: avant, nbResultats: 5 })).toBeNull()
  })

  it('changement de niveau accepté sans résultat (R52)', () => {
    expect(
      refusModificationVoie({ avant, apres: { niveau: 'T7', typeVoie: 'tete' }, nbResultats: 0 }),
    ).toBeNull()
  })
})

describe('suppression d’un élément portant des résultats (R55a, R55c)', () => {
  it('voie avec résultats → refusée, nombre indiqué (R55a)', () => {
    expect(refusSuppression('voie', 2)).toBe(
      'Suppression impossible : 2 résultats sont saisis sur cette voie.',
    )
  })

  it('bloc avec un résultat → refusé au singulier (R55a)', () => {
    expect(refusSuppression('bloc', 1)).toBe(
      'Suppression impossible : 1 résultat est saisi sur ce bloc.',
    )
  })

  it('palier retenu par des résultats → refusé (R55c)', () => {
    expect(refusSuppression('palier', 4)).toBe(
      'Suppression impossible : 4 résultats retiennent ce palier.',
    )
  })

  it('sans résultat → accepté (R54)', () => {
    expect(refusSuppression('voie', 0)).toBeNull()
    expect(refusSuppression('bloc', 0)).toBeNull()
    expect(refusSuppression('palier', 0)).toBeNull()
  })
})

describe('code de bloc et libellé de palier (R53)', () => {
  it('code normalisé : espaces de bord retirés, internes réduits (R53)', () => {
    expect(normaliserCodeBloc('  B 3  ')).toBe('B 3')
    expect(normaliserCodeBloc('B   3')).toBe('B 3')
  })

  it('code vide refusé (R53)', () => {
    expect(() => normaliserCodeBloc('   ')).toThrow(LibelleStructureInvalideError)
    expect(() => normaliserCodeBloc('')).toThrow('Le code du bloc est obligatoire.')
  })

  it('libellé de palier normalisé et obligatoire (R53)', () => {
    expect(normaliserLibellePalier('  Zone   1 ')).toBe('Zone 1')
    expect(() => normaliserLibellePalier(' ')).toThrow('Le libellé du palier est obligatoire.')
  })
})

describe('barème de vitesse et saisies existantes (R55e)', () => {
  it('sans saisie de vitesse → édition acceptée (R47, R55e)', () => {
    expect(refusBaremeVitesse(0)).toBeNull()
  })

  it('avec des saisies → refusée, nombre indiqué (R55e)', () => {
    expect(refusBaremeVitesse(3)).toBe(
      'Barème non modifiable : 3 saisies de vitesse existent déjà sur cette épreuve.',
    )
    expect(refusBaremeVitesse(1)).toBe(
      'Barème non modifiable : 1 saisie de vitesse existe déjà sur cette épreuve.',
    )
  })
})
