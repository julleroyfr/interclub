'use client'

import { useActionState } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import { seConnecter, type EtatConnexion } from '@/lib/auth/actions'

const etatInitial: EtatConnexion = undefined

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, etatInitial)

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <ChampTexte
        id="email"
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        required
      />

      <ChampTexte
        id="motDePasse"
        name="motDePasse"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        required
      />

      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </Bouton>
    </form>
  )
}
