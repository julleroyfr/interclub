// Recherche nom/prénom partagée par les écrans de liste de grimpeurs : ajout en
// équipe et prêt (spec #5 R12bis), classement (spec #7 R12b), saisie admin
// (spec #9 R10), juge vitesse (spec #10 R14b). Purement d'affichage.

/**
 * Minuscules sans accents, ligatures æ/œ dépliées en « ae »/« oe » (comme
 * `unaccent` côté SQL), pour une comparaison tolérante.
 */
function pourRecherche(texte: string): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
}

/**
 * Filtre des grimpeurs sur leur nom et prénom : chaque terme de la recherche
 * doit y figurer (casse et accents ignorés, ordre libre). Recherche vide → tous
 * les grimpeurs, ordre préservé.
 */
export function filtrerGrimpeursRecherche<G extends { nom: string; prenom: string }>(
  grimpeurs: readonly G[],
  recherche: string,
): G[] {
  const termes = pourRecherche(recherche).split(/\s+/).filter(Boolean)
  if (termes.length === 0) return [...grimpeurs]
  return grimpeurs.filter((g) => {
    const cible = pourRecherche(`${g.prenom} ${g.nom}`)
    return termes.every((t) => cible.includes(t))
  })
}
