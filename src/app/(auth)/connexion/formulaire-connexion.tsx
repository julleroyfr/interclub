'use client'

import { useActionState } from 'react'

import { seConnecter, type EtatConnexion } from '@/lib/auth/actions'

const etatInitial: EtatConnexion = undefined

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, etatInitial)

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="min-h-11 rounded-md border border-gray-300 px-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="motDePasse" className="text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11 rounded-md border border-gray-300 px-3 text-base"
        />
      </div>

      {etat?.erreur && (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="min-h-11 rounded-md bg-gray-900 px-4 font-medium text-white disabled:opacity-60"
      >
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
