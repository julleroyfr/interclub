import 'server-only'

import { type TypeVoie } from '@/domaine/gabarit'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import { verifierLecture } from '@/lib/supabase/lecture'
import { type createClient } from '@/lib/supabase/server'

// Lectures communes aux actions de saisie des résultats voie/bloc du coach
// (spec #6) et de l'admin (spec #9) — factorisées (revue du 2026-10-03, m7).
// Chaque action garde ses propres gardes (rôle, phase, périmètre) et messages.

/** Client Supabase du projet (schéma `interclub`). */
export type Client = Awaited<ReturnType<typeof createClient>>

/** Relation embarquée : objet ou tableau selon l'inférence du client. */
function premier(v: unknown): Record<string, unknown> | null {
  const x = Array.isArray(v) ? v[0] : v
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}

/**
 * Contexte d'une voie de difficulté : rencontre, épreuve, catégorie, phase, type.
 * Une seule lecture (épreuve et rencontre embarquées).
 */
export async function chargerContexteVoie(
  supabase: Client,
  voieId: string,
): Promise<
  | { rencontreId: string; epreuveId: string; categorie: Categorie; phase: Phase; typeVoie: TypeVoie }
  | null
> {
  const voie = verifierLecture(
    await supabase
      .from('voie_difficulte')
      .select('type_voie, epreuve_id, epreuve:epreuve_id(rencontre_id, rencontre:rencontre_id(categorie, phase))')
      .eq('id', voieId)
      .maybeSingle(),
    'de la voie',
  )
  const ep = premier(voie?.epreuve)
  const r = premier(ep?.rencontre)
  if (!voie || !ep || !r) return null
  return {
    rencontreId: ep.rencontre_id as string,
    epreuveId: voie.epreuve_id as string,
    categorie: r.categorie as Categorie,
    phase: r.phase as Phase,
    typeVoie: voie.type_voie as TypeVoie,
  }
}

/** Contexte d'un bloc : rencontre, phase. Une seule lecture (embarquées). */
export async function chargerContexteBloc(
  supabase: Client,
  blocId: string,
): Promise<{ rencontreId: string; phase: Phase } | null> {
  const bloc = verifierLecture(
    await supabase
      .from('bloc')
      .select('epreuve:epreuve_id(rencontre_id, rencontre:rencontre_id(phase))')
      .eq('id', blocId)
      .maybeSingle(),
    'du bloc',
  )
  const ep = premier(bloc?.epreuve)
  const r = premier(ep?.rencontre)
  if (!ep || !r) return null
  return { rencontreId: ep.rencontre_id as string, phase: r.phase as Phase }
}

/**
 * Voies de l'épreuve ado déjà saisies pour ce grimpeur — base du contrôle
 * préalable du plafond de 6 (spec #6 R14 ; la base le garantit aussi). Une seule
 * lecture (filtre sur l'épreuve par jointure).
 */
export async function voiesDejaSaisiesAdo(
  supabase: Client,
  epreuveId: string,
  grimpeurId: string,
): Promise<string[]> {
  const existantes = verifierLecture(
    await supabase
      .from('resultat_voie')
      .select('voie_difficulte_id, voie_difficulte!inner(epreuve_id)')
      .eq('grimpeur_id', grimpeurId)
      .eq('voie_difficulte.epreuve_id', epreuveId),
    'des résultats de voie',
  )
  return (existantes ?? []).map((r) => r.voie_difficulte_id as string)
}
