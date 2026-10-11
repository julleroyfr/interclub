import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import type { ColonneExport, DocumentExport, SectionExport } from '@/domaine/export-classement'

// Rendu PDF du modèle de document d'export (spec #15 R12, R17–R20). Toute la
// décision de contenu est dans le domaine (`construireDocumentExport`) ; ce
// module ne fait que la mise en page : A4 portrait, une section par page de
// départ, en-tête de colonnes répété, pied de page « Page n / N ».
//
// Polices standard (Helvetica, encodage WinAnsi) : aucun fichier de police à
// embarquer, et elles couvrent tout l'alphabet français (accents, ç, œ, ’). Un
// caractère hors de ce jeu est remplacé par sa lettre de base, sinon par « ? »,
// plutôt que de faire échouer la génération (R20).

const [LARGEUR, HAUTEUR] = PageSizes.A4
const MARGE = 50
const LARGEUR_UTILE = LARGEUR - 2 * MARGE
const BAS_CONTENU = MARGE + 28 // réserve la place du pied de page
const HAUTEUR_LIGNE = 16
const TAILLE_TEXTE = 10

const NOIR = rgb(0.06, 0.09, 0.16)
const GRIS = rgb(0.4, 0.45, 0.53)
const TRAIT = rgb(0.8, 0.84, 0.88)

/** Largeurs de colonnes (en proportion de la largeur utile) selon leur nombre. */
const PROPORTIONS: Record<number, number[]> = {
  3: [0.1, 0.72, 0.18],
  4: [0.1, 0.4, 0.34, 0.16],
}

type Polices = { normale: PDFFont; grasse: PDFFont }

function nettoyeur(police: PDFFont): (texte: string) => string {
  const permis = new Set(police.getCharacterSet())
  return (texte) =>
    [...texte]
      .map((c) => {
        if (permis.has(c.codePointAt(0)!)) return c
        const base = c.normalize('NFD')[0]
        return base && permis.has(base.codePointAt(0)!) ? base : '?'
      })
      .join('')
}

/** Tronque avec « … » si le texte dépasse la largeur de sa colonne. */
function ajuster(texte: string, police: PDFFont, largeur: number): string {
  if (police.widthOfTextAtSize(texte, TAILLE_TEXTE) <= largeur) return texte
  let t = texte
  while (t.length > 1 && police.widthOfTextAtSize(`${t}…`, TAILLE_TEXTE) > largeur) t = t.slice(0, -1)
  return `${t}…`
}

class Metteur {
  private page!: PDFPage
  private y = 0

  constructor(
    private readonly pdf: PDFDocument,
    private readonly polices: Polices,
    private readonly propre: (t: string) => string,
  ) {}

  nouvellePage(): void {
    this.page = this.pdf.addPage(PageSizes.A4)
    this.y = HAUTEUR - MARGE
  }

  texte(texte: string, x: number, taille: number, police: PDFFont, couleur = NOIR): void {
    this.page.drawText(this.propre(texte), { x, y: this.y, size: taille, font: police, color: couleur })
  }

  descendre(de: number): void {
    this.y -= de
  }

  trait(epaisseur: number, couleur = TRAIT): void {
    this.page.drawLine({
      start: { x: MARGE, y: this.y },
      end: { x: LARGEUR - MARGE, y: this.y },
      thickness: epaisseur,
      color: couleur,
    })
  }

  entete(doc: DocumentExport): void {
    const { normale, grasse } = this.polices
    const e = doc.entete
    this.descendre(18)
    this.texte(e.titre, MARGE, 20, grasse)
    this.descendre(18)
    this.texte(`${e.date} · Catégorie ${e.categorie} · Club porteur : ${e.clubPorteur}`, MARGE, 11, normale)
    this.descendre(14)
    this.texte(`Document généré le ${e.genereLe}`, MARGE, 8.5, normale, GRIS)
    this.descendre(10)
    this.trait(1.5, NOIR)
    this.descendre(24)
  }

  private cellules(valeurs: string[], colonnes: ColonneExport[], police: PDFFont, couleur = NOIR): void {
    const proportions = PROPORTIONS[colonnes.length] ?? colonnes.map(() => 1 / colonnes.length)
    let x = MARGE
    colonnes.forEach((col, i) => {
      const largeur = proportions[i]! * LARGEUR_UTILE
      const texte = ajuster(this.propre(valeurs[i] ?? ''), police, largeur - 6)
      const xTexte =
        col.alignement === 'droite' ? x + largeur - police.widthOfTextAtSize(texte, TAILLE_TEXTE) : x
      this.page.drawText(texte, { x: xTexte, y: this.y, size: TAILLE_TEXTE, font: police, color: couleur })
      x += largeur
    })
  }

  private enteteColonnes(colonnes: ColonneExport[]): void {
    this.cellules(
      colonnes.map((c) => c.libelle.toUpperCase()),
      colonnes,
      this.polices.grasse,
      GRIS,
    )
    this.descendre(5)
    this.trait(0.8, GRIS)
    this.descendre(HAUTEUR_LIGNE - 5)
  }

  section(s: SectionExport): void {
    const { normale, grasse } = this.polices
    this.descendre(14)
    this.texte(s.titre, MARGE, 14, grasse)
    this.descendre(14)
    this.texte(s.compte, MARGE, 9, normale, GRIS)
    this.descendre(22)

    if (s.messageVide) {
      this.texte(s.messageVide, MARGE, TAILLE_TEXTE, normale, GRIS)
      return
    }

    this.enteteColonnes(s.colonnes)
    for (const ligne of s.lignes) {
      if (this.y < BAS_CONTENU) {
        // R18 : la section continue, en-tête de colonnes répété.
        this.nouvellePage()
        this.descendre(10)
        this.texte(`${s.titre} (suite)`, MARGE, 10, grasse, GRIS)
        this.descendre(22)
        this.enteteColonnes(s.colonnes)
      }
      this.cellules(ligne, s.colonnes, normale)
      this.descendre(5)
      this.trait(0.4)
      this.descendre(HAUTEUR_LIGNE - 5)
    }
  }
}

/** Pied de page de chaque page : rappel de la rencontre + « Page n / N » (R19). */
function piedsDePage(pdf: PDFDocument, texte: string, police: PDFFont): void {
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    const pagination = `Page ${i + 1} / ${pages.length}`
    const y = MARGE - 10
    page.drawLine({
      start: { x: MARGE, y: y + 14 },
      end: { x: LARGEUR - MARGE, y: y + 14 },
      thickness: 0.6,
      color: TRAIT,
    })
    page.drawText(texte, { x: MARGE, y, size: 8.5, font: police, color: GRIS })
    page.drawText(pagination, {
      x: LARGEUR - MARGE - police.widthOfTextAtSize(pagination, 8.5),
      y,
      size: 8.5,
      font: police,
      color: GRIS,
    })
  })
}

/** Produit les octets du PDF à partir du modèle de document (spec #15). */
export async function rendrePdf(doc: DocumentExport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.entete.titre} — ${doc.piedDePage}`)
  pdf.setLanguage('fr-FR')

  const polices: Polices = {
    normale: await pdf.embedFont(StandardFonts.Helvetica),
    grasse: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const propre = nettoyeur(polices.normale)
  const metteur = new Metteur(pdf, polices, propre)

  doc.sections.forEach((s, i) => {
    metteur.nouvellePage() // R12 : chaque section démarre sur une page neuve
    if (i === 0) metteur.entete(doc)
    metteur.section(s)
  })

  piedsDePage(pdf, propre(doc.piedDePage), polices.normale)
  return pdf.save()
}
