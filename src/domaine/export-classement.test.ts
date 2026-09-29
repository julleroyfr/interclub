import { describe, expect, it } from 'vitest'

import {
  construireDocumentExport,
  nomFichierExport,
  peutExporter,
  type SourceExport,
} from './export-classement'

// Spec #15 « Export PDF des classements officiels » — logique pure : éligibilité
// (R1–R5), nom du fichier (R9) et modèle du document (R10–R16), indépendamment
// de la bibliothèque de rendu PDF.

const CLUB_A = 'club-a'
const CLUB_B = 'club-b'

describe("Éligibilité à l'export (R1–R5)", () => {
  const engages = [CLUB_A]

  it("l'admin peut exporter une rencontre en ⑤ (R3)", () => {
    expect(peutExporter({ role: 'admin' }, { phase: 'resultats_publics', clubsEngages: engages })).toBe(true)
  })

  it("l'admin peut exporter même si aucun club n'est engagé (R3)", () => {
    expect(peutExporter({ role: 'admin' }, { phase: 'resultats_publics', clubsEngages: [] })).toBe(true)
  })

  it.each(['pre_competition', 'preparation', 'competition', 'cloture'] as const)(
    "refuse l'export en phase %s, y compris pour l'admin (R1/R2)",
    (phase) => {
      expect(peutExporter({ role: 'admin' }, { phase, clubsEngages: engages })).toBe(false)
      expect(
        peutExporter({ role: 'coach_permanent', clubId: CLUB_A }, { phase, clubsEngages: engages }),
      ).toBe(false)
    },
  )

  it('le coach permanent dont le club est engagé peut exporter en ⑤ (R4)', () => {
    expect(
      peutExporter(
        { role: 'coach_permanent', clubId: CLUB_A },
        { phase: 'resultats_publics', clubsEngages: engages },
      ),
    ).toBe(true)
  })

  it("le coach permanent d'un club non engagé ne peut pas exporter (R4)", () => {
    expect(
      peutExporter(
        { role: 'coach_permanent', clubId: CLUB_B },
        { phase: 'resultats_publics', clubsEngages: engages },
      ),
    ).toBe(false)
  })

  it.each(['coach_temporaire', 'juge', 'anonyme'] as const)(
    "refuse l'export au rôle %s, même en ⑤ (R5)",
    (role) => {
      expect(peutExporter({ role }, { phase: 'resultats_publics', clubsEngages: engages })).toBe(false)
    },
  )
})

describe('Nom du fichier (R9)', () => {
  it('suit le motif classement-<date>-<categorie>.pdf', () => {
    expect(nomFichierExport('2026-10-12', 'ado')).toBe('classement-2026-10-12-ado.pdf')
    expect(nomFichierExport('2026-11-03', 'enfant')).toBe('classement-2026-11-03-enfant.pdf')
  })
})

const source = (surcharge: Partial<SourceExport> = {}): SourceExport => ({
  dateRencontre: '2026-10-12',
  categorie: 'ado',
  clubPorteurNom: "Grimp'Bordeaux",
  individuel: {
    filles: [
      { rang: 1, nom: 'Dupuy', prenom: 'Léa', clubOrigineNom: "Grimp'Bordeaux", score: 312 },
      { rang: 2, nom: "D'Aubigné", prenom: 'Chloé', clubOrigineNom: 'Vertical Mérignac', score: 298 },
      { rang: 2, nom: 'Martin', prenom: 'Inès', clubOrigineNom: 'Pessac Escalade', score: 298 },
    ],
    garcons: [
      { rang: 1, nom: 'Bernard', prenom: 'Hugo', clubOrigineNom: 'Vertical Mérignac', score: 330.5 },
    ],
  },
  equipes: [
    { rang: 1, equipeNom: "Grimp'Bordeaux 1", clubNom: "Grimp'Bordeaux", score: 2480 },
    { rang: 2, equipeNom: 'Pessac 1', clubNom: 'Pessac Escalade', score: 2204 },
  ],
  clubs: [{ rang: 1, clubNom: "Grimp'Bordeaux", score: 4102 }],
  ...surcharge,
})

// 13 octobre 2026, 07:42 UTC = 09:42 à Paris (heure d'été).
const GENERE_LE = new Date('2026-10-13T07:42:00Z')

describe('En-tête du document (R10)', () => {
  const doc = construireDocumentExport(source(), GENERE_LE)

  it('porte le titre « Classement officiel »', () => {
    expect(doc.entete.titre).toBe('Classement officiel')
  })

  it('porte la date de la rencontre au format français', () => {
    expect(doc.entete.date).toBe('12 octobre 2026')
  })

  it('porte le libellé court de la catégorie', () => {
    expect(doc.entete.categorie).toBe('Ado')
    expect(construireDocumentExport(source({ categorie: 'enfant' }), GENERE_LE).entete.categorie).toBe(
      'Enfant',
    )
  })

  it('porte le club porteur', () => {
    expect(doc.entete.clubPorteur).toBe("Grimp'Bordeaux")
  })

  it('porte la date et l’heure de génération en heure de Paris', () => {
    expect(doc.entete.genereLe).toBe('13 octobre 2026 à 09:42')
  })

  it('en hiver, l’heure de génération suit l’heure de Paris (UTC+1)', () => {
    const hiver = construireDocumentExport(source(), new Date('2026-12-01T23:30:00Z'))
    expect(hiver.entete.genereLe).toBe('2 décembre 2026 à 00:30')
  })

  it('le pied de page rappelle la rencontre (date + catégorie) (R19)', () => {
    expect(doc.piedDePage).toBe('12 octobre 2026 · Ado')
  })
})

describe('Sections (R11–R16)', () => {
  const doc = construireDocumentExport(source(), GENERE_LE)

  it('contient quatre sections dans l’ordre Filles, Garçons, Équipes, Clubs (R11)', () => {
    expect(doc.sections.map((s) => s.titre)).toEqual([
      'Individuel Filles',
      'Individuel Garçons',
      'Équipes',
      'Clubs',
    ])
  })

  it('indique le nombre de lignes de chaque section (R12)', () => {
    expect(doc.sections.map((s) => s.compte)).toEqual([
      '3 grimpeuses',
      '1 grimpeur',
      '2 équipes',
      '1 club',
    ])
  })

  it('accorde le compte au singulier pour zéro (R12)', () => {
    const vide = construireDocumentExport(
      source({ individuel: { filles: [], garcons: [] }, equipes: [], clubs: [] }),
      GENERE_LE,
    )
    expect(vide.sections.map((s) => s.compte)).toEqual([
      '0 grimpeuse',
      '0 grimpeur',
      '0 équipe',
      '0 club',
    ])
  })

  it('colonnes de l’individuel : Rang, Nom Prénom, Club d’origine, Score (R15)', () => {
    expect(doc.sections[0]!.colonnes.map((c) => c.libelle)).toEqual([
      'Rang',
      'Nom Prénom',
      "Club d'origine",
      'Score',
    ])
    expect(doc.sections[1]!.colonnes.map((c) => c.libelle)).toEqual([
      'Rang',
      'Nom Prénom',
      "Club d'origine",
      'Score',
    ])
  })

  it('colonnes des équipes : Rang, Équipe, Club, Score (R15)', () => {
    expect(doc.sections[2]!.colonnes.map((c) => c.libelle)).toEqual(['Rang', 'Équipe', 'Club', 'Score'])
  })

  it('colonnes des clubs : Rang, Club, Score (R15)', () => {
    expect(doc.sections[3]!.colonnes.map((c) => c.libelle)).toEqual(['Rang', 'Club', 'Score'])
  })

  it('le score est aligné à droite', () => {
    for (const s of doc.sections) expect(s.colonnes.at(-1)!.alignement).toBe('droite')
  })

  it('reprend exactement rangs, ordre et scores du classement, ex æquo compris (R13)', () => {
    expect(doc.sections[0]!.lignes).toEqual([
      ['1', 'Dupuy Léa', "Grimp'Bordeaux", '312'],
      ['2', "D'Aubigné Chloé", 'Vertical Mérignac', '298'],
      ['2', 'Martin Inès', 'Pessac Escalade', '298'],
    ])
    expect(doc.sections[2]!.lignes).toEqual([
      ['1', "Grimp'Bordeaux 1", "Grimp'Bordeaux", '2480'],
      ['2', 'Pessac 1', 'Pessac Escalade', '2204'],
    ])
    expect(doc.sections[3]!.lignes).toEqual([['1', "Grimp'Bordeaux", '4102']])
  })

  it('ne tronque ni n’arrondit un score décimal (R13)', () => {
    expect(doc.sections[1]!.lignes[0]![3]).toBe('330,5')
  })

  it('liste toutes les lignes, sans pagination applicative (R14)', () => {
    const cent = Array.from({ length: 100 }, (_, i) => ({
      rang: i + 1,
      nom: `Nom${i}`,
      prenom: 'P',
      clubOrigineNom: 'C',
      score: 100 - i,
    }))
    const d = construireDocumentExport(
      source({ individuel: { filles: [], garcons: cent } }),
      GENERE_LE,
    )
    expect(d.sections[1]!.lignes).toHaveLength(100)
  })

  it('une section sans ligne est conservée avec « Aucun classement » (R16)', () => {
    const d = construireDocumentExport(
      source({ individuel: { filles: [], garcons: source().individuel.garcons } }),
      GENERE_LE,
    )
    expect(d.sections).toHaveLength(4)
    expect(d.sections[0]!.lignes).toEqual([])
    expect(d.sections[0]!.messageVide).toBe('Aucun classement')
    expect(d.sections[1]!.messageVide).toBeNull()
  })

  it('ne modifie pas les données source (accents, apostrophes conservés) (R20)', () => {
    expect(doc.sections[0]!.lignes[1]![1]).toBe("D'Aubigné Chloé")
  })
})
