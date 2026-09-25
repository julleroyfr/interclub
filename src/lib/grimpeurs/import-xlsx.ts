import 'server-only'

import ExcelJS from 'exceljs'

import { COLONNES_IMPORT, type LigneImport } from '@/domaine/import-licencies'

// Adaptateur non pur (spec #13 R15) : lit le binaire .xlsx et le transforme en
// lignes de cellules texte (A→F) exploitables par le domaine pur. Aucune règle
// métier ici : uniquement l'extraction et le repérage de la ligne d'en-têtes.

/** Fichier .xlsx non exploitable (feuille absente, en-têtes introuvables). */
export class FichierImportInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FichierImportInvalideError'
  }
}

// Deux chiffres pour un formatage de date sûr.
function deuxChiffres(n: number): string {
  return String(n).padStart(2, '0')
}

// Texte d'une cellule. Les dates réelles Excel sont reformatées en JJ/MM/AAAA
// (le domaine attend ce format, R9) ; sinon on prend le texte formaté brut.
function celluleTexte(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v instanceof Date) {
    return `${deuxChiffres(v.getUTCDate())}/${deuxChiffres(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`
  }
  return (cell.text ?? '').trim()
}

// Une ligne dont les 6 premières cellules sont toutes vides est ignorée.
function ligneVide(cellules: string[]): boolean {
  return cellules.every((c) => c === '')
}

/**
 * Lit la 1re feuille d'un classeur `.xlsx` (R4) et renvoie les lignes de données
 * (après la ligne d'en-têtes), chacune portant son **numéro de ligne réel** dans
 * la feuille (traçabilité des erreurs, R10/R18) et ses 6 cellules A→F.
 */
export async function lireLignesXlsx(buffer: ArrayBuffer): Promise<LigneImport[]> {
  const classeur = new ExcelJS.Workbook()
  try {
    await classeur.xlsx.load(buffer)
  } catch {
    throw new FichierImportInvalideError(
      'Fichier .xlsx illisible (format non reconnu ou corrompu).',
    )
  }

  const feuille = classeur.worksheets[0]
  if (!feuille) {
    throw new FichierImportInvalideError('Le classeur ne contient aucune feuille.')
  }

  // Repérer la ligne d'en-têtes : première ligne dont la colonne A vaut « Nom ».
  let ligneEntetes = 0
  feuille.eachRow((row, numero) => {
    if (ligneEntetes === 0 && celluleTexte(row.getCell(1)).toLowerCase() === 'nom') {
      ligneEntetes = numero
    }
  })
  if (ligneEntetes === 0) {
    throw new FichierImportInvalideError(
      `En-têtes introuvables : la 1re feuille doit contenir une ligne « ${COLONNES_IMPORT.join(' | ')} ».`,
    )
  }

  const lignes: LigneImport[] = []
  feuille.eachRow((row, numero) => {
    if (numero <= ligneEntetes) return
    const cellules = [1, 2, 3, 4, 5, 6].map((col) => celluleTexte(row.getCell(col)))
    if (ligneVide(cellules)) return
    lignes.push({ ligne: numero, cellules })
  })

  return lignes
}
