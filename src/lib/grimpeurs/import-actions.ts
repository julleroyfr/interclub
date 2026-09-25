'use server'

import { revalidatePath } from 'next/cache'

import {
  analyserImport,
  anneeReferenceParDefaut,
  type GrimpeurImport,
} from '@/domaine/import-licencies'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { FichierImportInvalideError, lireLignesXlsx } from './import-xlsx'
import { type EtatImport } from './import'

// Import des licenciés (spec #13). Server Action = surface joignable par POST
// direct : garde admin explicite (R1) + la RLS reste la frontière. L'écriture
// (clubs + upsert) passe par la RPC atomique `importer_licencies` (R16).

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Refuse l'appelant non-admin (R1), ou `null` si admin. */
async function refuserSiNonAdmin(): Promise<EtatImport | null> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut importer des licenciés (R1).' }
  }
  return null
}

// Traduit une erreur RPC/Postgres de l'écriture en message lisible (R16).
function messageErreurEcriture(code: string | undefined, message: string | undefined): string {
  if (message?.includes('acces_refuse')) {
    return 'Import refusé : accès réservé à un administrateur (R1).'
  }
  if (code === '23505') {
    return "Conflit d'unicité pendant l'écriture (licence ou nom de club). Aucun grimpeur importé (R16)."
  }
  if (code === '23514') {
    return 'Une valeur viole une contrainte (sexe, licence ou année). Aucun grimpeur importé (R16).'
  }
  return "L'import a échoué pendant l'écriture. Aucun grimpeur importé (R16). Réessayez."
}

export async function importerLicencies(
  _etatPrecedent: EtatImport,
  formData: FormData,
): Promise<EtatImport> {
  const refus = await refuserSiNonAdmin()
  if (refus) return refus

  // 1. Fichier (R3).
  const fichier = formData.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: 'Veuillez déposer un fichier .xlsx.' }
  }
  if (!fichier.name.toLowerCase().endsWith('.xlsx')) {
    return { erreur: 'Le fichier doit être au format .xlsx.' }
  }

  // 2. Année de référence — toujours l'année de fin de la saison courante (R6).
  const anneeReference = anneeReferenceParDefaut(aujourdhuiISO())

  // 3. Lecture du .xlsx en lignes (R4).
  let lignes
  try {
    lignes = await lireLignesXlsx(await fichier.arrayBuffer())
  } catch (e) {
    if (e instanceof FichierImportInvalideError) return { erreur: e.message }
    throw e
  }

  // 4. Analyse pure : filtre d'âge, validation, consolidation doublons (R15).
  const analyse = analyserImport(lignes, anneeReference)

  // 5. Écriture atomique via la RPC (R16). Rien à écrire → 0 créé / 0 maj.
  let crees = 0
  let misAJour = 0
  let clubsCrees: string[] = []
  if (analyse.aImporter.length > 0) {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('importer_licencies', {
      p_grimpeurs: analyse.aImporter.map(versPayload),
    })
    if (error) return { erreur: messageErreurEcriture(error.code, error.message) }
    const resultat = (data ?? {}) as {
      crees?: number
      mis_a_jour?: number
      clubs_crees?: string[]
    }
    crees = resultat.crees ?? 0
    misAJour = resultat.mis_a_jour ?? 0
    clubsCrees = resultat.clubs_crees ?? []
    revalidatePath('/admin/grimpeurs')
  }

  return {
    compteRendu: {
      anneeReference: analyse.anneeReference,
      seuilAnneeNaissance: analyse.seuilAnneeNaissance,
      totalLignes: lignes.length,
      crees,
      misAJour,
      ignoresHorsAge: analyse.ignoresHorsAge,
      clubsCrees,
      erreurs: analyse.erreurs,
      doublons: analyse.doublons,
    },
  }
}

// Grimpeur normalisé → objet JSON attendu par la RPC (colonnes snake_case).
function versPayload(g: GrimpeurImport) {
  return {
    nom: g.nom,
    prenom: g.prenom,
    annee_naissance: g.anneeNaissance,
    sexe: g.sexe,
    licence: g.licence,
    club: g.club,
  }
}
