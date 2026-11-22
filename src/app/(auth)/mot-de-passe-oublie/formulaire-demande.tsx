'use client'

import { useActionState } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import {
  demanderReinitialisation,
  type EtatDemandeReinitialisation,
} from '@/lib/auth/reinitialisation-actions'

const etatInitial: EtatDemandeReinitialisation = undefined

/** Formulaire « Mot de passe oublié ? » : l'adresse seule (spec #2 R48). */
export function FormulaireDemande() {
  const [etat, action, enCours] = useActionState(demanderReinitialisation, etatInitial)

  // Même message que le compte existe ou non (R49).
  if (etat?.envoye) {
    return (
      <p role="status" className="mt-6 text-sm text-secondaire">
        {etat.envoye} Le lien est valable 1 heure.
      </p>
    )
  }

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

      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Envoi…' : 'Recevoir le lien'}
      </Bouton>
    </form>
  )
}
