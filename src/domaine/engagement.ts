// Domaine pur — engagement d'un club en rencontre (spec #5 « Espace Coach »).
// Équipes, compositions et groupe de départ. Pas d'accès Supabase : uniquement
// les invariants métier vérifiés avant écriture (la RLS T6 reste la frontière
// ultime). Le périmètre-club, le gating de phase et l'unicité en base sont
// garantis côté Supabase ; ici on valide ce qui est purement calculable.

import { NIVEAUX_MOULINETTE, NIVEAUX_TETE } from './gabarit'

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
 * Dérive les 3 voies de niveau croissant qu'un enfant enchaîne à partir de son
 * groupe de départ (R20), en suivant l'échelle `M1→M4 puis T1→T10`. Lance
 * `GroupeDepartInvalideError` si le groupe n'est pas un départ valide (hors
 * échelle, ou trop haut pour laisser 3 voies — `T9`/`T10`, R19).
 */
export function voiesDuGroupeDepart(groupe: string): Niveau[] {
  const i = (GROUPES_DEPART as readonly string[]).indexOf(groupe)
  if (i === -1) {
    throw new GroupeDepartInvalideError(
      `Groupe de départ invalide : « ${groupe} ». Valeurs acceptées : ${GROUPES_DEPART.join(', ')} (R19).`,
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
      "Un grimpeur d'un autre club ne peut être ajouté que s'il est prêté au club (prêt réservé à l'admin, R13).",
    )
  }
  if (ajout.dejaEngagesRencontre.includes(ajout.grimpeurId)) {
    throw new EngagementInvalideError(
      'Ce grimpeur est déjà engagé dans une autre équipe pour cette rencontre (R14).',
    )
  }
  if (ajout.membresActuels.length >= EFFECTIF_EQUIPE_MAX) {
    throw new EngagementInvalideError(
      `L'effectif d'une équipe est plafonné à ${EFFECTIF_EQUIPE_MAX} grimpeurs (R15).`,
    )
  }
}
