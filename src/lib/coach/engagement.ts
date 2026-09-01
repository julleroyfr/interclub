import 'server-only'

import { anneeSaison, bornesSaison, type Categorie, type Phase } from '@/domaine/rencontre'
import { createClient } from '@/lib/supabase/server'

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

/** Phases où le coach peut éditer l'engagement (R16) : pré-compétition + préparation. */
function estEditable(phase: Phase): boolean {
  return phase === 'pre_competition' || phase === 'preparation'
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

/** Grimpeur composé dans une équipe (R9/R12). */
export type MembreEquipe = {
  grimpeurId: string
  nom: string
  prenom: string
  /** Groupe de départ (rencontres enfant, R19) ; `null` = « à définir ». */
  groupeDepart: string | null
  /** Vrai si le grimpeur est prêté d'un autre club (R13/R36). */
  prete: boolean
  clubOrigineNom: string | null
}

/** Équipe du club engagée dans une rencontre, avec sa composition (R9). */
export type EquipeEngagee = {
  id: string
  nom: string
  membres: MembreEquipe[]
}

/** Grimpeur du roster proposé à l'ajout (R12) ; `dejaEngage` désactive R14. */
export type OptionGrimpeur = {
  id: string
  nom: string
  prenom: string
  dejaEngage: boolean
}

/** Détail d'engagement d'une rencontre pour le club du coach (R9–R14). */
export type EngagementRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurNom: string
  editable: boolean
  equipes: EquipeEngagee[]
  /** Roster du club, avec l'état « déjà engagé dans cette rencontre » (R14). */
  roster: OptionGrimpeur[]
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

  const { data: rencontre, error: errR } = await supabase
    .from('rencontre')
    .select('id, date_rencontre, categorie, phase, club_porteur_id')
    .eq('id', rencontreId)
    .maybeSingle()
  if (errR) throw errR
  if (!rencontre) return null

  const [clubRes, equipesRes, rosterRes] = await Promise.all([
    supabase.from('club').select('nom').eq('id', rencontre.club_porteur_id as string).maybeSingle(),
    supabase
      .from('equipe')
      .select('id, nom, composition(grimpeur_id, groupe_depart)')
      .eq('rencontre_id', rencontreId)
      .eq('club_id', clubId)
      .order('nom'),
    supabase
      .from('grimpeur')
      .select('id, nom, prenom')
      .eq('club_id', clubId)
      .order('nom')
      .order('prenom'),
  ])
  if (equipesRes.error) throw equipesRes.error
  if (rosterRes.error) throw rosterRes.error

  // Grimpeurs référencés dans les compositions (dont d'éventuels prêtés d'un
  // autre club) → une seule lecture pour nom/prénom/club d'origine.
  const idsCompo = new Set<string>()
  for (const e of equipesRes.data ?? []) {
    for (const c of (e.composition as { grimpeur_id: string }[] | null) ?? []) {
      idsCompo.add(c.grimpeur_id)
    }
  }
  const grimpeursCompo =
    idsCompo.size === 0
      ? []
      : ((
          await supabase
            .from('grimpeur')
            .select('id, nom, prenom, club_id')
            .in('id', [...idsCompo])
        ).data ?? [])

  const infoGrimpeur = new Map<string, { nom: string; prenom: string; clubId: string }>()
  for (const g of grimpeursCompo) {
    infoGrimpeur.set(g.id as string, {
      nom: g.nom as string,
      prenom: g.prenom as string,
      clubId: g.club_id as string,
    })
  }
  const nomClubs = new Map<string, string>()
  const clubIdsPrete = [...infoGrimpeur.values()].map((g) => g.clubId).filter((id) => id !== clubId)
  if (clubIdsPrete.length > 0) {
    const { data } = await supabase.from('club').select('id, nom').in('id', clubIdsPrete)
    for (const c of data ?? []) nomClubs.set(c.id as string, c.nom as string)
  }

  const dejaEngages = new Set<string>(idsCompo)

  const equipes: EquipeEngagee[] = (equipesRes.data ?? []).map((e) => ({
    id: e.id as string,
    nom: e.nom as string,
    membres: ((e.composition as { grimpeur_id: string; groupe_depart: string | null }[] | null) ?? [])
      .map((c) => {
        const info = infoGrimpeur.get(c.grimpeur_id)
        const prete = !!info && info.clubId !== clubId
        return {
          grimpeurId: c.grimpeur_id,
          nom: info?.nom ?? '(inconnu)',
          prenom: info?.prenom ?? '',
          groupeDepart: c.groupe_depart ?? null,
          prete,
          clubOrigineNom: prete ? (nomClubs.get(info!.clubId) ?? '(autre club)') : null,
        }
      })
      .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom)),
  }))

  const roster: OptionGrimpeur[] = (rosterRes.data ?? []).map((g) => ({
    id: g.id as string,
    nom: g.nom as string,
    prenom: g.prenom as string,
    dejaEngage: dejaEngages.has(g.id as string),
  }))

  return {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie: rencontre.categorie as Categorie,
    phase: rencontre.phase as Phase,
    clubPorteurNom: (clubRes.data?.nom as string) ?? '(club inconnu)',
    editable: estEditable(rencontre.phase as Phase),
    equipes,
    roster,
  }
}
