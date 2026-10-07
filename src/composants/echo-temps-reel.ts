// Filtre de l'écho de ses propres saisies (spec #11 R6bis). Fonction pure : la
// seule information lue dans la charge utile d'un évènement temps réel est
// l'auteur de l'écriture (R4) — aucune valeur n'est affichée.

/** Évènement Postgres Changes, réduit à ce que le filtre consulte. */
export type EvenementTempsReel = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

/**
 * Vrai si l'évènement doit relancer la relecture de l'écran. Sur un écran de
 * saisie (`ignorerMesEcritures`), un INSERT/UPDATE dont l'auteur est
 * l'utilisateur courant est ignoré : son écran a déjà été relu par la Server
 * Action (R6). Un DELETE (auteur de la suppression inconnu), une écriture sans
 * auteur (table dérivée) ou un utilisateur courant inconnu relisent toujours.
 */
export function doitRelire(
  evenement: EvenementTempsReel,
  { ignorerMesEcritures, utilisateurId }: { ignorerMesEcritures: boolean; utilisateurId: string | null },
): boolean {
  if (!ignorerMesEcritures || !utilisateurId) return true
  if (evenement.eventType === 'DELETE') return true
  const auteur = evenement.new['auteur_utilisateur_id']
  return typeof auteur !== 'string' || auteur !== utilisateurId
}
