'use server'

import { revalidatePath } from 'next/cache'

import {
  analyserImportCsv,
  FichierCsvInvalideError,
  lireCsv,
  type GrimpeurCsv,
} from '@/domaine/import-csv-sans-licence'
import { anneeReferenceParDefaut } from '@/domaine/import-licencies'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { type EtatImportCsv } from './import-csv'

// Import CSV sans licence (spec #18). Server Action = surface joignable par POST
// direct : garde admin explicite (R1) + la RLS reste la frontière. Rapprochement
// et licences générées sont faits dans la RPC atomique `importer_grimpeurs_csv`
// (R13, R14, R16).

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Traduit une erreur RPC/Postgres de l'écriture en message lisible (R16).
function messageErreurEcriture(message: string | undefined): string {
  if (message?.includes('acces_refuse')) {
    return 'Import refusé : accès réservé à un administrateur.'
  }
  if (message?.includes('club_introuvable')) {
    return 'Le club choisi est introuvable. Aucun grimpeur importé.'
  }
  if (message?.includes('plage_licences_epuisee')) {
    return 'Plus aucune licence générée disponible. Aucun grimpeur importé.'
  }
  return "L'import a échoué pendant l'écriture. Aucun grimpeur importé. Réessayez."
}

export async function importerGrimpeursCsv(
  _etatPrecedent: EtatImportCsv,
  formData: FormData,
): Promise<EtatImportCsv> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') {
    return { erreur: 'Seul un administrateur peut importer des grimpeurs.' }
  }

  // 1. Club cible (R3).
  const clubId = String(formData.get('clubId') ?? '')
  if (!clubId) return { erreur: 'Choisissez le club cible.' }

  // 2. Fichier (R4).
  const fichier = formData.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: 'Veuillez déposer un fichier .csv.' }
  }
  if (!fichier.name.toLowerCase().endsWith('.csv')) {
    return { erreur: 'Le fichier doit être au format .csv.' }
  }

  const supabase = await createClient()
  const { data: club } = await supabase.from('club').select('nom').eq('id', clubId).maybeSingle()
  if (!club) return { erreur: 'Le club choisi est introuvable.' }

  // 3. Lecture UTF-8 (un octet invalide devient U+FFFD, rejeté par R8b) — R5/R6.
  let lignes
  try {
    lignes = lireCsv(await fichier.text())
  } catch (e) {
    if (e instanceof FichierCsvInvalideError) return { erreur: e.message }
    throw e
  }

  // 4. Analyse pure : validation, filtre d'âge, doublons du fichier (R16).
  const analyse = analyserImportCsv(lignes, anneeReferenceParDefaut(aujourdhuiISO()))

  // 5. Écriture atomique via la RPC (R16). Rien à écrire → 0 créé.
  let crees = 0
  let dejaPresents = 0
  let ambigus: { ligne: number; identite: string; raison: string }[] = []
  if (analyse.aImporter.length > 0) {
    const { data, error } = await supabase.rpc('importer_grimpeurs_csv', {
      p_club_id: clubId,
      p_grimpeurs: analyse.aImporter.map(versPayload),
    })
    if (error) return { erreur: messageErreurEcriture(error.message) }
    const resultat = (data ?? {}) as {
      crees?: number
      deja_presents?: number
      ambigus?: { ligne: number; identite: string; nb: number }[]
    }
    crees = resultat.crees ?? 0
    dejaPresents = resultat.deja_presents ?? 0
    ambigus = (resultat.ambigus ?? []).map((a) => ({
      ligne: a.ligne,
      identite: a.identite,
      raison: `Rapprochement ambigu : ${a.nb} grimpeurs du club correspondent.`,
    }))
    revalidatePath('/admin/grimpeurs')
  }

  return {
    compteRendu: {
      club: club.nom as string,
      anneeReference: analyse.anneeReference,
      seuilAnneeNaissance: analyse.seuilAnneeNaissance,
      totalLignes: lignes.length,
      crees,
      dejaPresents,
      ignoresHorsAge: analyse.ignoresHorsAge,
      doublons: analyse.doublons,
      erreurs: [...analyse.erreurs, ...ambigus].sort((a, b) => a.ligne - b.ligne),
    },
  }
}

// Grimpeur normalisé → objet JSON attendu par la RPC (colonnes snake_case).
function versPayload(g: GrimpeurCsv) {
  return {
    ligne: g.ligne,
    nom: g.nom,
    prenom: g.prenom,
    sexe: g.sexe,
    annee_naissance: g.anneeNaissance,
  }
}
