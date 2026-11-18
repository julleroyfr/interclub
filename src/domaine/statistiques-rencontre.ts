// Statistiques du tableau de bord d'une rencontre enfant (spec #3 R41e–R41j) :
// effectifs, répartition par groupe de départ, clubs avec des enfants sans
// groupe, avancement de la saisie (③) et bilan (④/⑤). Fonctions pures : le
// chargeur lit les compositions et les résultats ; un enfant prêté arrive déjà
// rattaché à son club d'accueil (club de son équipe).

import { GROUPES_DEPART, libelleGroupeDepart } from './engagement'
import { type Sexe } from './grimpeur'
import { type Phase } from './rencontre'

/** Enfant engagé dans la rencontre, rattaché au club de son équipe. */
export type EnfantStat = {
  grimpeurId: string
  clubId: string
  sexe: Sexe | null
  groupeDepart: string | null
}

export type ClubStat = { id: string; nom: string }

/** Résultat de voie ou de bloc réduit à ce que comptent les statistiques. */
export type ResultatStat = { grimpeurId: string; issue: string }

export type VitesseStat = { grimpeurId: string; issue: 'temps' | 'chute' | 'non_presentation' }

/** Sections du panneau selon la phase (R41h alerte dès la ③, R41i en ③, R41j en ④/⑤). */
export function sectionsStatistiques(phase: Phase): {
  alerteSansGroupe: boolean
  avancement: boolean
  bilan: boolean
} {
  const apres = phase === 'cloture' || phase === 'resultats_publics'
  return {
    alerteSansGroupe: phase === 'competition' || apres,
    avancement: phase === 'competition',
    bilan: apres,
  }
}

/**
 * Regroupe les enfants par club et applique `calcul` à chaque club ayant au
 * moins un enfant ; résultat trié par nom de club.
 */
function parClub<T>(
  enfants: readonly EnfantStat[],
  clubs: readonly ClubStat[],
  calcul: (enfantsDuClub: EnfantStat[]) => T,
): ({ clubId: string; clubNom: string } & T)[] {
  const groupes = new Map<string, EnfantStat[]>()
  for (const e of enfants) {
    const liste = groupes.get(e.clubId)
    if (liste) liste.push(e)
    else groupes.set(e.clubId, [e])
  }
  const nom = new Map(clubs.map((c) => [c.id, c.nom]))
  return [...groupes.entries()]
    .map(([clubId, liste]) => ({ clubId, clubNom: nom.get(clubId) ?? clubId, ...calcul(liste) }))
    .sort((a, b) => a.clubNom.localeCompare(b.clubNom, 'fr'))
}

type Effectif = { filles: number; garcons: number; nonRenseigne: number; total: number }

function compterEffectif(enfants: readonly EnfantStat[]): Effectif {
  const filles = enfants.filter((e) => e.sexe === 'F').length
  const garcons = enfants.filter((e) => e.sexe === 'H').length
  return { filles, garcons, nonRenseigne: enfants.length - filles - garcons, total: enfants.length }
}

/** Effectifs total, par sexe et par club (R41f). */
export function effectifs(enfants: readonly EnfantStat[], clubs: readonly ClubStat[]) {
  return { total: compterEffectif(enfants), parClub: parClub(enfants, clubs, compterEffectif) }
}

/** Répartition par groupe de départ M1…T8, groupes vides à 0, plus « à définir » (R41g). */
export function repartitionParGroupe(enfants: readonly EnfantStat[]) {
  return {
    groupes: GROUPES_DEPART.map((groupe) => ({
      groupe,
      libelle: libelleGroupeDepart(groupe),
      nombre: enfants.filter((e) => e.groupeDepart === groupe).length,
    })),
    aDefinir: enfants.filter((e) => !e.groupeDepart).length,
  }
}

/** Clubs ayant au moins un enfant sans groupe de départ, triés par nom (R41h). */
export function clubsSansGroupe(enfants: readonly EnfantStat[], clubs: readonly ClubStat[]) {
  return parClub(
    enfants.filter((e) => !e.groupeDepart),
    clubs,
    (liste) => ({ nombre: liste.length }),
  )
}

/** Nombre de voies attendues par enfant ayant un groupe de départ (spec #6 R9). */
const VOIES_PAR_ENFANT = 3

type Compteur = { saisis: number; attendus: number }

/** Nombre de lignes par grimpeur ; seuls les enfants engagés sont ensuite interrogés. */
function compterParGrimpeur(lignes: readonly { grimpeurId: string }[]) {
  const n = new Map<string, number>()
  for (const l of lignes) n.set(l.grimpeurId, (n.get(l.grimpeurId) ?? 0) + 1)
  return (grimpeurId: string) => n.get(grimpeurId) ?? 0
}

const somme = (enfants: readonly EnfantStat[], f: (e: EnfantStat) => number) =>
  enfants.reduce((n, e) => n + f(e), 0)

/** Avancement de la saisie au global et par club (R41i). */
export function avancementSaisie(entree: {
  enfants: readonly EnfantStat[]
  clubs: readonly ClubStat[]
  nbBlocs: number
  avecVitesse: boolean
  resultatsVoie: readonly ResultatStat[]
  resultatsBloc: readonly ResultatStat[]
  vitesses: readonly VitesseStat[]
}) {
  const voies = compterParGrimpeur(entree.resultatsVoie)
  const blocs = compterParGrimpeur(entree.resultatsBloc)
  const vitesses = compterParGrimpeur(entree.vitesses)
  const calcul = (liste: readonly EnfantStat[]): Record<'voies' | 'blocs' | 'vitesse', Compteur> => ({
    voies: {
      saisis: somme(liste, (e) => voies(e.grimpeurId)),
      attendus: liste.filter((e) => e.groupeDepart).length * VOIES_PAR_ENFANT,
    },
    blocs: { saisis: somme(liste, (e) => blocs(e.grimpeurId)), attendus: liste.length * entree.nbBlocs },
    vitesse: entree.avecVitesse
      ? { saisis: somme(liste, (e) => Math.min(1, vitesses(e.grimpeurId))), attendus: liste.length }
      : { saisis: 0, attendus: 0 },
  })
  return { total: calcul(entree.enfants), parClub: parClub(entree.enfants, entree.clubs, calcul) }
}

/** Bilan après la compétition, au global et par club (R41j). */
export function bilanRencontre(entree: {
  enfants: readonly EnfantStat[]
  clubs: readonly ClubStat[]
  avecVitesse: boolean
  resultatsVoie: readonly ResultatStat[]
  resultatsBloc: readonly ResultatStat[]
  vitesses: readonly VitesseStat[]
}) {
  const npVoies = compterParGrimpeur(entree.resultatsVoie.filter((r) => r.issue === 'np'))
  const npBlocs = compterParGrimpeur(entree.resultatsBloc.filter((r) => r.issue === 'np'))
  const npVitesse = compterParGrimpeur(entree.vitesses.filter((v) => v.issue === 'non_presentation'))
  const avecVitesse = new Set(entree.vitesses.map((v) => v.grimpeurId))
  const calcul = (liste: readonly EnfantStat[]) => ({
    npVoies: somme(liste, (e) => npVoies(e.grimpeurId)),
    npBlocs: somme(liste, (e) => npBlocs(e.grimpeurId)),
    npVitesse: somme(liste, (e) => npVitesse(e.grimpeurId)),
    vitesseNonSaisie: entree.avecVitesse
      ? liste.filter((e) => !avecVitesse.has(e.grimpeurId)).length
      : 0,
  })
  return { total: calcul(entree.enfants), parClub: parClub(entree.enfants, entree.clubs, calcul) }
}
