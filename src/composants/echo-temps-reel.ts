// Filtre des évènements temps réel (spec #11). Fonction pure : les seules
// informations lues dans la charge utile sont l'AUTEUR de l'écriture (écho de
// ses propres saisies, R6bis), l'auteur de la COCHE de contrôle (écho de ses
// propres coches, R6bis rév. 2026-11-10) et le GRIMPEUR concerné (pertinence
// pour l'écran, R8bis) — aucune valeur n'est affichée (R4).

/** Évènement Postgres Changes, réduit à ce que le filtre consulte. */
export type EvenementTempsReel = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

/**
 * Vrai si l'évènement doit relancer la relecture de l'écran.
 * - R8bis : si l'écran fournit ses `grimpeursAffiches`, une écriture dont le
 *   grimpeur (nouvelle ou ancienne ligne) n'en fait pas partie est ignorée ; un
 *   évènement sans grimpeur identifiable relit toujours.
 * - R6bis : sur un écran de saisie (`ignorerMesEcritures`), un INSERT/UPDATE
 *   dont l'auteur est l'utilisateur courant est ignoré (son écran reflète déjà
 *   l'enregistrement, R6) ; un DELETE (auteur inconnu) relit.
 * - R6bis (rév. 2026-11-10) : sur l'écran de contrôle (`ignorerMesCoches`), un
 *   UPDATE dont l'auteur de la coche (`controle_par`) est l'utilisateur courant
 *   est ignoré ; une décoche (`controle_par` vide) relit.
 */
export function doitRelire(
  evenement: EvenementTempsReel,
  {
    ignorerMesEcritures,
    ignorerMesCoches = false,
    utilisateurId,
    grimpeursAffiches,
  }: {
    ignorerMesEcritures: boolean
    ignorerMesCoches?: boolean
    utilisateurId: string | null
    grimpeursAffiches?: ReadonlySet<string>
  },
): boolean {
  if (grimpeursAffiches) {
    const grimpeur = evenement.new['grimpeur_id'] ?? evenement.old['grimpeur_id']
    if (typeof grimpeur === 'string' && !grimpeursAffiches.has(grimpeur)) return false
  }
  if (
    ignorerMesCoches &&
    utilisateurId &&
    evenement.eventType === 'UPDATE' &&
    evenement.new['controle_par'] === utilisateurId
  ) {
    return false
  }
  if (!ignorerMesEcritures || !utilisateurId) return true
  if (evenement.eventType === 'DELETE') return true
  const auteur = evenement.new['auteur_utilisateur_id']
  return typeof auteur !== 'string' || auteur !== utilisateurId
}
