// Prêt de grimpeur (spec #1 R35) : logique pure, sans accès Supabase.
// Le prêt met un grimpeur d'un autre club à disposition d'un club d'accueil pour
// une rencontre. Créé/révoqué par l'admin (la frontière d'autorisation reste la
// RLS ; ici on ne valide que la cohérence de la saisie).

export class PretInvalideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PretInvalideError'
  }
}

/** Saisie d'un prêt depuis l'écran admin (club d'origine inclus pour la règle). */
export type SaisiePret = {
  rencontreId: string
  grimpeurId: string
  clubAccueilId: string
  /** Club de rattachement du grimpeur, pour vérifier qu'il diffère de l'accueil. */
  clubGrimpeurId: string
}

/** Prêt validé, prêt à être persisté (table `pret`). */
export type Pret = {
  rencontreId: string
  grimpeurId: string
  clubAccueilId: string
}

/**
 * Valide une saisie de prêt (R35) : rencontre, grimpeur et club d'accueil
 * renseignés, et le club d'accueil **diffère** du club d'origine du grimpeur (un
 * grimpeur n'est pas « prêté » à son propre club). Lance `PretInvalideError`.
 */
export function creerPret(saisie: SaisiePret): Pret {
  if (!saisie.rencontreId) throw new PretInvalideError('Sélectionnez une rencontre.')
  if (!saisie.grimpeurId) throw new PretInvalideError('Sélectionnez un grimpeur.')
  if (!saisie.clubAccueilId) {
    throw new PretInvalideError("Sélectionnez un club d'accueil.")
  }
  if (saisie.clubGrimpeurId === saisie.clubAccueilId) {
    throw new PretInvalideError(
      "Un grimpeur ne peut pas être prêté à son propre club.",
    )
  }
  return {
    rencontreId: saisie.rencontreId,
    grimpeurId: saisie.grimpeurId,
    clubAccueilId: saisie.clubAccueilId,
  }
}
