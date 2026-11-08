import { inflateSync } from 'node:zlib'

// Extraction du texte d'un PDF produit par pdf-lib (spec #15) : polices
// standard (Helvetica, encodage WinAnsi ≈ latin-1), texte écrit en chaînes
// hexadécimales `<…> Tj` dans des flux compressés (Flate). Suffit pour vérifier
// qu'un nom figure dans l'export, sans dépendance supplémentaire.

/** Fragments de texte du PDF, dans l'ordre d'écriture. */
export function textePdf(octets: Buffer): string[] {
  const brut = octets.toString('latin1')
  const fragments: string[] = []
  const flux = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = flux.exec(brut))) {
    const debut = m.index + m[0].length
    const fin = brut.indexOf('endstream', debut)
    if (fin < 0) break
    let contenu: string
    try {
      contenu = inflateSync(octets.subarray(debut, fin)).toString('latin1')
    } catch {
      continue // flux non compressé ou binaire (police, image) : ignoré
    }
    for (const t of contenu.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      fragments.push(Buffer.from(t[1]!, 'hex').toString('latin1'))
    }
    flux.lastIndex = fin
  }
  return fragments
}
