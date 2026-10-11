// Domaine pur — sessions QR éphémères (spec #2 R6–R14, R22–R25, R34 ; ADR 0001).
//
// Couvre : format de l'URL de scan encodée dans le QR (R6, ADR 0003/T5d),
// décision au scan selon la session déjà ouverte (R34), parsing du résultat de
// la RPC `ouvrir_session_qr`, et redirection selon le rôle. Pas d'accès Supabase ni d'I/O.

import type { NatureJeton } from './jeton-qr'

export { type NatureJeton }

/** Résultat parsé du JSONB retourné par la RPC `ouvrir_session_qr`. */
export type ResultatScan = {
  nature: NatureJeton
  clubId: string | null
  voieVitesseId: string | null
  rencontreId: string
}

/** Erreur de domaine sur les sessions QR. */
export class SessionQrInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionQrInvalideError'
  }
}

/**
 * Construit l'URL encodée dans le QR code (ADR 0003/T5d).
 * Format : `<baseUrl>/scan?jeton=<valeur>`
 */
export function construireUrlScan(baseUrl: string, valeur: string): string {
  const base = baseUrl.trim().replace(/\/$/, '')
  if (!base) throw new SessionQrInvalideError("L'URL de base ne peut pas être vide.")
  if (!valeur.trim()) throw new SessionQrInvalideError('La valeur du jeton ne peut pas être vide.')
  return `${base}/scan?jeton=${valeur}`
}

/**
 * Parse le résultat JSONB de la RPC `ouvrir_session_qr` (ADR 0001 §1).
 * Convertit du snake_case SQL vers le camelCase TypeScript.
 */
export function interpreterResultatScan(data: unknown): ResultatScan {
  if (!data || typeof data !== 'object') {
    throw new SessionQrInvalideError(
      'Résultat de scan invalide ou session non ouverte.',
    )
  }
  const d = data as Record<string, unknown>
  const nature = d['nature']
  if (nature !== 'coach_temporaire' && nature !== 'juge') {
    throw new SessionQrInvalideError(`Nature de session inconnue : ${JSON.stringify(nature)}.`)
  }
  const rencontreId = d['rencontre_id']
  if (typeof rencontreId !== 'string' || !rencontreId) {
    throw new SessionQrInvalideError('rencontre_id manquant dans le résultat de scan.')
  }
  return {
    nature,
    clubId: typeof d['club_id'] === 'string' ? d['club_id'] : null,
    voieVitesseId: typeof d['voie_vitesse_id'] === 'string' ? d['voie_vitesse_id'] : null,
    rencontreId,
  }
}

/**
 * Retourne le chemin de redirection après ouverture de session. Le coach
 * temporaire est mené **directement à sa rencontre** (spec #5 R8bis : session
 * bornée à une seule rencontre, pas de liste) ; le juge va à `/juge`.
 */
export function urlDeRedirection(resultat: ResultatScan): string {
  if (resultat.nature === 'coach_temporaire') {
    return `/coach/rencontres/${resultat.rencontreId}`
  }
  return '/juge'
}

/** Session déjà ouverte sur l'appareil au moment du scan (null : aucune). */
export type SessionAuScan = { estAnonyme: boolean; email: string | null } | null

/** Ce que fait `/scan` : ouvrir la session QR, ou laisser choisir (R34). */
export type DecisionScan =
  | { type: 'ouvrir' }
  | { type: 'proposer_choix'; email: string | null }

/**
 * Décide du comportement du scan selon la session déjà ouverte (R34, revue du
 * 2026-10-03 constat m5). Un compte permanent connecté n'est jamais remplacé
 * sans action explicite : on lui propose de rejoindre son espace ou de se
 * déconnecter pour ouvrir la session QR. Sans session, ou avec une session QR
 * éphémère (anonyme), on ouvre directement (R6).
 */
export function decisionScan(session: SessionAuScan): DecisionScan {
  if (session && !session.estAnonyme) {
    return { type: 'proposer_choix', email: session.email }
  }
  return { type: 'ouvrir' }
}
