import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'

import {
  controleNp,
  elementsFiche,
  libelleIssue,
  lignesNpParClub,
  formaterTemps,
  type LigneNp,
  type SectionNp,
} from '@/domaine/controle-np'
import { voiesDuGroupeDepart, GROUPES_DEPART } from '@/domaine/engagement'
import { CATEGORIES } from '@/domaine/rencontre'
import type { DonneesControleNp } from '@/lib/admin/controle-np'

import { nettoyeur } from './rendu-pdf'

// Rendu PDF du contrôle des NP (spec #3 R41r, R41s) : A4 paysage, polices
// standard (texte sélectionnable, spec #15 R20). Le contenu (sections, lignes,
// fiche, signal) vient du domaine `controle-np` ; ce module ne fait que la mise
// en page. Colonne « Correction » vide, à remplir à la main.

const [HAUTEUR_A4, LARGEUR_A4] = PageSizes.A4 // paysage : largeur = grand côté
const L = LARGEUR_A4
const H = HAUTEUR_A4
const M = 30
const UTILE = L - 2 * M

const NOIR = rgb(0.1, 0.1, 0.12)
const GRIS = rgb(0.42, 0.42, 0.46)
const TRAIT = rgb(0.78, 0.78, 0.8)
const ROUGE = rgb(0.72, 0.1, 0.1)
const ORANGE = rgb(0.75, 0.38, 0)
const BLANC = rgb(1, 1, 1)
const FOND_NP = rgb(1, 0.86, 0.84)
const FOND_ENTETE = rgb(0.16, 0.22, 0.36)
const FOND_SECTION = rgb(0.9, 0.92, 0.96)
const FOND_ALT = rgb(0.96, 0.96, 0.97)

const COULEUR_SIGNAL = { alerte: ROUGE, attention: ORANGE, neutre: GRIS } as const

type Colonne = { titre: string; largeur: number }

function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = []
  let courante = ''
  for (const mot of texte.split(' ')) {
    const essai = courante ? `${courante} ${mot}` : mot
    if (police.widthOfTextAtSize(essai, taille) > largeur && courante) {
      lignes.push(courante)
      courante = mot
    } else courante = essai
  }
  lignes.push(courante)
  return lignes
}

/** Mise en page : pages, en-têtes de tableau répétés, lignes à hauteur fixe. */
class Mise {
  page!: PDFPage
  y = 0
  readonly pages: PDFPage[] = []

  constructor(
    private readonly pdf: PDFDocument,
    readonly normale: PDFFont,
    readonly grasse: PDFFont,
    private readonly propre: (t: string) => string,
    private readonly surtitre: string,
  ) {}

  nouvellePage() {
    this.page = this.pdf.addPage([L, H])
    this.pages.push(this.page)
    this.y = H - M
    this.texte(this.surtitre, M, this.y - 10, 9, this.normale, GRIS)
    this.y -= 18
  }

  texte(t: string, x: number, y: number, taille: number, police: PDFFont, couleur: RGB = NOIR) {
    this.page.drawText(this.propre(t), { x, y, size: taille, font: police, color: couleur })
  }

  rect(x: number, y: number, largeur: number, hauteur: number, couleur: RGB) {
    this.page.drawRectangle({ x, y, width: largeur, height: hauteur, color: couleur })
  }

  trait(x1: number, x2: number, y: number) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: TRAIT })
  }

  paragraphe(t: string, taille = 9) {
    for (const l of couper(this.propre(t), this.normale, taille, UTILE - 10)) {
      this.texte(l, M, this.y - taille, taille, this.normale)
      this.y -= taille + 3.5
    }
  }

  enteteTableau(colonnes: Colonne[]) {
    this.rect(M, this.y - 16, UTILE, 16, FOND_ENTETE)
    let x = M
    for (const c of colonnes) {
      this.texte(c.titre, x + 5, this.y - 11, 7.5, this.grasse, BLANC)
      x += c.largeur
    }
    this.y -= 16
  }

  place(hauteur: number): boolean {
    return this.y - hauteur >= M + 20
  }

  piedsDePage(genere: Date) {
    const quand = genere.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
    this.pages.forEach((p, i) =>
      p.drawText(this.propre(`Généré le ${quand} – page ${i + 1}/${this.pages.length}`), {
        x: M,
        y: M - 12,
        size: 7.5,
        font: this.normale,
        color: GRIS,
      }),
    )
  }
}

async function ouvrir(donnees: DonneesControleNp) {
  const pdf = await PDFDocument.create()
  const normale = await pdf.embedFont(StandardFonts.Helvetica)
  const grasse = await pdf.embedFont(StandardFonts.HelveticaBold)
  const categorie = CATEGORIES.find((c) => c.value === donnees.categorie)?.labelCourt ?? donnees.categorie
  const surtitre = `Rencontre ${categorie.toLowerCase()} du ${formaterDate(donnees.dateRencontre)} – ${donnees.clubPorteurNom}`
  const mise = new Mise(pdf, normale, grasse, nettoyeur(normale), surtitre)
  return { pdf, mise }
}

const equipeEtGroupe = (l: LigneNp, enfant: boolean) =>
  [l.grimpeur.equipeNom, enfant ? `groupe ${l.grimpeur.groupeDepart ?? 'à définir'}` : null].filter(Boolean).join(' · ')

/** Cellule « nom + équipe » sur deux lignes. */
function celluleGrimpeur(mise: Mise, l: LigneNp, enfant: boolean, x: number, milieu: number) {
  mise.texte(`${l.grimpeur.nom} ${l.grimpeur.prenom}`, x + 5, milieu + 2.5, 8.5, mise.grasse)
  mise.texte(equipeEtGroupe(l, enfant), x + 5, milieu - 8, 7, mise.normale, GRIS)
}

/** Fiche complète en ligne(s), NP en rouge gras (R41o). */
function celluleFiche(mise: Mise, l: LigneNp, donnees: DonneesControleNp, x: number, largeur: number, milieu: number) {
  const morceaux = elementsFiche(l.fiche, donnees.categorie)
  const sep = ' · '
  const lignes: (typeof morceaux)[] = [[]]
  let courant = 0
  for (const m of morceaux) {
    const w = (m.np ? mise.grasse : mise.normale).widthOfTextAtSize(m.texte + sep, 7.5)
    if (courant + w > largeur - 10 && lignes.at(-1)!.length) {
      lignes.push([])
      courant = 0
    }
    lignes.at(-1)!.push(m)
    courant += w
  }
  lignes.slice(0, 2).forEach((lg, k) => {
    let cx = x + 5
    const y = lignes.length === 1 ? milieu - 3 : milieu + 2.5 - k * 10
    lg.forEach((m, j) => {
      const police = m.np ? mise.grasse : mise.normale
      mise.texte(m.texte, cx, y, 7.5, police, m.np ? ROUGE : NOIR)
      cx += police.widthOfTextAtSize(m.texte, 7.5)
      if (j < lg.length - 1) {
        mise.texte(sep, cx, y, 7.5, mise.normale, GRIS)
        cx += mise.normale.widthOfTextAtSize(sep, 7.5)
      }
    })
  })
}

function attendusSection(s: SectionNp): string {
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
  if (s.type === 'niveau') {
    return `${s.voies.length ? `Voies : ${s.voies.join(' ; ')} · ` : ''}${pluriel(s.attendus, 'grimpeur')} sur ce niveau`
  }
  return `${pluriel(s.attendus, 'engagé')}${s.type === 'voies' ? ' · les voies manquantes comptent 0' : ''}`
}

/** PDF « par niveau » pour l'admin (R41r). */
export async function rendrePdfNpParNiveau(donnees: DonneesControleNp, genere: Date): Promise<Uint8Array> {
  const { pdf, mise } = await ouvrir(donnees)
  const { sections, nbLignes } = controleNp(donnees.entree)
  const enfant = donnees.categorie === 'enfant'
  const H_LIGNE = 28

  mise.nouvellePage()
  mise.texte('Contrôle des NP par niveau – vérification admin', M, mise.y - 16, 17, mise.grasse)
  mise.y -= 32
  mise.paragraphe(
    `${nbLignes} ligne(s) à vérifier. À la clôture, toute voie ou tout bloc sans résultat saisi est automatiquement noté NP ` +
      '(sans auteur de saisie) ; pour une voie enfant, le NP signifie qu’aucune voie du niveau n’a été saisie. ' +
      'Les NP de vitesse sont saisis par le juge. Chaque section liste les grimpeurs concernés avec leur fiche complète ; ' +
      'la colonne Signal met en avant les cas les plus suspects.',
  )
  mise.y -= 10

  // Récapitulatif (R41r b).
  mise.texte('Récapitulatif', M, mise.y - 11, 11, mise.grasse)
  mise.y -= 20
  const recap: Colonne[] = [
    { titre: 'Élément', largeur: 180 },
    { titre: 'Lignes', largeur: 80 },
    { titre: 'Attendus', largeur: UTILE - 260 },
  ]
  mise.enteteTableau(recap)
  sections.forEach((s, i) => {
    if (!mise.place(16)) {
      mise.nouvellePage()
      mise.enteteTableau(recap)
    }
    if (i % 2) mise.rect(M, mise.y - 16, UTILE, 16, FOND_ALT)
    mise.texte(s.titre, M + 5, mise.y - 11, 8.5, mise.grasse)
    mise.texte(String(s.lignes.length), M + 185, mise.y - 11, 8.5, mise.normale)
    mise.texte(attendusSection(s), M + 265, mise.y - 11, 8, mise.normale, GRIS)
    mise.y -= 16
  })
  mise.y -= 14

  // Sections (R41r c).
  const colonnes: Colonne[] = [
    { titre: 'Grimpeur', largeur: 150 },
    { titre: 'Club', largeur: 132 },
    { titre: 'Fiche complète du grimpeur', largeur: 290 },
    { titre: 'Signal', largeur: 115 },
    { titre: 'Correction', largeur: UTILE - 687 },
  ]
  for (const s of sections) {
    if (!mise.place(40 + 16 + H_LIGNE)) mise.nouvellePage()
    mise.rect(M, mise.y - 34, UTILE, 34, FOND_SECTION)
    mise.texte(`${s.titre} – ${s.lignes.length} NP`, M + 8, mise.y - 15, 12, mise.grasse)
    mise.texte(attendusSection(s), M + 8, mise.y - 28, 8, mise.normale, GRIS)
    mise.y -= 40
    mise.enteteTableau(colonnes)
    s.lignes.forEach((l, n) => {
      if (!mise.place(H_LIGNE)) {
        mise.nouvellePage()
        mise.texte(`${s.titre} (suite)`, M, mise.y - 12, 11, mise.grasse)
        mise.y -= 18
        mise.enteteTableau(colonnes)
      }
      if (n % 2) mise.rect(M, mise.y - H_LIGNE, UTILE, H_LIGNE, FOND_ALT)
      const milieu = mise.y - H_LIGNE / 2
      let x = M
      celluleGrimpeur(mise, l, enfant, x, milieu)
      x += colonnes[0].largeur
      const club = couper(l.grimpeur.clubNom, mise.normale, 7.5, colonnes[1].largeur - 10)
      club.slice(0, 2).forEach((t, k) =>
        mise.texte(t, x + 5, club.length === 1 ? milieu - 3 : milieu + 2.5 - k * 10, 7.5, mise.normale),
      )
      x += colonnes[1].largeur
      celluleFiche(mise, l, donnees, x, colonnes[2].largeur, milieu)
      x += colonnes[2].largeur
      if (l.signal) mise.texte(l.signal.texte, x + 5, milieu - 3, 7.5, mise.grasse, COULEUR_SIGNAL[l.signal.niveau])
      x += colonnes[3].largeur
      mise.trait(x + 6, L - M - 6, mise.y - H_LIGNE + 7)
      mise.trait(M, L - M, mise.y - H_LIGNE)
      mise.y -= H_LIGNE
    })
    mise.y -= 14
  }

  mise.piedsDePage(genere)
  return pdf.save()
}

/** Cellule de PDF club : une ou deux lignes, surlignée si NP (R41s c). */
type Case = { lignes: string[]; np?: boolean }

/** Colonnes de voies d'un grimpeur pour le PDF club (R41s b). */
function casesVoies(l: LigneNp, enfant: boolean): Case[] {
  if (!enfant) {
    const n = l.fiche.nbVoies
    return [{ lignes: [`${n}/6`], np: n < 6 }]
  }
  const groupe = l.grimpeur.groupeDepart
  const niveaux = groupe && (GROUPES_DEPART as readonly string[]).includes(groupe) ? voiesDuGroupeDepart(groupe) : []
  const cases: Case[] = niveaux.map((niveau) => {
    const v = l.fiche.voies.find((x) => x.niveau === niveau)
    if (!v) return { lignes: [niveau, '–'] }
    return v.issue === 'np'
      ? { lignes: [`${niveau} (${v.cotation})`, 'NP – rien saisi'], np: true }
      : { lignes: [v.libelle, libelleIssue(v.issue)] }
  })
  while (cases.length < 3) cases.push({ lignes: ['–'] })
  return cases
}

/** PDF d'un club, à envoyer à ses coachs (R41s) ; `null` si le club n'a aucune ligne. */
export async function rendrePdfNpClub(
  donnees: DonneesControleNp,
  clubId: string,
  genere: Date,
): Promise<{ octets: Uint8Array; clubNom: string } | null> {
  const club = lignesNpParClub(controleNp(donnees.entree)).find((c) => c.clubId === clubId)
  if (!club) return null
  const { pdf, mise } = await ouvrir(donnees)
  const enfant = donnees.categorie === 'enfant'
  const avecVitesse = donnees.entree.avecVitesse
  const blocs = [...donnees.entree.blocs].sort((a, b) => a.ordre - b.ordre)
  const H_LIGNE = 32

  const fixes: Colonne[] = [
    { titre: 'Grimpeur', largeur: 165 },
    ...blocs.map((b) => ({ titre: `Bloc ${b.code}`, largeur: 72 })),
    ...(enfant
      ? [1, 2, 3].map((i) => ({ titre: `Voie niveau ${i}`, largeur: 100 }))
      : [{ titre: 'Voies', largeur: 60 }]),
    ...(avecVitesse ? [{ titre: 'Vitesse', largeur: 64 }] : []),
  ]
  const occupe = fixes.reduce((n, c) => n + c.largeur, 0)
  const colonnes: Colonne[] = [...fixes, { titre: 'Correction', largeur: Math.max(60, UTILE - occupe) }]

  const nbNp = club.lignes.reduce((n, l) => n + elementsFiche(l.fiche, donnees.categorie).filter((e) => e.np).length, 0)
  const entete = (premiere: boolean) => {
    mise.nouvellePage()
    mise.texte(`Contrôle des NP – ${club.clubNom}`, M, mise.y - 16, 17, mise.grasse)
    mise.y -= 30
    if (premiere) {
      mise.paragraphe(
        `${club.lignes.length} grimpeur(s) concerné(s), ${nbNp} case(s) à vérifier. À la clôture de la rencontre, toute voie ` +
          'ou tout bloc sans résultat saisi a été automatiquement noté NP (non présenté, 0 point) : une case NP signifie donc ' +
          'qu’aucun résultat n’a été saisi – vraie non-présentation ou oubli de saisie. Merci de vérifier chaque case surlignée ; ' +
          'si l’enfant a bien grimpé, notez le résultat réel (Top, Prise valorisée, Échec, palier du bloc, ou la voie grimpée) ' +
          'dans la colonne Correction, puis renvoyez ce document à l’organisateur. Les NP de vitesse ont été saisis par le juge.',
      )
      mise.y -= 6
    }
    mise.enteteTableau(colonnes)
  }

  entete(true)
  club.lignes.forEach((l, n) => {
    if (!mise.place(H_LIGNE)) entete(false)
    if (n % 2) mise.rect(M, mise.y - H_LIGNE, UTILE, H_LIGNE, FOND_ALT)
    const milieu = mise.y - H_LIGNE / 2
    const v = l.fiche.vitesse
    const cases: Case[] = [
      ...l.fiche.blocs.map((b): Case =>
        b.issue === null || b.issue === 'np'
          ? { lignes: [b.issue === null ? 'non saisi' : 'NP'], np: true }
          : b.issue === 'palier'
            ? { lignes: ['Palier', b.palier ?? ''] }
            : { lignes: [libelleIssue(b.issue)] },
      ),
      ...casesVoies(l, enfant),
      ...(avecVitesse
        ? [
            v.etat === 'temps' && v.temps !== null
              ? { lignes: [formaterTemps(v.temps)] }
              : v.etat === 'chute'
                ? { lignes: ['Chute'] }
                : { lignes: [v.etat === 'np' ? 'NP' : 'Non saisie', '(juge)'], np: true },
          ]
        : []),
    ]
    let x = M
    celluleGrimpeur(mise, l, enfant, x, milieu)
    x += colonnes[0].largeur
    cases.forEach((c, i) => {
      const w = colonnes[i + 1].largeur
      if (c.np) mise.rect(x + 1, mise.y - H_LIGNE + 1, w - 2, H_LIGNE - 2, FOND_NP)
      c.lignes.forEach((t, k) => {
        const rouge = c.np && (t.startsWith('NP') || t === 'non saisi' || t === 'Non saisie' || /^\d\/6$/.test(t))
        const y = c.lignes.length === 1 ? milieu - 3 : milieu + 2.5 - k * 10
        mise.texte(t, x + 5, y, 8.5, rouge ? mise.grasse : mise.normale, rouge ? ROUGE : NOIR)
      })
      x += w
    })
    mise.trait(x + 6, L - M - 6, mise.y - H_LIGNE + 8)
    mise.trait(M, L - M, mise.y - H_LIGNE)
    mise.y -= H_LIGNE
  })

  mise.piedsDePage(genere)
  return { octets: await pdf.save(), clubNom: club.clubNom }
}
