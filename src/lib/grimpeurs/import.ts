import 'server-only'

import type { DoublonImport, ErreurImport } from '@/domaine/import-licencies'

// Types partagés de l'import des licenciés (spec #13). Le compte-rendu (R18)
// agrège le résultat de l'analyse pure (ignorés / erreurs / doublons) et celui
// de l'écriture atomique (créés / mis à jour / clubs créés, via la RPC).

/** Compte-rendu d'un import (spec #13 R18). */
export type CompteRenduImport = {
  anneeReference: number
  seuilAnneeNaissance: number
  totalLignes: number
  crees: number
  misAJour: number
  ignoresHorsAge: number
  clubsCrees: string[]
  erreurs: ErreurImport[]
  doublons: DoublonImport[]
}

/** État renvoyé au formulaire d'import (pour `useActionState`). */
export type EtatImport = { erreur?: string; compteRendu?: CompteRenduImport } | undefined
