// Domaine pur — engagement d'un club en rencontre (spec #5 « Espace Coach »).
// Équipes, compositions et groupe de départ. Pas d'accès Supabase : uniquement
// les invariants métier vérifiés avant écriture (la RLS T6 reste la frontière
// ultime). Le périmètre-club, le gating de phase et l'unicité en base sont
// garantis côté Supabase ; ici on valide ce qui est purement calculable.

import { NIVEAUX_MOULINETTE, NIVEAUX_TETE } from './gabarit'
import type { Phase } from './rencontre'

/** Nature de la session d'un coach (spec #2 : compte permanent ou session QR). */
export type TypeCoach = 'permanent' | 'temporaire'

/**
 * Le coach peut-il modifier l'engagement de son club (R16) ? Coach permanent en
 * ① pré-compétition et ② préparation, coach temporaire en ② seulement ; figé pour
 * tous dès ③ (R17). Ouvre aussi le temps réel de l'écran d'engagement (spec #11
 * R7, rév. 2026-10-09).
 */
export function compositionModifiableParCoach(phase: Phase, type: TypeCoach): boolean {
  if (phase === 'preparation') return true
  return phase === 'pre_competition' && type === 'permanent'
}

/** Effectif maximal d'une équipe (règlement §6 ; spec #5 R15). */
export const EFFECTIF_EQUIPE_MAX = 8

/** Nombre de voies enchaînées par un enfant à partir de son groupe (R20). */
const NB_VOIES_GROUPE = 3

/**
 * Échelle ordonnée des niveaux de voie de difficulté (enfant) : moulinette puis
 * tête. Sert de support à la dérivation du groupe de départ (R20).
 */
export const ECHELLE_NIVEAUX = [...NIVEAUX_MOULINETTE, ...NIVEAUX_TETE] as const

export type Niveau = (typeof ECHELLE_NIVEAUX)[number]

/**
 * Groupes de départ sélectionnables (rencontres enfant, R19). Ce sont les
 * niveaux de l'échelle qui laissent au moins 3 voies croissantes ; les 2 derniers
 * (`T9`, `T10`) sont donc exclus — le dernier départ possible est `T8`.
 */
export const GROUPES_DEPART = ECHELLE_NIVEAUX.slice(
  0,
  ECHELLE_NIVEAUX.length - (NB_VOIES_GROUPE - 1),
)

/** Saisie invalide d'un engagement (nom d'équipe, ajout de grimpeur). */
export class EngagementInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngagementInvalideError'
  }
}

/** Groupe de départ hors de la liste sélectionnable (R19/R20). */
export class GroupeDepartInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroupeDepartInvalideError'
  }
}

/**
 * Normalise le nom d'une équipe (R4/R10) : espaces de bord retirés, espaces
 * internes réduits à un seul. Rejette un nom vide.
 */
export function normaliserNomEquipe(nom: string): string {
  const normalise = (nom ?? '').trim().replace(/\s+/g, ' ')
  if (!normalise) {
    throw new EngagementInvalideError("Le nom de l'équipe est obligatoire.")
  }
  return normalise
}

/**
 * Nom proposé par défaut pour une nouvelle équipe (R10bis) : « <club> N », N =
 * plus grand numéro `k ≥ 1` parmi les équipes nommées exactement « <club> k »
 * (après normalisation R4, sensible à la casse), + 1 ; 1 si aucune.
 */
export function nomEquipeParDefaut(clubNom: string, nomsExistants: readonly string[]): string {
  const club = (clubNom ?? '').trim().replace(/\s+/g, ' ')
  const prefixe = `${club} `
  let max = 0
  for (const nom of nomsExistants) {
    const n = (nom ?? '').trim().replace(/\s+/g, ' ')
    if (!n.startsWith(prefixe)) continue
    const suffixe = n.slice(prefixe.length)
    if (!/^[1-9]\d*$/.test(suffixe)) continue
    max = Math.max(max, Number(suffixe))
  }
  return `${prefixe}${max + 1}`
}

/** Minuscules sans accents, pour une comparaison tolérante (R12bis). */
function pourRecherche(texte: string): string {
  return (texte ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Filtre les grimpeurs proposés à l'ajout (R12bis) : chaque terme de la
 * recherche doit figurer dans le nom ou le prénom (casse et accents ignorés,
 * ordre libre). Recherche vide → tout le roster, ordre préservé.
 */
export function filtrerGrimpeursRecherche<G extends { nom: string; prenom: string }>(
  grimpeurs: readonly G[],
  recherche: string,
): G[] {
  const termes = pourRecherche(recherche).split(/\s+/).filter(Boolean)
  if (termes.length === 0) return [...grimpeurs]
  return grimpeurs.filter((g) => {
    const cible = pourRecherche(`${g.prenom} ${g.nom}`)
    return termes.every((t) => cible.includes(t))
  })
}

/**
 * Dérive les 3 voies de niveau croissant qu'un enfant enchaîne à partir de son
 * groupe de départ (R20), en suivant l'échelle `M1→M4 puis T1→T10`. Lance
 * `GroupeDepartInvalideError` si le groupe n'est pas un départ valide (hors
 * échelle, ou trop haut pour laisser 3 voies — `T9`/`T10`, R19).
 */
export function voiesDuGroupeDepart(groupe: string): Niveau[] {
  const i = (GROUPES_DEPART as readonly string[]).indexOf(groupe)
  if (i === -1) {
    throw new GroupeDepartInvalideError(
      `Groupe de départ invalide : « ${groupe} ». Valeurs acceptées : ${GROUPES_DEPART.join(', ')}.`,
    )
  }
  return ECHELLE_NIVEAUX.slice(i, i + NB_VOIES_GROUPE) as Niveau[]
}

/** Contexte d'un ajout de grimpeur à une équipe, à valider avant écriture. */
export type AjoutComposition = {
  /** Grimpeur candidat. */
  grimpeurId: string
  /** Club de rattachement du grimpeur. */
  grimpeurClubId: string
  /** Club de l'équipe d'accueil. */
  equipeClubId: string
  /** Grimpeurs déjà membres de l'équipe visée. */
  membresActuels: string[]
  /** Grimpeurs déjà engagés dans une autre équipe de la même rencontre. */
  dejaEngagesRencontre: string[]
  /** Vrai si un prêt admin actif met ce grimpeur à disposition du club (R36). */
  estPrete?: boolean
}

/**
 * Vérifie qu'un grimpeur peut être ajouté à une équipe (R13/R14/R15) :
 * - R13 : le grimpeur appartient au club de l'équipe, OU il est **prêté** au club
 *   par l'admin (`estPrete`, spec #1 R35/R36) — le coach le gère alors comme les
 *   siens ; sinon l'ajout d'un grimpeur hors club est refusé ;
 * - R14 : il n'est pas déjà engagé dans une autre équipe de la rencontre ;
 * - R15 : l'équipe n'a pas atteint le plafond de 8.
 * Lance `EngagementInvalideError` au premier invariant violé.
 */
export function verifierAjoutComposition(ajout: AjoutComposition): void {
  if (ajout.grimpeurClubId !== ajout.equipeClubId && !ajout.estPrete) {
    throw new EngagementInvalideError(
      "Un grimpeur d'un autre club ne peut être ajouté que s'il est prêté au club (prêt réservé à l'admin).",
    )
  }
  if (ajout.dejaEngagesRencontre.includes(ajout.grimpeurId)) {
    throw new EngagementInvalideError(
      'Ce grimpeur est déjà engagé dans une autre équipe pour cette rencontre.',
    )
  }
  if (ajout.membresActuels.length >= EFFECTIF_EQUIPE_MAX) {
    throw new EngagementInvalideError(
      `L'effectif d'une équipe est plafonné à ${EFFECTIF_EQUIPE_MAX} grimpeurs.`,
    )
  }
}

/** Refus d'un changement d'équipe hors club d'affectation ou hors rencontre (spec #3 R41d). */
export const MESSAGE_CHANGEMENT_HORS_CLUB =
  "Un grimpeur ne peut changer que pour une autre équipe de son club d'affectation, dans la même rencontre."

/** Équipe d'une rencontre, vue pour un changement d'équipe (spec #3 R41d). */
export type EquipeDeRencontre = { id: string; clubId: string; rencontreId: string }

/** Contexte d'un changement d'équipe, à valider avant écriture (spec #3 R41d). */
export type ChangementEquipe = {
  /** Équipe actuelle du grimpeur : son club est le club d'affectation. */
  equipeSource: EquipeDeRencontre
  /** Équipe visée, avec son effectif actuel. */
  equipeCible: EquipeDeRencontre & { effectif: number }
}

/**
 * Vérifie qu'un grimpeur peut changer d'équipe (spec #3 R41d) : vers une AUTRE
 * équipe de la même rencontre et du même club d'affectation (club de l'équipe
 * actuelle — club d'accueil pour un prêté ; jamais un autre club), dont
 * l'effectif reste sous le plafond (spec #5 R15). Le changement n'est pas un
 * retrait : le grimpeur reste engagé (spec #10 R18bis). Lance
 * `EngagementInvalideError` au premier invariant violé.
 */
export function verifierChangementEquipe({ equipeSource, equipeCible }: ChangementEquipe): void {
  if (equipeCible.id === equipeSource.id) {
    throw new EngagementInvalideError('Le grimpeur est déjà dans cette équipe.')
  }
  if (
    equipeCible.rencontreId !== equipeSource.rencontreId ||
    equipeCible.clubId !== equipeSource.clubId
  ) {
    throw new EngagementInvalideError(MESSAGE_CHANGEMENT_HORS_CLUB)
  }
  if (equipeCible.effectif >= EFFECTIF_EQUIPE_MAX) {
    throw new EngagementInvalideError(
      `L'effectif d'une équipe est plafonné à ${EFFECTIF_EQUIPE_MAX} grimpeurs.`,
    )
  }
}

/**
 * Équipes proposées pour un changement d'équipe (spec #3 R41d) : les autres
 * équipes du club d'affectation (club de l'équipe actuelle), dans l'ordre reçu.
 * Vide si le club n'a qu'une équipe — l'action n'est alors pas proposée.
 */
export function equipesCiblesChangement<E extends { id: string; clubId: string }>(
  equipesRencontre: readonly E[],
  equipeActuelleId: string,
): E[] {
  const actuelle = equipesRencontre.find((e) => e.id === equipeActuelleId)
  if (!actuelle) return []
  return equipesRencontre.filter((e) => e.clubId === actuelle.clubId && e.id !== actuelle.id)
}
