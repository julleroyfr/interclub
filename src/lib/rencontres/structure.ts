import 'server-only'

import type { TypeEpreuve, TypeVoie } from '@/domaine/gabarit'
import type { Categorie, Phase } from '@/domaine/rencontre'
import { createClient } from '@/lib/supabase/server'

// Lecture de la structure d'une rencontre (épreuves + voies/blocs/vitesse) pour
// l'écran de configuration (R36). Lecture via le client `authenticated` : la RLS
// `*_select_authenticated` (admin, ou phase résultats publics) autorise l'admin ;
// les grants `authenticated` sur voie_difficulte/bloc/bloc_palier sont posés par
// la migration 202608281000.

export type VoieDifficulteRencontreVue = {
  id: string
  niveau: string
  typeVoie: TypeVoie
  cotation: string
  points: number
  pointsPriseValorisee: number | null
  pointsZone1: number | null
  pointsZone2: number | null
  ordre: number
}

export type BlocPalierRencontreVue = {
  id: string
  libelle: string
  points: number
  ordre: number
}

export type BlocRencontreVue = {
  id: string
  code: string
  ordre: number
  paliers: BlocPalierRencontreVue[]
}

export type VoieVitesseRencontreVue = {
  id: string
  numero: number
  libelle: string | null
}

export type EpreuveRencontreVue = {
  id: string
  type: TypeEpreuve
  voiesDifficulte: VoieDifficulteRencontreVue[]
  blocs: BlocRencontreVue[]
}

export type StructureRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurNom: string
  epreuves: EpreuveRencontreVue[]
  voiesVitesse: VoieVitesseRencontreVue[]
}

/**
 * Charge une rencontre et toute sa structure (épreuves, voies, blocs + paliers,
 * voies de vitesse). Renvoie `null` si la rencontre est introuvable.
 * À appeler derrière la garde admin.
 */
export async function getStructureRencontre(id: string): Promise<StructureRencontre | null> {
  const supabase = await createClient()

  const { data: rencontre, error: errR } = await supabase
    .from('rencontre')
    .select('id, date_rencontre, categorie, phase, club_porteur_id')
    .eq('id', id)
    .maybeSingle()
  if (errR) throw errR
  if (!rencontre) return null

  const { data: club } = await supabase
    .from('club')
    .select('nom')
    .eq('id', rencontre.club_porteur_id as string)
    .maybeSingle()

  const { data: epreuves, error: errE } = await supabase
    .from('epreuve')
    .select('id, type')
    .eq('rencontre_id', id)
    .order('type')
  if (errE) throw errE

  const epreuveIds = (epreuves ?? []).map((e) => e.id as string)

  const vide = { data: [] as Record<string, unknown>[], error: null }
  const [
    { data: voies, error: errV },
    { data: blocs, error: errB },
    { data: vitesses, error: errVV },
  ] = await Promise.all([
    epreuveIds.length === 0
      ? Promise.resolve(vide)
      : supabase
          .from('voie_difficulte')
          .select(
            'id, epreuve_id, niveau, type_voie, cotation, points, points_prise_valorisee, points_zone1, points_zone2, ordre',
          )
          .in('epreuve_id', epreuveIds)
          .order('ordre'),
    epreuveIds.length === 0
      ? Promise.resolve(vide)
      : supabase
          .from('bloc')
          .select('id, epreuve_id, code, ordre')
          .in('epreuve_id', epreuveIds)
          .order('ordre'),
    supabase
      .from('voie_vitesse')
      .select('id, numero, libelle')
      .eq('rencontre_id', id)
      .order('numero'),
  ])
  // Ne jamais avaler une erreur d'accès (ex. grant/RLS manquant) : elle
  // masquerait la structure derrière un « 0 » trompeur.
  if (errV) throw errV
  if (errB) throw errB
  if (errVV) throw errVV

  const blocIds = (blocs ?? []).map((b) => b.id as string)
  const { data: paliers, error: errP } =
    blocIds.length === 0
      ? { data: [] as Record<string, unknown>[], error: null }
      : await supabase
          .from('bloc_palier')
          .select('id, bloc_id, libelle, points, ordre')
          .in('bloc_id', blocIds)
          .order('ordre')
  if (errP) throw errP

  return {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie: rencontre.categorie as Categorie,
    phase: rencontre.phase as Phase,
    clubPorteurNom: (club?.nom as string) ?? '(club inconnu)',
    epreuves: (epreuves ?? []).map((e) => ({
      id: e.id as string,
      type: e.type as TypeEpreuve,
      voiesDifficulte: (voies ?? [])
        .filter((v) => v.epreuve_id === e.id)
        .map((v) => ({
          id: v.id as string,
          niveau: v.niveau as string,
          typeVoie: v.type_voie as TypeVoie,
          cotation: v.cotation as string,
          points: v.points as number,
          pointsPriseValorisee: (v.points_prise_valorisee as number | null) ?? null,
          pointsZone1: (v.points_zone1 as number | null) ?? null,
          pointsZone2: (v.points_zone2 as number | null) ?? null,
          ordre: v.ordre as number,
        })),
      blocs: (blocs ?? [])
        .filter((b) => b.epreuve_id === e.id)
        .map((b) => ({
          id: b.id as string,
          code: b.code as string,
          ordre: b.ordre as number,
          paliers: (paliers ?? [])
            .filter((p) => p.bloc_id === b.id)
            .map((p) => ({
              id: p.id as string,
              libelle: p.libelle as string,
              points: p.points as number,
              ordre: p.ordre as number,
            })),
        })),
    })),
    voiesVitesse: (vitesses ?? []).map((vv) => ({
      id: vv.id as string,
      numero: vv.numero as number,
      libelle: (vv.libelle as string | null) ?? null,
    })),
  }
}
