'use client'

import { useActionState } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import { inscrireCoach, type EtatInscription } from '@/lib/invitations/actions'

const etatInitial: EtatInscription = undefined

export function FormulaireInscription({ invitation }: { invitation: string }) {
  const [etat, action, enCours] = useActionState(inscrireCoach, etatInitial)

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="invitation" value={invitation} />

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
        autoComplete="new-password"
        required
      />

      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Création…' : 'Créer mon compte'}
      </Bouton>
    </form>
  )
}
