// Chemin de retour d'une Server Action (revue du 2026-10-03, constat m3). Le
// champ `chemin` est fourni par le formulaire, donc par le client : on ne suit
// qu'un chemin INTERNE à l'application, jamais une URL vers un autre site
// (redirection ouverte).

/**
 * Renvoie `brut` s'il s'agit d'un chemin interne (`/…`), sinon `defaut`. Refuse
 * les URL absolues, les URL relatives au protocole (`//hote`, `/\hote`), les
 * schémas (`javascript:`…) et les chemins relatifs.
 */
export function cheminDeRetour(brut: FormDataEntryValue | null, defaut: string): string {
  if (typeof brut !== 'string') return defaut
  const estInterne = brut.startsWith('/') && !brut.startsWith('//') && !brut.startsWith('/\\')
  return estInterne ? brut : defaut
}
