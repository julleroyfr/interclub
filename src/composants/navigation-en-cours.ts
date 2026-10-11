/**
 * Décision pure : un clic sur un lien lance-t-il une navigation **dans l'onglet**
 * vers une **autre** page de l'application ? (spec #12 R26)
 */
export type ClicLien = {
  /** URL absolue résolue du lien (`HTMLAnchorElement.href`). */
  href: string
  target: string
  telechargement: boolean
  /** `MouseEvent.button` : 0 = clic principal. */
  bouton: number
  /** Ctrl, Cmd, Maj ou Alt enfoncé. */
  modificateur: boolean
  /** `defaultPrevented` au moment de l'interception. */
  dejaGere: boolean
}

export function declencheNavigation(clic: ClicLien, urlCourante: string): boolean {
  if (clic.dejaGere || clic.bouton !== 0 || clic.modificateur || clic.telechargement) return false
  if (clic.target && clic.target !== '_self') return false

  let cible: URL
  let courante: URL
  try {
    cible = new URL(clic.href, urlCourante)
    courante = new URL(urlCourante)
  } catch {
    return false
  }
  if (cible.origin !== courante.origin) return false

  // Même page (éventuellement avec une ancre) : pas de navigation à attendre.
  return cible.pathname !== courante.pathname || cible.search !== courante.search
}
