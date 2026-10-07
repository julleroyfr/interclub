import type { IssueBloc, IssueVoie } from '@/domaine/resultat'
import type { GrimpeurSaisie, SaisieRencontre } from '@/lib/coach/resultats'
import type { GrimpeurVitesse, IssueVitesse } from '@/lib/juge/vitesse'

// Affichage IMMÉDIAT d'une saisie, avant la réponse du serveur (spec #17 R22,
// spec #6 R20bis, spec #10 R14bis). Fonctions pures : elles superposent une
// saisie « en attente » aux données lues sur le serveur, sans les modifier, et
// recalculent les compteurs de progression. Le SCORE n'est pas recalculé ici : il
// reste celui du serveur (calcul du domaine, spec #7) jusqu'à l'enregistrement.

/** Saisie coach affichée en attente de la réponse du serveur. */
export type SaisieOptimiste =
  | { type: 'voie'; grimpeurId: string; voieDifficulteId: string; issue: IssueVoie }
  | { type: 'retrait_voie'; grimpeurId: string; voieDifficulteId: string }
  | {
      type: 'bloc'
      grimpeurId: string
      blocId: string
      issue: Exclude<IssueBloc, 'np'>
      palierId: string | null
    }

/** Clé de la cible d'une saisie (une voie ou un bloc d'un grimpeur). */
export function cleSaisie(s: SaisieOptimiste): string {
  return s.type === 'bloc'
    ? `bloc:${s.grimpeurId}:${s.blocId}`
    : `voie:${s.grimpeurId}:${s.voieDifficulteId}`
}

/** Superpose une saisie coach en attente aux données du serveur. */
export function appliquerSaisieOptimiste(
  saisie: SaisieRencontre,
  s: SaisieOptimiste,
): SaisieRencontre {
  return {
    ...saisie,
    grimpeurs: saisie.grimpeurs.map((g) =>
      g.grimpeurId === s.grimpeurId ? appliquerAuGrimpeur(saisie, g, s) : g,
    ),
  }
}

function appliquerAuGrimpeur(
  saisie: SaisieRencontre,
  g: GrimpeurSaisie,
  s: SaisieOptimiste,
): GrimpeurSaisie {
  let { voies, blocs } = g

  if (s.type === 'voie') {
    const existante = voies.some((v) => v.voieDifficulteId === s.voieDifficulteId)
    if (existante) {
      voies = voies.map((v) =>
        v.voieDifficulteId === s.voieDifficulteId ? { ...v, issue: s.issue, enAttente: true } : v,
      )
    } else {
      // Ado : nouvelle voie choisie librement (spec #6 R11), triée comme le serveur.
      const v = saisie.voiesEpreuve.find((x) => x.voieDifficulteId === s.voieDifficulteId)
      if (v) {
        voies = [
          ...voies,
          {
            voieDifficulteId: v.voieDifficulteId,
            niveau: v.niveau,
            cotation: v.cotation,
            typeVoie: v.typeVoie,
            issue: s.issue,
            enAttente: true,
          },
        ].sort((a, b) => a.niveau.localeCompare(b.niveau))
      }
    }
  } else if (s.type === 'retrait_voie') {
    voies = voies.filter((v) => v.voieDifficulteId !== s.voieDifficulteId)
  } else {
    const libelle =
      s.palierId != null
        ? (saisie.blocsConfig
            .find((b) => b.blocId === s.blocId)
            ?.paliers.find((p) => p.id === s.palierId)?.libelle ?? null)
        : null
    blocs = blocs.map((b) =>
      b.blocId === s.blocId
        ? { ...b, issue: s.issue, palierId: s.palierId, palierLibelle: libelle, enAttente: true }
        : b,
    )
  }

  return {
    ...g,
    voies,
    blocs,
    progression: {
      ...g.progression,
      voiesFaites: voies.filter((v) => v.issue != null).length,
      blocsFaites: blocs.filter((b) => b.issue != null).length,
    },
  }
}

/** Résultat de vitesse affiché en attente de la réponse du serveur. */
export type VitesseOptimiste = {
  grimpeurId: string
  issue: IssueVitesse
  /** Secondes si `issue === 'temps'`, sinon `null` (spec #10 R9). */
  temps: number | null
}

/** Superpose un résultat de vitesse en attente aux données du serveur. */
export function appliquerVitesseOptimiste(
  grimpeurs: GrimpeurVitesse[],
  s: VitesseOptimiste,
): GrimpeurVitesse[] {
  return grimpeurs.map((g) =>
    g.grimpeurId === s.grimpeurId
      ? { ...g, issue: s.issue, temps: s.issue === 'temps' ? s.temps : null, enAttente: true }
      : g,
  )
}
