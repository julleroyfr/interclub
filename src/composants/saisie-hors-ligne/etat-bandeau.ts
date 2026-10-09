// Choix du bandeau de synchronisation (spec #17 R24, rév. 2026-10-09 ; R25 ;
// R26). Fonction pure. En ligne, un envoi normal (court) n'est pas signalé :
// l'état de chaque saisie reste visible sur sa cible (R23).

/** Durée au-delà de laquelle un envoi en cours est signalé (R24). */
export const DELAI_ENVOI_LONG_MS = 2_000

export type EtatBandeau = 'session' | 'hors_ligne' | 'envoi' | 'rejet' | null

export function etatBandeau({
  enLigne,
  nbEnAttente,
  nbRejetees,
  sessionAbsente,
  envoiLong,
}: {
  enLigne: boolean
  nbEnAttente: number
  nbRejetees: number
  sessionAbsente: boolean
  /** Vrai si des saisies attendent depuis plus de DELAI_ENVOI_LONG_MS. */
  envoiLong: boolean
}): EtatBandeau {
  if (sessionAbsente && nbEnAttente > 0) return 'session'
  if (!enLigne) return 'hors_ligne'
  if (nbRejetees > 0 && !(nbEnAttente > 0 && envoiLong)) return 'rejet'
  if (nbEnAttente > 0 && envoiLong) return 'envoi'
  return null
}
