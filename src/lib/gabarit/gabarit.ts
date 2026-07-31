import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Categorie } from '@/domaine/rencontre'
import type { TypeEpreuve, TypeVoie } from '@/domaine/gabarit'

// Lecture des gabarits via service_role (catalogue lu sans RLS, ADR 0003).

export type VoieDifficulteVue = {
  id: string
  niveau: string
  typeVoie: TypeVoie
  cotation: string
  ordre: number
}

export type BlocVue = {
  id: string
  code: string
  ordre: number
}

export type VoieVitesseGabaritVue = {
  id: string
  libelle: string
  ordre: number
}

export type EpreuveGabaritVue = {
  id: string
  categorie: Categorie
  type: TypeEpreuve
  voiesDifficulte: VoieDifficulteVue[]
  blocs: BlocVue[]
  voiesVitesse: VoieVitesseGabaritVue[]
}

/** Gabarit complet d'une catégorie (toutes épreuves + voies). */
export async function listerGabarit(categorie: Categorie): Promise<EpreuveGabaritVue[]> {
  const admin = createAdminClient()

  const { data: epreuves, error: errEpreuves } = await admin
    .from('gabarit_epreuve')
    .select('id, categorie, type')
    .eq('categorie', categorie)
    .order('type')
  if (errEpreuves) throw errEpreuves

  if (!epreuves || epreuves.length === 0) return []

  const ids = epreuves.map((e) => e.id as string)

  const [
    { data: voies, error: errVoies },
    { data: blocs, error: errBlocs },
    { data: vitesses, error: errVitesses },
  ] = await Promise.all([
    admin
      .from('gabarit_voie_difficulte')
      .select('id, gabarit_epreuve_id, niveau, type_voie, cotation, ordre')
      .in('gabarit_epreuve_id', ids)
      .order('ordre'),
    admin
      .from('gabarit_bloc')
      .select('id, gabarit_epreuve_id, code, ordre')
      .in('gabarit_epreuve_id', ids)
      .order('ordre'),
    admin
      .from('gabarit_voie_vitesse')
      .select('id, gabarit_epreuve_id, libelle, ordre')
      .in('gabarit_epreuve_id', ids)
      .order('ordre'),
  ])
  if (errVoies) throw errVoies
  if (errBlocs) throw errBlocs
  if (errVitesses) throw errVitesses

  return epreuves.map((e) => ({
    id: e.id as string,
    categorie: e.categorie as Categorie,
    type: e.type as TypeEpreuve,
    voiesDifficulte: (voies ?? [])
      .filter((v) => v.gabarit_epreuve_id === e.id)
      .map((v) => ({
        id: v.id as string,
        niveau: v.niveau as string,
        typeVoie: v.type_voie as TypeVoie,
        cotation: v.cotation as string,
        ordre: v.ordre as number,
      })),
    blocs: (blocs ?? [])
      .filter((b) => b.gabarit_epreuve_id === e.id)
      .map((b) => ({
        id: b.id as string,
        code: b.code as string,
        ordre: b.ordre as number,
      })),
    voiesVitesse: (vitesses ?? [])
      .filter((vv) => vv.gabarit_epreuve_id === e.id)
      .map((vv) => ({
        id: vv.id as string,
        libelle: vv.libelle as string,
        ordre: vv.ordre as number,
      })),
  }))
}
