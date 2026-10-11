// Génère le PDF des guides utilisateur (docs/guides/**) à diffuser.
//
//   node scripts/guides/generer-pdf.mjs                      # tous les guides
//   node scripts/guides/generer-pdf.mjs docs/guides/coach/guide-coach.md
//
// Markdown → HTML (marked) → PDF A4 (Chromium de Playwright). Le PDF est écrit à
// côté du Markdown (même nom, extension .pdf). Les parties réservées à l'équipe
// (bloc « Captures » de l'en-tête, section « Mettre à jour les captures ») sont
// retirées : le PDF s'adresse aux utilisateurs.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'
import { Marked } from 'marked'

/** Guides à générer : ceux passés en argument, sinon tous les docs/guides/<rôle>/guide-*.md. */
function guides() {
  if (process.argv.length > 2) return process.argv.slice(2).map((f) => resolve(f))
  const racine = resolve('docs/guides')
  return readdirSync(racine, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(racine, d.name))
        .filter((f) => /^guide-.*\.md$/.test(f))
        .map((f) => join(racine, d.name, f)),
    )
}

/** Retire ce qui ne concerne que l'équipe projet. */
function pourUtilisateurs(md) {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^>\s*\*\*Captures\*\*[\s\S]*?(?=\n\n)/m, '')
    .replace(/\n>\s*\n(?=\n)/g, '\n')
    .replace(/\n## Mettre à jour les captures[\s\S]*$/, '\n')
}

/** Ancre façon GitHub, pour que les liens du sommaire fonctionnent. */
function ancre(texte) {
  return texte
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const contenu = this.parser.parseInline(tokens)
      return `<h${depth} id="${ancre(contenu)}">${contenu}</h${depth}>\n`
    },
  },
})

async function genererPdf(cheminMd) {
  const dossierMd = dirname(cheminMd)
    const cheminPdf = cheminMd.replace(/\.md$/, '.pdf')

    let corps = await marked.parse(pourUtilisateurs(readFileSync(cheminMd, 'utf8')))
  // Images relatives → URL file:// absolues (le HTML est rendu depuis un dossier temporaire).
  corps = corps.replace(/src="(?!https?:|file:|data:)([^"]+)"/g, (_, src) => {
    return `src="${pathToFileURL(join(dossierMd, src)).href}"`
  })

  // Typographie française : espaces insécables autour de « » et avant : ; ? !
  // (hors balises), pour éviter un guillemet ou un deux-points seul en début de ligne.
  corps = corps.replace(/>([^<]+)</g, (_, texte) =>
    `>${texte.replace(/« /g, '« ').replace(/ ([»:;?!])/g, ' $1')}<`,
  )

  // Chaque capture est regroupée avec le tableau qui la suit (cf. .bloc). Une
  // capture large (format ordinateur, width ≥ 600) passe au-dessus de son tableau.
  corps = corps.replace(/(<img [^>]*>)\s*(<table>[\s\S]*?<\/table>)?/g, (_, img, table = '') => {
    const largeur = Number(img.match(/width="(\d+)"/)?.[1] ?? 0)
    return `<div class="bloc${largeur >= 600 ? ' large' : ''}">${img}${table}</div>`
  })

  const titre = corps.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '') ?? 'Guide'
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const html = `<!doctype html>
  <html lang="fr">
  <head>
  <meta charset="utf-8">
  <title>${titre}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
      font-size: 10.5pt; line-height: 1.5; color: #1b2430; margin: 0;
    }
    h1 { font-size: 24pt; color: #0b5d70; margin: 0 0 4mm; }
    .edition { color: #5b6878; margin: 0 0 8mm; }
    h2 {
      font-size: 16pt; color: #0b5d70; margin: 0 0 4mm; padding-bottom: 2mm;
      border-bottom: 2px solid #22d3ee; break-before: page;
    }
    h3 { font-size: 12.5pt; color: #12384a; margin: 6mm 0 2mm; break-after: avoid; }
    p, ul, ol { margin: 0 0 3mm; }
    li { margin-bottom: 1mm; }
    a { color: #0b7285; text-decoration: none; }
    code { font-family: Consolas, monospace; font-size: 9.5pt; background: #eef3f6; padding: 0 3px; border-radius: 3px; }
    blockquote {
      margin: 0 0 6mm; padding: 3mm 5mm; background: #ecfbfe;
      border-left: 4px solid #22d3ee; border-radius: 0 6px 6px 0;
    }
    blockquote p { margin: 0; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.5pt; break-inside: avoid; }
    th, td { border: 1px solid #d5dde5; padding: 1.5mm 2.5mm; text-align: left; vertical-align: top; }
    th { background: #eef3f6; }
    td:first-child { white-space: nowrap; }
    /* Capture à gauche, tableau des actions à droite, jamais coupés par un saut de page. */
    .bloc { display: flex; gap: 7mm; align-items: flex-start; margin: 0 0 4mm; break-inside: avoid; }
    .bloc table { flex: 1; margin: 0; }
    img {
      flex: none; width: auto !important; max-width: 64mm; max-height: 125mm;
      border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,.25);
    }
    /* Capture large (ordinateur) : pleine largeur, tableau en dessous. */
    .bloc.large { flex-direction: column; gap: 4mm; }
    .bloc.large img { max-width: 100%; max-height: 165mm; }
    .bloc.large table { width: 100%; }
    /* Le sommaire suit le titre, sans saut de page. */
    h2#sommaire { break-before: avoid; }
  </style>
  </head>
  <body>
  ${corps.replace(/(<\/h1>)/, `$1\n<p class="edition">Édition du ${date}</p>`)}
  </body>
  </html>`

  const dossierTmp = mkdtempSync(join(tmpdir(), 'guide-pdf-'))
  const cheminHtml = join(dossierTmp, 'guide.html')
  writeFileSync(cheminHtml, html)

  const navigateur = await chromium.launch()
  try {
    const page = await navigateur.newPage()
    await page.goto(pathToFileURL(cheminHtml).href, { waitUntil: 'load' })
    await page.pdf({
      path: cheminPdf,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:8pt;color:#5b6878;padding:0 16mm;display:flex;justify-content:space-between;font-family:Segoe UI,sans-serif">
        <span>${titre}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    })
  } finally {
    await navigateur.close()
    rmSync(dossierTmp, { recursive: true, force: true })
  }

  console.log(`PDF généré : ${cheminPdf}`)
}

for (const cheminMd of guides()) await genererPdf(cheminMd)

