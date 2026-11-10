import 'server-only'

import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Categorie } from '@/domaine/rencontre'
import type { TypeEpreuve, TypeVoie } from '@/domaine/gabarit'

// Lecture des gabarits via service_role (catalogue lu sans RLS, ADR 0003).

export type VoieDifficulteVue = {
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

export type BlocPalierVue = {
  id: string
  libelle: string
  points: number
  ordre: number
}

export type BlocVue = {
  id: string
  code: string
  ordre: number
  paliers: BlocPalierVue[]
}

export type VoieVitesseGabaritVue = {
  id: string
  libelle: string
  ordre: number
}

/** Un échelon du barème de vitesse par rang du gabarit (spec #3 R46). */
export type BaremeVitesseEchelonGabaritVue = {
  id: string
  rangMin: number
  /** `null` = « au-delà » (dernier échelon, sans borne haute). */
  rangMax: number | null
  points: number
  decrement: number
  ordre: number
}

/** Barème de vitesse d'une épreuve de gabarit (spec #3 R46) — `null` hors vitesse. */
export type BaremeVitesseGabaritVue = {
  gabaritEpreuveId: string
  pointsChute: number | null
  pointsNonPresentation: number | null
  echelons: BaremeVitesseEchelonGabaritVue[]
}

export type EpreuveGabaritVue = {
  id: string
  categorie: Categorie
  type: TypeEpreuve
  voiesDifficulte: VoieDifficulteVue[]
  blocs: BlocVue[]
  voiesVitesse: VoieVitesseGabaritVue[]
  /** Barème par rang pour l'épreuve de vitesse (R46) ; `null` sinon. */
  baremeVitesse: BaremeVitesseGabaritVue | null
}

type Ligne = Record<string, unknown>

/** Relation embarquée de cardinalité multiple, triée par `ordre`. */
function parOrdre(v: unknown): Ligne[] {
  return (Array.isArray(v) ? (v as Ligne[]) : []).sort(
    (a, b) => (a.ordre as number) - (b.ordre as number),
  )
}

/**
 * Gabarits complets des catégories demandées (toutes épreuves, voies, blocs avec
 * paliers, voies et barème de vitesse), en UNE lecture imbriquée (lot 6, P9).
 * Le plafond de 1000 lignes vaut pour chaque relation embarquée : un gabarit en
 * compte quelques dizaines.
 */
export async function listerGabarits(
  categories: Categorie[],
): Promise<Map<Categorie, EpreuveGabaritVue[]>> {
  await exigerLectureAdmin('gabarit de rencontre')
  const { data: epreuves, error } = await createAdminClient()
    .from('gabarit_epreuve')
    .select(
      `id, categorie, type, points_chute, points_non_presentation,
      gabarit_voie_difficulte(id, niveau, type_voie, cotation, points, points_prise_valorisee, points_zone1, points_zone2, ordre),
      gabarit_bloc(id, code, ordre, gabarit_bloc_palier(id, libelle, points, ordre)),
      gabarit_voie_vitesse(id, libelle, ordre),
      gabarit_bareme_vitesse_echelon(id, rang_min, rang_max, points, decrement, ordre)`,
    )
    .in('categorie', categories)
    .order('type')
  if (error) throw error

  const parCategorie = new Map<Categorie, EpreuveGabaritVue[]>(categories.map((c) => [c, []]))
  for (const e of epreuves ?? []) {
    parCategorie.get(e.categorie as Categorie)?.push(versEpreuveVue(e))
  }
  return parCategorie
}

function versEpreuveVue(e: Ligne): EpreuveGabaritVue {
  return {
    id: e.id as string,
    categorie: e.categorie as Categorie,
    type: e.type as TypeEpreuve,
    voiesDifficulte: parOrdre(e.gabarit_voie_difficulte)
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
    blocs: parOrdre(e.gabarit_bloc)
      .map((b) => ({
        id: b.id as string,
        code: b.code as string,
        ordre: b.ordre as number,
        paliers: parOrdre(b.gabarit_bloc_palier)
          .map((p) => ({
            id: p.id as string,
            libelle: p.libelle as string,
            points: p.points as number,
            ordre: p.ordre as number,
          })),
      })),
    voiesVitesse: parOrdre(e.gabarit_voie_vitesse)
      .map((vv) => ({
        id: vv.id as string,
        libelle: vv.libelle as string,
        ordre: vv.ordre as number,
      })),
    baremeVitesse:
      e.type === 'vitesse'
        ? {
            gabaritEpreuveId: e.id as string,
            pointsChute: (e.points_chute as number | null) ?? null,
            pointsNonPresentation: (e.points_non_presentation as number | null) ?? null,
            echelons: parOrdre(e.gabarit_bareme_vitesse_echelon).map((ech) => ({
              id: ech.id as string,
              rangMin: ech.rang_min as number,
              rangMax: (ech.rang_max as number | null) ?? null,
              points: ech.points as number,
              decrement: ech.decrement as number,
              ordre: ech.ordre as number,
            })),
          }
        : null,
  }
}
