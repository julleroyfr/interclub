'use server'

import { creerResultatVitesse, ResultatVitesseInvalideError } from '@/domaine/vitesse'
import type { IssueVitesse } from '@/lib/juge/vitesse'
import { classerRefus, type Refus } from '@/lib/saisie/refus-enregistrement'
import { createClient } from '@/lib/supabase/server'

// Saisie du résultat de vitesse par le juge (spec #10), envoyée depuis la file
// d'attente de l'appareil (spec #17 R12). La forme (temps > 0 / chute / non-prés.,
// R7–R9) est revalidée par le domaine sans appel réseau ; puis UN appel à la
// fonction d'enregistrement contrôle la session juge (③, R6), l'épreuve de sa
// rencontre (R3), le grimpeur engagé (R7bis) et l'heure de saisie (spec #17 R9),
// et écrit (rév. 2026-10-09). La RLS (peut_ecrire_temps_vitesse) reste la
// frontière ultime.

export type ReponseVitesse =
  | { ok: true; heureServeur: number }
  | { ok: false; refus: Refus; heureServeur: number }

/** Enregistre (ou corrige) le résultat de vitesse d'un grimpeur (R7/R10/R11). */
export async function enregistrerTempsVitesse(
  grimpeurId: string,
  issue: IssueVitesse,
  temps: number | null,
  saisiLe: string,
): Promise<ReponseVitesse> {
  try {
    creerResultatVitesse(
      issue === 'temps' ? { type: 'temps', secondes: temps ?? Number.NaN } : { type: issue },
    )
  } catch (e) {
    if (!(e instanceof ResultatVitesseInvalideError)) throw e
    return { ok: false, refus: { nature: 'definitif', message: e.message }, heureServeur: Date.now() }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('saisir_temps_vitesse', {
    p_grimpeur: grimpeurId,
    p_issue: issue,
    p_temps: issue === 'temps' ? temps : null,
    p_saisi_le: saisiLe,
  })
  const heureServeur = Date.now()
  if (error) return { ok: false, refus: classerRefus(error), heureServeur }
  return { ok: true, heureServeur }
}
