import 'server-only'

import { type Phase } from '@/domaine/rencontre'
import {
  sectionsStatistiques,
  type ClubStat,
  type EnfantStat,
  type ResultatStat,
  type VitesseStat,
} from '@/domaine/statistiques-rencontre'
import { type Sexe } from '@/domaine/grimpeur'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { lireClubsAdmin, lireRencontreAdmin } from '@/lib/rencontres/lectures-admin'
import { lireToutesLesPages } from '@/lib/supabase/pagination'
import { createClient } from '@/lib/supabase/server'

// Données brutes des statistiques d'une rencontre enfant (spec #3 R41e–R41j) ;
// les calculs sont dans `@/domaine/statistiques-rencontre`. Lecture sous session
// ADMIN (branche `est_admin()` des RLS). La rencontre et les clubs sont des
// lectures partagées avec les autres panneaux (`cache`) ; le reste part en UNE
// vague, filtrée sur la rencontre par jointure. Les résultats ne sont lus qu'à
// partir de la ③ (avancement, bilan).

export type DonneesStatistiques = {
  phase: Phase
  clubs: ClubStat[]
  /** Enfants engagés, rattachés au club de leur équipe (club d'accueil si prêtés). */
  enfants: EnfantStat[]
  resultatsVoie: ResultatStat[]
  resultatsBloc: ResultatStat[]
  vitesses: VitesseStat[]
}

type Ligne = Record<string, unknown>
type Reponse = { data: Ligne[] | null; error: { message: string; code?: string } | null }

const pagine = (requete: (debut: number, fin: number) => unknown, quoi: string) =>
  lireToutesLesPages((debut, fin) => requete(debut, fin) as PromiseLike<Reponse>, quoi)

/** Relation embarquée (objet, ou tableau selon l'inférence de PostgREST). */
const embarque = (valeur: unknown): Ligne | null =>
  ((Array.isArray(valeur) ? valeur[0] : valeur) as Ligne | null | undefined) ?? null

/** Charge les données des statistiques ; `null` hors rencontre enfant (R41e). */
export async function chargerStatistiquesRencontre(
  rencontreId: string,
): Promise<DonneesStatistiques | null> {
  await exigerLectureAdmin('statistiques de la rencontre')
  const rencontre = await lireRencontreAdmin(rencontreId)
  if (!rencontre || rencontre.categorie !== 'enfant') return null
  const phase = rencontre.phase as Phase
  const { avancement, bilan } = sectionsStatistiques(phase)
  const avecResultats = avancement || bilan

  const supabase = await createClient()
  const resultats = (table: 'resultat_voie' | 'resultat_bloc') => {
    const jointure =
      table === 'resultat_voie'
        ? ['voie_difficulte!inner(epreuve!inner(rencontre_id))', 'voie_difficulte.epreuve.rencontre_id']
        : ['bloc!inner(epreuve!inner(rencontre_id))', 'bloc.epreuve.rencontre_id']
    return pagine(
      (debut, fin) =>
        supabase
          .from(table)
          .select(`id, grimpeur_id, issue, ${jointure[0]}`)
          .eq(jointure[1], rencontreId)
          .order('id')
          .range(debut, fin),
      table === 'resultat_voie' ? 'des résultats de voie' : 'des résultats de bloc',
    )
  }

  const [clubs, compositions, voies, blocs, vitesses] = await Promise.all([
    lireClubsAdmin(),
    pagine(
      (debut, fin) =>
        supabase
          .from('composition')
          .select('grimpeur_id, groupe_depart, equipe:equipe_id(club_id), grimpeur:grimpeur_id(sexe)')
          .eq('rencontre_id', rencontreId)
          .order('equipe_id')
          .order('grimpeur_id')
          .range(debut, fin),
      'des compositions',
    ),
    avecResultats ? resultats('resultat_voie') : [],
    avecResultats ? resultats('resultat_bloc') : [],
    avecResultats
      ? pagine(
          (debut, fin) =>
            supabase
              .from('temps_vitesse')
              .select('id, grimpeur_id, issue, epreuve!inner(rencontre_id)')
              .eq('epreuve.rencontre_id', rencontreId)
              .order('id')
              .range(debut, fin),
          'des résultats de vitesse',
        )
      : [],
  ])

  const versResultat = (l: Ligne): ResultatStat => ({
    grimpeurId: l.grimpeur_id as string,
    issue: l.issue as string,
  })
  return {
    phase,
    clubs: clubs.map((c) => ({ id: c.id as string, nom: c.nom as string })),
    enfants: compositions.map((c) => ({
      grimpeurId: c.grimpeur_id as string,
      clubId: embarque(c.equipe)?.club_id as string,
      sexe: (embarque(c.grimpeur)?.sexe as Sexe | null | undefined) ?? null,
      groupeDepart: (c.groupe_depart as string | null) ?? null,
    })),
    resultatsVoie: voies.map(versResultat),
    resultatsBloc: blocs.map(versResultat),
    vitesses: vitesses.map((v) => ({
      grimpeurId: v.grimpeur_id as string,
      issue: v.issue as VitesseStat['issue'],
    })),
  }
}
