import { notFound } from 'next/navigation'

// Pages de MAQUETTE `/design-system` et `/templates/**` (spec #12 R24, rév.
// 2026-10-03, décision D-F de la revue) : données fictives, hors flux. Elles ne
// sont servies qu'en développement local ; sur tout environnement déployé
// (build de production : recette, prod), elles n'existent pas — 404 pour tous,
// admin compris.

/** Vrai si les pages de maquette sont servies dans cet environnement (R24). */
export function pagesMaquetteDisponibles(
  environnement: string | undefined = process.env.NODE_ENV,
): boolean {
  return environnement === 'development'
}

/** Garde des layouts de maquette : 404 hors développement local (R24). */
export function exigerDeveloppementLocal(): void {
  if (!pagesMaquetteDisponibles()) notFound()
}
