'use server'

import { lireReponseEnregistrement, type ScoreGrimpeur } from '@/lib/resultats/reponse-enregistrement'
import { classerRefus, type Refus } from '@/lib/saisie/refus-enregistrement'
import type { SaisieOptimiste } from '@/lib/saisie/saisie-optimiste'
import { createClient } from '@/lib/supabase/server'

// Saisie des résultats voie/bloc par le coach (spec #6), envoyée depuis la file
// d'attente de l'appareil (spec #17 R12). Chaque écriture est UN SEUL appel à
// une fonction d'enregistrement en base (spec #6 R3, rév. 2026-10-09) qui
// contrôle — session coach, club du grimpeur (prêtés inclus), phase ③, issue,
// palier, plafond ado, heure de saisie (spec #17 R9/R10) — PUIS écrit, avec les
// droits de l'appelant (la RLS reste la frontière ultime). La réponse porte le
// score du grimpeur (R20) ou un refus classé (spec #17 R17–R20), et l'heure du
// serveur (écart d'horloge, spec #17 R6).

export type ReponseEnregistrement =
  | { ok: true; score: ScoreGrimpeur; heureServeur: number }
  | { ok: false; refus: Refus; heureServeur: number }

/**
 * Enregistre une saisie coach — issue de voie, retrait de voie ou résultat de
 * bloc — avec son heure de saisie (ISO 8601).
 */
export async function enregistrerSaisieCoach(
  s: SaisieOptimiste,
  saisiLe: string,
): Promise<ReponseEnregistrement> {
  const supabase = await createClient()
  const { data, error } =
    s.type === 'voie'
      ? await supabase.rpc('saisir_resultat_voie', {
          p_voie: s.voieDifficulteId,
          p_grimpeur: s.grimpeurId,
          p_issue: s.issue,
          p_saisi_le: saisiLe,
        })
      : s.type === 'retrait_voie'
        ? await supabase.rpc('retirer_resultat_voie', {
            p_voie: s.voieDifficulteId,
            p_grimpeur: s.grimpeurId,
            p_saisi_le: saisiLe,
          })
        : await supabase.rpc('saisir_resultat_bloc', {
            p_bloc: s.blocId,
            p_grimpeur: s.grimpeurId,
            p_issue: s.issue,
            p_palier: s.issue === 'palier' ? s.palierId : null,
            p_saisi_le: saisiLe,
          })
  const heureServeur = Date.now()
  if (error) return { ok: false, refus: classerRefus(error), heureServeur }
  return { ok: true, score: lireReponseEnregistrement(data), heureServeur }
}
