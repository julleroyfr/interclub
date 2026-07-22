'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton } from '@/composants'
import { attribuerMapping } from '@/lib/auth/mapping-actions'
import type {
  ClubOption,
  CompteSupabase,
  EtatMapping,
} from '@/lib/auth/mapping'

const etatInitial: EtatMapping = undefined

const styleChamp =
  'mt-1 h-12 w-full rounded-xl border border-bordure bg-black/30 px-4 text-base ' +
  'text-texte-fort focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  // `color-scheme: dark` : le navigateur dessine la liste déroulante native en
  // sombre (options lisibles). `styleOption` fournit un secours explicite.
  '[color-scheme:dark]'

// Fond/texte explicites des <option> (secours si le navigateur ignore
// color-scheme sur le menu natif).
const styleOption = 'bg-fond text-texte'

const styleLabel = 'text-xs font-medium uppercase tracking-wide text-texte-attenue'

type Props = {
  comptes: CompteSupabase[]
  clubs: ClubOption[]
}

export function FormulaireMapping({ comptes, clubs }: Props) {
  const [etat, action, enCours] = useActionState(attribuerMapping, etatInitial)
  // Le club n'est demandé que pour un coach (R3) : un admin n'a pas de club.
  const [role, setRole] = useState<'coach' | 'admin'>('coach')

  const idCompte = useId()
  const idClub = useId()

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <div>
        <label htmlFor={idCompte} className={styleLabel}>
          Compte
        </label>
        <select
          id={idCompte}
          name="utilisateurId"
          required
          defaultValue=""
          className={styleChamp}
        >
          <option value="" disabled className={styleOption}>
            Sélectionnez un compte…
          </option>
          {comptes.map((c) => (
            <option key={c.id} value={c.id} className={styleOption}>
              {c.email ?? c.id}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={styleLabel}>Rôle</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-texte">
            <input
              type="radio"
              name="role"
              value="coach"
              checked={role === 'coach'}
              onChange={() => setRole('coach')}
              className="size-4 accent-accent"
            />
            Coach
          </label>
          <label className="flex items-center gap-2 text-sm text-texte">
            <input
              type="radio"
              name="role"
              value="admin"
              checked={role === 'admin'}
              onChange={() => setRole('admin')}
              className="size-4 accent-accent"
            />
            Admin
          </label>
        </div>
      </fieldset>

      {role === 'coach' && (
        <div>
          <label htmlFor={idClub} className={styleLabel}>
            Club
          </label>
          <select
            id={idClub}
            name="clubId"
            required
            defaultValue=""
            className={styleChamp}
          >
            <option value="" disabled className={styleOption}>
              Sélectionnez un club…
            </option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id} className={styleOption}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && (
        <p role="status" className="text-sm text-secondaire">
          {etat.succes}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Attribution…' : 'Attribuer'}
      </Bouton>
    </form>
  )
}
