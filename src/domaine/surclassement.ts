// Domaine pur — surclassement d'un grimpeur enfant en ado (spec #21). Un
// surclassement vaut pour une saison (spec #1 R37) ; il ouvre la catégorie ado
// en plus de l'enfant, jamais l'adulte. Sa révocation retire le grimpeur des
// rencontres ado à venir (① / ②) et conserve tout ce qui a été disputé (③ et
// après) : les classements ne réexaminent jamais l'éligibilité (R16).

import { compter } from './accord'
import {
  ageEnSaison,
  anneeSaison,
  estEligibleCategorie,
  type BornesAge,
  type Categorie,
  type Phase,
} from './rencontre'

/** Saisons proposées à l'accord : la courante (par défaut) puis la suivante (R2). */
export function saisonsSurclassement(aujourdhuiISO: string): [number, number] {
  const courante = anneeSaison(aujourdhuiISO)
  return [courante, courante + 1]
}

/** Vrai si l'âge en saison est strictement inférieur à l'âge de bascule (R3). */
export function estSurclassable(anneeNaissance: number, saison: number, bornes: BornesAge): boolean {
  return ageEnSaison(anneeNaissance, saison) < bornes.ageBascule
}

/** Motif du refus d'un accord (R3, R4), ou `null` si l'accord est possible. */
export function refusAccordSurclassement(p: {
  anneeNaissance: number
  saison: number
  bornes: BornesAge
  dejaActif: boolean
}): string | null {
  if (!estSurclassable(p.anneeNaissance, p.saison, p.bornes)) {
    return 'Ce grimpeur est déjà éligible en ado pour cette saison.'
  }
  if (p.dejaActif) return 'Ce grimpeur est déjà surclassé pour cette saison.'
  return null
}

/** Une ligne d'historique de surclassement (R11, R19). */
export type LigneSurclassement = {
  saison: number
  accordeLe: string
  revoqueLe: string | null
}

/** Le surclassement actif (non révoqué) de la saison, ou `null` (R4, R5, R11). */
export function surclassementActif<T extends LigneSurclassement>(
  lignes: readonly T[],
  saison: number,
): T | null {
  return lignes.find((l) => l.saison === saison && l.revoqueLe === null) ?? null
}

/**
 * Éligibilité d'un grimpeur à une rencontre (spec #1 R34) étendue par le
 * surclassement : un surclassé de la saison est aussi éligible ado (R7), jamais
 * adulte (R8).
 */
export function estEligibleRencontre(
  anneeNaissance: number,
  categorie: Categorie,
  saison: number,
  bornes: BornesAge,
  surclasse: boolean,
): boolean {
  return (
    estEligibleCategorie(anneeNaissance, categorie, saison, bornes) ||
    (surclasse && categorie === 'ado')
  )
}

/** Un engagement (composition ou prêt) d'un grimpeur dans une rencontre. */
export type EngagementAdo = {
  rencontreId: string
  categorie: Categorie
  saison: number
  phase: Phase
  nature: 'composition' | 'pret'
}

/** Phases où la révocation retire le grimpeur (R12) ; au-delà, tout est conservé (R13). */
const PHASES_RETRAIT: readonly Phase[] = ['pre_competition', 'preparation']

/**
 * Engagements à retirer à la révocation d'un surclassement de la saison (R12) :
 * rencontres ado de cette saison en ① ou ②. Aucun si le grimpeur reste éligible
 * ado par son âge.
 */
export function selectionnerRetraits<T extends EngagementAdo>(
  engagements: readonly T[],
  saison: number,
  eligibleAdoParAge: boolean,
): T[] {
  if (eligibleAdoParAge) return []
  return engagements.filter(
    (e) => e.categorie === 'ado' && e.saison === saison && PHASES_RETRAIT.includes(e.phase),
  )
}

/** Message de succès d'une révocation, avec le nombre de rencontres quittées (R15). */
export function messageRevocation(grimpeur: string, nbRencontres: number): string {
  if (nbRencontres === 0) return 'Surclassement révoqué. Aucun engagement ado à venir.'
  return `Surclassement révoqué. ${grimpeur} a été retiré de ${compter(nbRencontres, 'rencontre')} ado à venir.`
}
