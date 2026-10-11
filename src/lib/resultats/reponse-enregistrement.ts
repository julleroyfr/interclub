import type { IssueBloc, IssueVoie } from '@/domaine/resultat'
import { scoreIndividuel } from '@/domaine/score'

// Réponse des fonctions d'enregistrement coach (spec #6 R20, rév. 2026-10-09 ;
// migration 202610091000) : résultats du grimpeur pour la rencontre, avec leurs
// barèmes, et ses points de vitesse. Le score en est déduit par le DOMAINE
// (`scoreIndividuel`, spec #7) — aucune règle de calcul n'est dupliquée en base.

/** Score du grimpeur après un enregistrement. */
export type ScoreGrimpeur = { score: number; pointsVitesse: number }

const nombreOuNull = (v: unknown): number | null => (typeof v === 'number' ? v : null)

/**
 * Lit la réponse JSON d'un enregistrement et en déduit le score du grimpeur.
 * Lève une erreur si la réponse est illisible : un score faux ne doit jamais
 * être affiché en silence.
 */
export function lireReponseEnregistrement(reponse: unknown): ScoreGrimpeur {
  const r = reponse as { voies?: unknown; blocs?: unknown; points_vitesse?: unknown } | null
  if (!r || !Array.isArray(r.voies) || !Array.isArray(r.blocs)) {
    throw new Error('Réponse d’enregistrement illisible.')
  }
  const voies = (r.voies as Record<string, unknown>[]).map((v) => ({
    issue: v.issue as IssueVoie,
    bareme: {
      points: nombreOuNull(v.points) ?? 0,
      pointsPriseValorisee: nombreOuNull(v.points_prise_valorisee),
      pointsZone1: nombreOuNull(v.points_zone1),
      pointsZone2: nombreOuNull(v.points_zone2),
    },
  }))
  const blocs = (r.blocs as Record<string, unknown>[]).map((b) => ({
    issue: b.issue as IssueBloc,
    pointsPalier: nombreOuNull(b.points_palier),
  }))
  const pointsVitesse = nombreOuNull(r.points_vitesse) ?? 0
  return { score: scoreIndividuel(voies, blocs, pointsVitesse), pointsVitesse }
}
