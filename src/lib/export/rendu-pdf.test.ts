import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { construireDocumentExport, type SourceExport } from '@/domaine/export-classement'

import { rendrePdf } from './rendu-pdf'

// Spec #15 — rendu PDF du modèle de document (R12, R17–R20). Test de fumée : la
// structure du fichier (format, nombre de pages) ; le contenu visuel (en-tête de
// colonnes répété, pied de page, accents) est vérifié au cahier de test #26.

const grimpeurs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    rang: i + 1,
    nom: `Nom${i}`,
    prenom: 'Prénom',
    clubOrigineNom: "Grimp'Bordeaux",
    score: 500 - i,
  }))

const source = (surcharge: Partial<SourceExport> = {}): SourceExport => ({
  dateRencontre: '2026-10-12',
  categorie: 'ado',
  clubPorteurNom: "Grimp'Bordeaux",
  individuel: { filles: grimpeurs(3), garcons: grimpeurs(3) },
  equipes: [{ rang: 1, equipeNom: 'Équipe 1', clubNom: 'Club', score: 10 }],
  clubs: [{ rang: 1, clubNom: 'Club', score: 10 }],
  ...surcharge,
})

const GENERE_LE = new Date('2026-10-13T07:42:00Z')

async function charger(src: SourceExport) {
  const octets = await rendrePdf(construireDocumentExport(src, GENERE_LE))
  return { octets, pdf: await PDFDocument.load(octets) }
}

describe('Rendu PDF (R12, R17–R20)', () => {
  it('produit un fichier PDF valide', async () => {
    const { octets } = await charger(source())
    expect(new TextDecoder().decode(octets.slice(0, 5))).toBe('%PDF-')
  })

  it('met chaque page au format A4 portrait (R17)', async () => {
    const { pdf } = await charger(source())
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize()
      expect(width).toBeCloseTo(595.28, 1)
      expect(height).toBeCloseTo(841.89, 1)
    }
  })

  it('commence chaque section sur une nouvelle page (R12)', async () => {
    const { pdf } = await charger(source())
    expect(pdf.getPageCount()).toBe(4)
  })

  it('conserve une page pour une section vide (R16)', async () => {
    const { pdf } = await charger(source({ individuel: { filles: [], garcons: grimpeurs(3) } }))
    expect(pdf.getPageCount()).toBe(4)
  })

  it('poursuit une section longue sur les pages suivantes (R18)', async () => {
    const { pdf } = await charger(source({ individuel: { filles: grimpeurs(3), garcons: grimpeurs(120) } }))
    expect(pdf.getPageCount()).toBeGreaterThan(5)
  })

  it('ne plante pas sur un caractère absent de la police (R20)', async () => {
    const { pdf } = await charger(
      source({
        individuel: {
          filles: [{ rang: 1, nom: 'Wałęsa', prenom: 'Zoë', clubOrigineNom: 'Œuvre ✓', score: 1 }],
          garcons: [],
        },
      }),
    )
    expect(pdf.getPageCount()).toBe(4)
  })
})
