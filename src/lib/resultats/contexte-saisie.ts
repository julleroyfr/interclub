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

/** Contexte d'une voie de difficulté : rencontre, épreuve, catégorie, phase, type. */
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
      .select('type_voie, epreuve_id')
      .eq('id', voieId)
      .maybeSingle(),
    'de la voie',
  )
  if (!voie) return null
  const ep = verifierLecture(
    await supabase
      .from('epreuve')
      .select('rencontre_id')
      .eq('id', voie.epreuve_id as string)
      .maybeSingle(),
    "de l'épreuve",
  )
  if (!ep) return null
  const r = verifierLecture(
    await supabase
      .from('rencontre')
      .select('categorie, phase')
      .eq('id', ep.rencontre_id as string)
      .maybeSingle(),
    'de la rencontre',
  )
  if (!r) return null
  return {
    rencontreId: ep.rencontre_id as string,
    epreuveId: voie.epreuve_id as string,
    categorie: r.categorie as Categorie,
    phase: r.phase as Phase,
    typeVoie: voie.type_voie as TypeVoie,
  }
}

/** Contexte d'un bloc : rencontre, phase. */
export async function chargerContexteBloc(
  supabase: Client,
  blocId: string,
): Promise<{ rencontreId: string; phase: Phase } | null> {
  const bloc = verifierLecture(
    await supabase
      .from('bloc')
      .select('epreuve_id')
      .eq('id', blocId)
      .maybeSingle(),
    'du bloc',
  )
  if (!bloc) return null
  const ep = verifierLecture(
    await supabase
      .from('epreuve')
      .select('rencontre_id')
      .eq('id', bloc.epreuve_id as string)
      .maybeSingle(),
    "de l'épreuve",
  )
  if (!ep) return null
  const r = verifierLecture(
    await supabase
      .from('rencontre')
      .select('phase')
      .eq('id', ep.rencontre_id as string)
      .maybeSingle(),
    'de la rencontre',
  )
  if (!r) return null
  return { rencontreId: ep.rencontre_id as string, phase: r.phase as Phase }
}

/**
 * Voies de l'épreuve ado déjà saisies pour ce grimpeur — base du contrôle
 * préalable du plafond de 6 (spec #6 R14 ; la base le garantit aussi).
 */
export async function voiesDejaSaisiesAdo(
  supabase: Client,
  epreuveId: string,
  grimpeurId: string,
): Promise<string[]> {
  const voiesEp = verifierLecture(
    await supabase
      .from('voie_difficulte')
      .select('id')
      .eq('epreuve_id', epreuveId),
    'des voies',
  )
  const idsEp = (voiesEp ?? []).map((v) => v.id as string)
  const existantes = verifierLecture(
    await supabase
      .from('resultat_voie')
      .select('voie_difficulte_id')
      .eq('grimpeur_id', grimpeurId)
      .in('voie_difficulte_id', idsEp),
    'des résultats de voie',
  )
  return (existantes ?? []).map((r) => r.voie_difficulte_id as string)
}
