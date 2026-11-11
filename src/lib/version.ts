// Version de l'application exposée dans la balise meta `version` du <head>
// (convention 10 §5). Calculée au build à partir de `package.json` et des
// variables de déploiement Vercel.

type VariablesDeploiement = Record<string, string | undefined>

/** Nom de branche réduit à `a-z0-9-` (ex. `feature/Classement_Calcul` → `feature-classement-calcul`). */
function normaliserBranche(branche: string): string {
  return branche
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * `X.Y.Z+commit` en production, `X.Y.Z-branche+commit` ailleurs,
 * `X.Y.Z-local` sans information de déploiement.
 */
export function libelleVersion(version: string, env: VariablesDeploiement): string {
  const production = env.VERCEL_ENV === 'production'
  const branche = env.VERCEL_GIT_COMMIT_REF
  const commit = env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)

  const prerelease = production ? '' : `-${branche ? normaliserBranche(branche) : 'local'}`
  return `${version}${prerelease}${commit ? `+${commit}` : ''}`
}
