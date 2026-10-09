// Spec #17 « Saisie hors ligne » — file d'attente locale des saisies coach / juge
// et heure de saisie corrigée. Domaine pur : ni stockage, ni réseau. La file est
// une liste de saisies, chacune visant une CIBLE (un résultat : voie, bloc ou
// vitesse d'un grimpeur), « en attente » d'envoi ou « rejetée » par le serveur.

/** Périmètre d'une file (R3/R4) : une file n'est vue et rejouée que par lui. */
export type PerimetreFile =
  | { role: 'coach'; rencontreId: string; clubId: string }
  | { role: 'juge'; rencontreId: string; clubId?: undefined }

/** Clé de stockage d'une file : rôle, rencontre et, pour un coach, son club (R4). */
export function clePerimetre(p: PerimetreFile): string {
  return `${p.role}:${p.rencontreId}:${p.clubId ?? ''}`
}

/** Saisie conservée sur l'appareil (R12). */
export type SaisieLocale<C> = {
  id: string
  /** Cible visée : une seule saisie en attente par cible (R14). */
  cible: string
  /** Heure de saisie corrigée, en millisecondes (R6). */
  saisiLe: number
  contenu: C
  etat: 'en_attente' | 'rejetee'
  /** Motif lisible d'un refus définitif (R18/R26). */
  motif?: string
}

export type FileSaisies<C> = readonly SaisieLocale<C>[]

/** Issue d'un envoi au serveur (R17–R19). */
export type IssueEnvoi =
  | { type: 'acceptee' }
  | { type: 'temporaire' }
  | { type: 'session' }
  | { type: 'definitif'; motif: string }

/**
 * Ajoute une saisie à la file (R12). Une saisie EN ATTENTE sur la même cible est
 * remplacée : seule la plus récente sera envoyée (R14). Les saisies rejetées
 * restent dans la liste des rejets jusqu'à ce que l'utilisateur les retire (R26).
 */
export function ajouterSaisie<C>(file: FileSaisies<C>, saisie: SaisieLocale<C>): SaisieLocale<C>[] {
  return [
    ...file.filter((s) => !(s.etat === 'en_attente' && s.cible === saisie.cible)),
    saisie,
  ]
}

/** Saisies à envoyer, dans l'ordre chronologique de saisie (R16). */
export function saisiesAEnvoyer<C>(file: FileSaisies<C>): SaisieLocale<C>[] {
  return file.filter((s) => s.etat === 'en_attente').sort((a, b) => a.saisiLe - b.saisiLe)
}

/**
 * Applique l'issue d'un envoi (R17) : acceptée → quitte la file ; refus
 * définitif → rejetée avec son motif, plus renvoyée (R18) ; échec temporaire ou
 * session absente → reste en attente (R19). Sans effet si la saisie a quitté la
 * file entre-temps (remplacée, abandonnée).
 */
export function appliquerIssueEnvoi<C>(
  file: FileSaisies<C>,
  id: string,
  issue: IssueEnvoi,
): SaisieLocale<C>[] {
  if (issue.type === 'acceptee') return file.filter((s) => s.id !== id)
  if (issue.type === 'definitif') {
    return file.map((s) => (s.id === id ? { ...s, etat: 'rejetee' as const, motif: issue.motif } : s))
  }
  return [...file]
}

/** Abandonne une saisie en attente : elle quitte la file sans être envoyée (R27). */
export function abandonnerSaisie<C>(file: FileSaisies<C>, id: string): SaisieLocale<C>[] {
  return file.filter((s) => !(s.id === id && s.etat === 'en_attente'))
}

/** Retire une saisie rejetée de la liste des rejets (R26). */
export function retirerRejet<C>(file: FileSaisies<C>, id: string): SaisieLocale<C>[] {
  return file.filter((s) => !(s.id === id && s.etat === 'rejetee'))
}

/** Écart entre l'horloge du serveur et celle de l'appareil, en ms (R6). */
export function ecartHorloge(heureServeur: number, heureAppareil: number): number {
  return heureServeur - heureAppareil
}

/** Heure de saisie corrigée de l'écart mesuré (R6). */
export function heureSaisie(heureAppareil: number, ecart: number): number {
  return heureAppareil + ecart
}
