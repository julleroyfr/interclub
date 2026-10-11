import 'server-only'

import { anneeSaison, bornesSaison, type Categorie, type Phase } from '@/domaine/rencontre'
import {
  assemblerEngagementClub,
  type EngagementRencontre,
  estEditable,
  type GrimpeurLu,
} from '@/lib/coach/assemblage-engagement'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

export type {
  EngagementRencontre,
  EquipeEngagee,
  MembreEquipe,
  OptionGrimpeur,
} from '@/lib/coach/assemblage-engagement'

// Lecture de l'engagement d'un club en rencontre (spec #5 « Espace Coach ») :
// liste des rencontres (accueil, R6–R8) et détail d'une rencontre (équipes du
// club + compositions + roster, R9/R12). Lecture via le client `authenticated` :
// la RLS T6 (`equipe`/`composition`/`grimpeur` select) borne au périmètre du
// club du coach. À appeler derrière la garde coach.

/**
 * Ordre de priorité d'affichage des rencontres (R8) : la plus actionnable
 * d'abord — préparation (jour J) puis compétition, puis pré-compétition, enfin
 * les rencontres terminées.
 */
const PRIORITE_PHASE: Record<Phase, number> = {
  preparation: 0,
  competition: 1,
  pre_competition: 2,
  cloture: 3,
  resultats_publics: 4,
}

/** Rencontre listée sur l'accueil coach (R6/R8). */
export type RencontreCoach = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurNom: string
  nbEquipesClub: number
  nbGrimpeursClub: number
  /** Vrai en phase ① : le coach peut éditer l'engagement (R16). */
  editable: boolean
}

/**
 * Liste, pour le club du coach, les rencontres de la saison où il peut être ou
 * est engagé (R6), triées par priorité (compétition en cours → pré-compétition →
 * clôture → résultats publics, R8), avec le nombre d'équipes/grimpeurs du club.
 */
export async function listerRencontresCoach(options: {
  clubId: string
  aujourdhui: string
  saison?: number
}): Promise<RencontreCoach[]> {
  const supabase = await createClient()
  const annee = options.saison ?? anneeSaison(options.aujourdhui)
  const bornes = bornesSaison(annee)

  const [rencRes, clubsRes, eqRes] = await Promise.all([
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id')
      .gte('date_rencontre', bornes.debut)
      .lte('date_rencontre', bornes.fin),
    supabase.from('club').select('id, nom'),
    // Équipes du club (RLS : lecture périmètre club) + leurs compositions.
    supabase
      .from('equipe')
      .select('id, rencontre_id, composition(grimpeur_id)')
      .eq('club_id', options.clubId),
  ])
  if (rencRes.error) throw rencRes.error
  if (clubsRes.error) throw clubsRes.error
  if (eqRes.error) throw eqRes.error

  const nomParClub = new Map<string, string>()
  for (const c of clubsRes.data ?? []) nomParClub.set(c.id as string, c.nom as string)

  const nbEquipes = new Map<string, number>()
  const nbGrimpeurs = new Map<string, number>()
  for (const e of eqRes.data ?? []) {
    const rid = e.rencontre_id as string
    nbEquipes.set(rid, (nbEquipes.get(rid) ?? 0) + 1)
    const compos = (e.composition as { grimpeur_id: string }[] | null) ?? []
    nbGrimpeurs.set(rid, (nbGrimpeurs.get(rid) ?? 0) + compos.length)
  }

  return (rencRes.data ?? [])
    .map((r) => {
      const id = r.id as string
      const phase = r.phase as Phase
      return {
        id,
        dateRencontre: r.date_rencontre as string,
        categorie: r.categorie as Categorie,
        phase,
        clubPorteurNom: nomParClub.get(r.club_porteur_id as string) ?? '(club inconnu)',
        nbEquipesClub: nbEquipes.get(id) ?? 0,
        nbGrimpeursClub: nbGrimpeurs.get(id) ?? 0,
        editable: estEditable(phase),
      }
    })
    .sort((a, b) => {
      const pa = PRIORITE_PHASE[a.phase] - PRIORITE_PHASE[b.phase]
      if (pa !== 0) return pa
      // À priorité égale, la plus récente d'abord.
      return b.dateRencontre.localeCompare(a.dateRencontre)
    })
}

/**
 * Charge le détail d'engagement d'une rencontre pour le club donné : équipes du
 * club + compositions (avec grimpeurs prêtés, R13) et roster du club (R9/R12).
 * Renvoie `null` si la rencontre est introuvable. À appeler derrière la garde coach.
 */
export async function getEngagementRencontre(
  rencontreId: string,
  clubId: string,
): Promise<EngagementRencontre | null> {
  const supabase = await createClient()

  // UNE vague (lot 3 du plan « appels Supabase ») : la rencontre est lue avec le
  // reste (le filtre ne dépend que de `rencontreId` et `clubId`) ; noms des
  // clubs et fiches des grimpeurs composés ou prêtés sont embarqués.
  const [rencRes, clubRes, equipesRes, rosterRes, pretsRes] = await Promise.all([
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id, club:club_porteur_id(nom)')
      .eq('id', rencontreId)
      .maybeSingle(),
    // Club engagé (nom d'équipe par défaut, R10bis).
    supabase.from('club').select('id, nom').eq('id', clubId).maybeSingle(),
    supabase
      .from('equipe')
      .select(
        'id, nom, composition(grimpeur_id, groupe_depart, grimpeur:grimpeur_id(id, nom, prenom, club_id, club:club_id(nom)))',
      )
      .eq('rencontre_id', rencontreId)
      .eq('club_id', clubId)
      .order('nom'),
    supabase
      .from('grimpeur')
      .select('id, nom, prenom, annee_naissance')
      .eq('club_id', clubId)
      .order('nom')
      .order('prenom'),
    // Grimpeurs PRÊTÉS à ce club pour cette rencontre (R12/R13) — s'ajoutent au
    // roster comme des grimpeurs du club, avec badge « prêté · club d'origine ».
    supabase
      .from('pret')
      .select('grimpeur:grimpeur_id(id, nom, prenom, club_id, annee_naissance, club:club_id(nom))')
      .eq('rencontre_id', rencontreId)
      .eq('club_accueil_id', clubId),
  ])
  const rencontre = verifierLecture(rencRes, 'de la rencontre')
  if (!rencontre) return null

  // Noms des clubs : porteur + club engagé, puis clubs d'origine (embarqués).
  const nomClub = new Map<string, string>()
  const retenirClub = (id: unknown, club: unknown) => {
    const nom = embarque(club)?.nom
    if (typeof id === 'string' && typeof nom === 'string') nomClub.set(id, nom)
  }
  retenirClub(rencontre.club_porteur_id, rencontre.club)
  const clubEngage = verifierLecture(clubRes, 'du club')
  if (clubEngage) nomClub.set(clubEngage.id as string, clubEngage.nom as string)

  // Grimpeurs référencés dans les compositions (dont d'éventuels prêtés d'un
  // autre club) : nom, prénom et club d'origine, embarqués.
  const grimpeursCompo = new Map<string, Omit<GrimpeurLu, 'anneeNaissance'>>()
  const equipes = (verifierLecture(equipesRes, 'des équipes') ?? []).map((e) => {
    const compos = (e.composition as Record<string, unknown>[] | null) ?? []
    for (const c of compos) {
      const g = embarque(c.grimpeur)
      if (!g) continue
      retenirClub(g.club_id, g.club)
      grimpeursCompo.set(g.id as string, {
        id: g.id as string,
        nom: g.nom as string,
        prenom: g.prenom as string,
        clubId: g.club_id as string,
      })
    }
    return {
      id: e.id as string,
      nom: e.nom as string,
      composition: compos.map((c) => ({
        grimpeurId: c.grimpeur_id as string,
        groupeDepart: (c.groupe_depart as string | null) ?? null,
      })),
    }
  })

  // Grimpeurs prêtés (aplatis depuis la relation pret → grimpeur).
  const pretes: GrimpeurLu[] = (verifierLecture(pretsRes, 'des prêts') ?? [])
    .map((p) => embarque(p.grimpeur))
    .filter((g): g is Record<string, unknown> => g != null)
    .map((g) => {
      retenirClub(g.club_id, g.club)
      return versGrimpeurLu(g)
    })
  const roster = verifierLecture(rosterRes, 'du roster') ?? []

  return assemblerEngagementClub(
    {
      rencontre: {
        id: rencontre.id as string,
        dateRencontre: rencontre.date_rencontre as string,
        categorie: rencontre.categorie as Categorie,
        phase: rencontre.phase as Phase,
        clubPorteurId: rencontre.club_porteur_id as string,
      },
      nomClub,
      equipes,
      grimpeursCompo,
      rosterClub: roster.map((g) => versGrimpeurLu({ ...g, club_id: clubId })),
      pretes,
    },
    clubId,
  )
}

/** Relation embarquée (objet, ou tableau selon l'inférence de PostgREST). */
function embarque(valeur: unknown): Record<string, unknown> | null {
  return ((Array.isArray(valeur) ? valeur[0] : valeur) as Record<string, unknown> | null | undefined) ?? null
}

/** Ligne `grimpeur` lue en base → grimpeur de l'assemblage. */
export function versGrimpeurLu(g: Record<string, unknown>): GrimpeurLu {
  return {
    id: g.id as string,
    nom: g.nom as string,
    prenom: g.prenom as string,
    clubId: g.club_id as string,
    anneeNaissance: g.annee_naissance as number,
  }
}
