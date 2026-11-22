import 'server-only'

import { type EntreeControleNp, type VitesseNp } from '@/domaine/controle-np'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { getStructureRencontre } from '@/lib/rencontres/structure'
import { lireToutesLesPages } from '@/lib/supabase/pagination'
import { createClient } from '@/lib/supabase/server'

// Données brutes du contrôle des NP et de l'aperçu de clôture (spec #3 R17bis,
// R41l–R41s) ; les calculs sont dans `@/domaine/controle-np`. Lecture sous
// session ADMIN (branche `est_admin()` des RLS). La structure est partagée avec
// le tableau de bord (`cache`) ; compositions et résultats partent en UNE vague,
// filtrés sur la rencontre par jointure. Une épreuve désactivée (spec #20 R36)
// n'est pas transmise au domaine.

export type DonneesControleNp = {
  rencontreId: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurNom: string
  entree: EntreeControleNp
}

type Ligne = Record<string, unknown>
type Reponse = { data: Ligne[] | null; error: { message: string; code?: string } | null }

const pagine = (requete: (debut: number, fin: number) => unknown, quoi: string) =>
  lireToutesLesPages((debut, fin) => requete(debut, fin) as PromiseLike<Reponse>, quoi)

/** Relation embarquée (objet, ou tableau selon l'inférence de PostgREST). */
const embarque = (valeur: unknown): Ligne | null =>
  ((Array.isArray(valeur) ? valeur[0] : valeur) as Ligne | null | undefined) ?? null

/**
 * Données de l'onglet « Contrôle des NP », présent seulement en ④/⑤ (R41k) ;
 * `null` dans les autres phases. Appelable en parallèle des autres lectures du
 * tableau de bord : la structure est lue une seule fois (`cache`).
 */
export async function chargerControleNpApresCloture(rencontreId: string): Promise<DonneesControleNp | null> {
  await exigerLectureAdmin('contrôle des NP')
  const structure = await getStructureRencontre(rencontreId)
  if (!structure || (structure.phase !== 'cloture' && structure.phase !== 'resultats_publics')) return null
  return chargerDonneesNp(rencontreId)
}

/** Charge les données du contrôle des NP ; `null` si la rencontre est introuvable. */
export async function chargerDonneesNp(rencontreId: string): Promise<DonneesControleNp | null> {
  await exigerLectureAdmin('contrôle des NP')
  const structure = await getStructureRencontre(rencontreId)
  if (!structure) return null

  const actives = structure.epreuves.filter((e) => e.active)
  const supabase = await createClient()
  const resultats = (table: 'resultat_voie' | 'resultat_bloc') => {
    const [colonnes, filtre] =
      table === 'resultat_voie'
        ? ['voie_difficulte_id, voie_difficulte!inner(epreuve!inner(rencontre_id))', 'voie_difficulte.epreuve.rencontre_id']
        : ['bloc_id, palier:palier_id(libelle), bloc!inner(epreuve!inner(rencontre_id))', 'bloc.epreuve.rencontre_id']
    return pagine(
      (debut, fin) =>
        supabase
          .from(table)
          .select(`id, grimpeur_id, issue, ${colonnes}`)
          .eq(filtre, rencontreId)
          .order('id')
          .range(debut, fin),
      table === 'resultat_voie' ? 'des résultats de voie' : 'des résultats de bloc',
    )
  }

  const [compositions, voies, blocs, vitesses] = await Promise.all([
    pagine(
      (debut, fin) =>
        supabase
          .from('composition')
          .select(
            'grimpeur_id, groupe_depart, equipe:equipe_id(nom, club_id, club:club_id(nom)), grimpeur:grimpeur_id(nom, prenom, club_id, club:club_id(nom))',
          )
          .eq('rencontre_id', rencontreId)
          .order('equipe_id')
          .order('grimpeur_id')
          .range(debut, fin),
      'des compositions',
    ),
    resultats('resultat_voie'),
    resultats('resultat_bloc'),
    pagine(
      (debut, fin) =>
        supabase
          .from('temps_vitesse')
          .select('id, grimpeur_id, issue, temps, epreuve!inner(rencontre_id)')
          .eq('epreuve.rencontre_id', rencontreId)
          .order('id')
          .range(debut, fin),
      'des résultats de vitesse',
    ),
  ])

  return {
    rencontreId,
    dateRencontre: structure.dateRencontre,
    categorie: structure.categorie,
    phase: structure.phase,
    clubPorteurNom: structure.clubPorteurNom,
    entree: {
      categorie: structure.categorie,
      avecVitesse: structure.voiesVitesse.length > 0 && actives.some((e) => e.type === 'vitesse'),
      blocs: actives.flatMap((e) => e.blocs.map((b) => ({ id: b.id, code: b.code, ordre: b.ordre }))),
      voies: actives.flatMap((e) =>
        e.voiesDifficulte.map((v) => ({
          id: v.id,
          niveau: v.niveau,
          libelle: v.libelle,
          cotation: v.cotation,
          ordre: v.ordre,
        })),
      ),
      grimpeurs: compositions.map((c) => {
        const equipe = embarque(c.equipe)
        const grimpeur = embarque(c.grimpeur)
        // Club de l'équipe (club d'accueil d'un prêté) ; équipe adulte sans club
        // (spec #20 R10) : club du grimpeur.
        const club = equipe?.club_id ? equipe : grimpeur
        return {
          grimpeurId: c.grimpeur_id as string,
          nom: (grimpeur?.nom as string) ?? '',
          prenom: (grimpeur?.prenom as string) ?? '',
          clubId: (club?.club_id as string) ?? '',
          clubNom: (embarque(club?.club)?.nom as string) ?? '',
          equipeNom: (equipe?.nom as string) ?? '',
          groupeDepart: (c.groupe_depart as string | null) ?? null,
        }
      }),
      resultatsVoie: voies.map((r) => ({
        grimpeurId: r.grimpeur_id as string,
        voieId: r.voie_difficulte_id as string,
        issue: r.issue as string,
      })),
      resultatsBloc: blocs.map((r) => ({
        grimpeurId: r.grimpeur_id as string,
        blocId: r.bloc_id as string,
        issue: r.issue as string,
        palier: (embarque(r.palier)?.libelle as string | undefined) ?? null,
      })),
      vitesses: vitesses.map((v) => ({
        grimpeurId: v.grimpeur_id as string,
        issue: v.issue as VitesseNp['issue'],
        temps: v.temps === null || v.temps === undefined ? null : Number(v.temps),
      })),
    },
  }
}
