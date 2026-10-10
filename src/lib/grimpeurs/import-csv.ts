import 'server-only'

import type { DoublonCsv } from '@/domaine/import-csv-sans-licence'
import type { ErreurImport } from '@/domaine/import-licencies'

// Types partagés de l'import CSV sans licence (spec #18). Le compte-rendu (R17)
// agrège l'analyse pure (ignorés / erreurs / doublons) et l'écriture atomique
// (créés / déjà présents / ambigus, via la RPC `importer_grimpeurs_csv`).

/** Compte-rendu d'un import CSV (spec #18 R17). */
export type CompteRenduImportCsv = {
  club: string
  anneeReference: number
  seuilAnneeNaissance: number
  totalLignes: number
  crees: number
  dejaPresents: number
  ignoresHorsAge: number
  doublons: DoublonCsv[]
  /** Lignes invalides (R10) puis lignes au rapprochement ambigu (R13). */
  erreurs: ErreurImport[]
}

/** État renvoyé au formulaire d'import CSV (pour `useActionState`). */
export type EtatImportCsv = { erreur?: string; compteRendu?: CompteRenduImportCsv } | undefined
