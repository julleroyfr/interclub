'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import {
  enregistrerNouveauMotDePasse,
  type EtatNouveauMotDePasse,
} from '@/lib/auth/reinitialisation-actions'

const etatInitial: EtatNouveauMotDePasse = undefined

/** Nouveau mot de passe saisi deux fois (spec #2 R51) ; lien consommé à l'envoi (R52). */
export function FormulaireNouveauMotDePasse({ tokenHash }: { tokenHash: string }) {
  const [etat, action, enCours] = useActionState(enregistrerNouveauMotDePasse, etatInitial)

  // Lien expiré, déjà utilisé ou invalide : proposer un nouveau lien (R52).
  if (etat?.lienInvalide) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
        <Link
          href="/mot-de-passe-oublie"
          className="text-sm text-accent hover:underline"
        >
          Demander un nouveau lien
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="tokenHash" value={tokenHash} />

      <ChampTexte
        id="motDePasse"
        name="motDePasse"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
      />

      <ChampTexte
        id="confirmationMotDePasse"
        name="confirmationMotDePasse"
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        required
      />

      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Enregistrement…' : 'Enregistrer'}
      </Bouton>
    </form>
  )
}
