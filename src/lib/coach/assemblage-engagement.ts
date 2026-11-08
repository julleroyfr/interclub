import {
  anneeSaison,
  type BornesAge,
  type Categorie,
  type Phase,
} from '@/domaine/rencontre'
import { estEligibleRencontre } from '@/domaine/surclassement'

// Assemblage PUR de l'engagement d'un club en rencontre (spec #5 R9–R14, R34) à
// partir de lectures déjà faites. Partagé par le loader coach (un club) et le
// loader admin (tous les clubs, lectures groupées) : la mise en forme est la même,
// seule la façon de lire diffère.

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
  /** Vrai si surclassé pour la saison, en rencontre ado (badge, spec #21 R20). */
  surclasse: boolean
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
  /** Vrai si proposé au titre d'un prêt admin actif (R13) ; sinon grimpeur du club. */
  prete: boolean
  /** Club d'origine si prêté, pour le badge « prêté · club ». */
  clubOrigineNom: string | null
  /** Vrai si proposé au titre d'un surclassement (badge, spec #21 R20). */
  surclasse: boolean
}

/** Détail d'engagement d'une rencontre pour le club du coach (R9–R14). */
export type EngagementRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  clubPorteurNom: string
  /** Nom du club engagé (celui du coach), pour le nom d'équipe par défaut (R10bis). */
  clubNom: string
  editable: boolean
  equipes: EquipeEngagee[]
  /** Roster du club, avec l'état « déjà engagé dans cette rencontre » (R14). */
  roster: OptionGrimpeur[]
}

/** Grimpeur lu en base, tel que l'assemblage en a besoin. */
export type GrimpeurLu = {
  id: string
  nom: string
  prenom: string
  clubId: string
  anneeNaissance: number
}

/** Lectures nécessaires à l'assemblage de l'engagement d'UN club. */
export type DonneesEngagementClub = {
  /** Âges configurés des catégories enfant/ado (spec #1 R34bis). */
  bornesAge: BornesAge
  rencontre: {
    id: string
    dateRencontre: string
    categorie: Categorie
    phase: Phase
    clubPorteurId: string
  }
  /** Noms des clubs (porteur, club engagé, clubs d'origine des prêtés). */
  nomClub: ReadonlyMap<string, string>
  /** Équipes du club pour la rencontre, triées par nom. */
  equipes: {
    id: string
    nom: string
    composition: { grimpeurId: string; groupeDepart: string | null }[]
  }[]
  /** Grimpeurs composés dans ces équipes (prêtés d'un autre club inclus). */
  grimpeursCompo: ReadonlyMap<string, Omit<GrimpeurLu, 'anneeNaissance'>>
  /** Grimpeurs du club, triés par nom puis prénom (non filtrés par catégorie). */
  rosterClub: GrimpeurLu[]
  /** Grimpeurs prêtés à ce club pour la rencontre (non filtrés par catégorie). */
  pretes: GrimpeurLu[]
  /** Surclassements ACTIFS des grimpeurs lus, toutes saisons (spec #21). */
  surclassements: readonly { grimpeurId: string; saison: number }[]
}

/** Phases où le coach peut éditer l'engagement (R16) : pré-compétition + préparation. */
export function estEditable(phase: Phase): boolean {
  return phase === 'pre_competition' || phase === 'preparation'
}

/**
 * Assemble l'engagement d'un club (R9–R14) ; roster filtré par catégorie (R34),
 * surclassés de la saison compris en ado (spec #21 R7).
 */
export function assemblerEngagementClub(
  d: DonneesEngagementClub,
  clubId: string,
): EngagementRencontre {
  const { rencontre } = d
  const saison = anneeSaison(rencontre.dateRencontre)
  // Surclassés de la saison : éligibles ado en plus de l'enfant (spec #21 R7) ;
  // le badge n'a de sens qu'en rencontre ado (R20).
  const surclassesSaison = new Set(
    d.surclassements.filter((s) => s.saison === saison).map((s) => s.grimpeurId),
  )
  const badge = (id: string) => rencontre.categorie === 'ado' && surclassesSaison.has(id)
  const estEligible = (g: GrimpeurLu) =>
    estEligibleRencontre(
      g.anneeNaissance,
      rencontre.categorie,
      saison,
      d.bornesAge,
      surclassesSaison.has(g.id),
    )
  const nomClub = (id: string, defaut: string) => d.nomClub.get(id) ?? defaut

  const dejaEngages = new Set<string>()
  for (const e of d.equipes) for (const c of e.composition) dejaEngages.add(c.grimpeurId)

  const equipes: EquipeEngagee[] = d.equipes.map((e) => ({
    id: e.id,
    nom: e.nom,
    membres: e.composition
      .map((c) => {
        const info = d.grimpeursCompo.get(c.grimpeurId)
        const prete = !!info && info.clubId !== clubId
        return {
          grimpeurId: c.grimpeurId,
          nom: info?.nom ?? '(inconnu)',
          prenom: info?.prenom ?? '',
          groupeDepart: c.groupeDepart,
          prete,
          clubOrigineNom: prete ? nomClub(info!.clubId, '(autre club)') : null,
          surclasse: badge(c.grimpeurId),
        }
      })
      .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom)),
  }))

  const roster: OptionGrimpeur[] = [
    ...d.rosterClub
      .filter(estEligible)
      .map((g) => ({
        id: g.id,
        nom: g.nom,
        prenom: g.prenom,
        dejaEngage: dejaEngages.has(g.id),
        prete: false,
        clubOrigineNom: null,
        surclasse: badge(g.id),
      })),
    ...d.pretes
      .filter(estEligible)
      .map((g) => ({
        id: g.id,
        nom: g.nom,
        prenom: g.prenom,
        dejaEngage: dejaEngages.has(g.id),
        prete: true,
        clubOrigineNom: nomClub(g.clubId, '(autre club)'),
        surclasse: badge(g.id),
      })),
  ]

  return {
    id: rencontre.id,
    dateRencontre: rencontre.dateRencontre,
    categorie: rencontre.categorie,
    phase: rencontre.phase,
    clubPorteurNom: nomClub(rencontre.clubPorteurId, '(club inconnu)'),
    clubNom: nomClub(clubId, '(club inconnu)'),
    editable: estEditable(rencontre.phase),
    equipes,
    roster,
  }
}
