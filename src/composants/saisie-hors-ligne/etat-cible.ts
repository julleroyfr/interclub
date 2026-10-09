// État affiché sur une cible saisie (spec #17 R23, rév. 2026-10-09). Fonction
// pure. « En attente » et « enregistré » ne sont signalés que si
// l'enregistrement dure plus de 2 secondes ; « rejetée » est immédiat.

export type IndicateurCible = 'attente' | 'enregistre' | 'rejet' | null

export function indicateurCible({
  enAttente,
  attenteLongue,
  enregistreApresAttente,
  confirme,
  rejete,
}: {
  /** Une saisie de cette cible attend la réponse du serveur. */
  enAttente: boolean
  /** … depuis plus de 2 secondes. */
  attenteLongue: boolean
  /** La dernière attente, longue, vient de se terminer. */
  enregistreApresAttente: boolean
  /** Le serveur vient de confirmer une saisie de cette cible. */
  confirme: boolean
  /** La dernière saisie de cette cible a été rejetée (R18). */
  rejete: boolean
}): IndicateurCible {
  if (enAttente && attenteLongue) return 'attente'
  if (rejete) return 'rejet'
  if (enAttente) return null
  if (confirme && enregistreApresAttente) return 'enregistre'
  return null
}
