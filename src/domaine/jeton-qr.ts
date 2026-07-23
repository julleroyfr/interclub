// Domaine pur — jetons QR (spec #2 « Authentification & sessions QR », R9,
// R15–R23).
//
// Un jeton QR ouvre des sessions éphémères d'un rôle et d'un périmètre pour une
// rencontre. Deux natures (R9) : `coach_temporaire` (périmètre = un club) ou
// `juge` (périmètre = une voie de vitesse). Ici : nature/périmètre, matrice
// « qui peut gérer », révocation (R22) et régénération (R23). Pas d'accès
// Supabase ni de génération de secret (la `valeur` est fournie par la base).

/** Nature d'un jeton QR (R9). */
export type NatureJeton = 'coach_temporaire' | 'juge'

/** Périmètre demandé pour un nouveau jeton, avant validation. */
export type DemandeJeton = {
  rencontreId: string
  nature: NatureJeton
  clubId: string | null
  voieVitesseId: string | null
}

/** Périmètre validé d'un jeton (reflète `chk_jeton_nature_perimetre`). */
export type PerimetreJeton = {
  rencontreId: string
  nature: NatureJeton
  clubId: string | null
  voieVitesseId: string | null
}

/** Acteur permanent qui tente de gérer un jeton (spec #1 R4 : une session = un rôle). */
export type Acteur = { role: 'admin' | 'coach' | null; clubId: string | null }

/** Cible d'une action de gestion : la nature et le club (pour un coach temp.). */
export type CibleJeton = { nature: NatureJeton; clubId: string | null }

/** Jeton complet (avec secret et état) pour révocation / régénération. */
export type JetonQr = PerimetreJeton & { valeur: string; actif: boolean }

/** Demande de jeton invalide (nature inconnue, périmètre incohérent…). */
export class JetonQrInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JetonQrInvalideError'
  }
}

/**
 * Valide et normalise le périmètre d'un nouveau jeton (R9, R17), reflet de la
 * contrainte SQL `chk_jeton_nature_perimetre` :
 * - `coach_temporaire` ⇒ un club, sans voie ;
 * - `juge` ⇒ une voie de vitesse, sans club.
 */
export function creerJetonQr(demande: DemandeJeton): PerimetreJeton {
  const rencontreId = demande.rencontreId?.trim() ?? ''
  if (!rencontreId) {
    throw new JetonQrInvalideError('Un jeton doit être lié à une rencontre.')
  }

  if (demande.nature === 'coach_temporaire') {
    const clubId = demande.clubId?.trim() ?? ''
    if (!clubId) {
      throw new JetonQrInvalideError(
        'Un jeton coach temporaire doit porter un club (R9a).',
      )
    }
    if (demande.voieVitesseId) {
      throw new JetonQrInvalideError(
        'Un jeton coach temporaire ne porte pas de voie de vitesse (R9a).',
      )
    }
    return { rencontreId, nature: 'coach_temporaire', clubId, voieVitesseId: null }
  }

  if (demande.nature === 'juge') {
    const voieVitesseId = demande.voieVitesseId?.trim() ?? ''
    if (!voieVitesseId) {
      throw new JetonQrInvalideError(
        'Un jeton juge doit porter une voie de vitesse (R9b, R17).',
      )
    }
    if (demande.clubId) {
      throw new JetonQrInvalideError(
        'Un jeton juge ne porte pas de club (R9b).',
      )
    }
    return { rencontreId, nature: 'juge', clubId: null, voieVitesseId }
  }

  throw new JetonQrInvalideError(
    `Nature de jeton inconnue : ${JSON.stringify(demande.nature)} (R9).`,
  )
}

/**
 * Matrice « qui peut générer / afficher / révoquer / régénérer » un jeton
 * (R15, R16, R20, R21) :
 * - **admin** : tout jeton, tout périmètre (R15, R20) ;
 * - **coach permanent** : uniquement le jeton `coach_temporaire` de **son** club
 *   (R16, R21) — jamais un jeton `juge` (R17) ni un autre club ;
 * - **sans rôle** : rien (R5 fail-closed).
 */
export function peutGererJeton(acteur: Acteur, cible: CibleJeton): boolean {
  if (acteur.role === 'admin') return true
  if (acteur.role === 'coach') {
    return (
      cible.nature === 'coach_temporaire' &&
      acteur.clubId !== null &&
      cible.clubId === acteur.clubId
    )
  }
  return false
}

/** Révoque un jeton : il devient inactif (R22). Fonction pure. */
export function revoquerJeton<T extends { actif: boolean }>(jeton: T): T {
  return { ...jeton, actif: false }
}

/**
 * Régénère un jeton (R23) : révoque l'ancien et produit un **nouveau** jeton de
 * **même périmètre** mais de **valeur distincte**, actif. La nouvelle valeur est
 * fournie par l'appelant (générée en base). Fonction pure.
 */
export function regenererJeton(
  ancien: JetonQr,
  nouvelleValeur: string,
): { ancien: JetonQr; nouveau: JetonQr } {
  if (!nouvelleValeur || nouvelleValeur === ancien.valeur) {
    throw new JetonQrInvalideError(
      'La régénération doit produire un jeton de valeur distincte (R23).',
    )
  }
  return {
    ancien: revoquerJeton(ancien),
    nouveau: {
      rencontreId: ancien.rencontreId,
      nature: ancien.nature,
      clubId: ancien.clubId,
      voieVitesseId: ancien.voieVitesseId,
      valeur: nouvelleValeur,
      actif: true,
    },
  }
}
