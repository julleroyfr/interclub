'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, ChampSelect } from '@/composants'
import { attribuerMapping } from '@/lib/auth/mapping-actions'
import type {
  ClubOption,
  CompteSupabase,
  EtatMapping,
} from '@/lib/auth/mapping'

const etatInitial: EtatMapping = undefined

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
      <ChampSelect
        id={idCompte}
        name="utilisateurId"
        label="Compte"
        required
        placeholder="Sélectionnez un compte…"
        options={comptes.map((c) => ({ value: c.id, label: c.email ?? c.id }))}
      />

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
        <ChampSelect
          id={idClub}
          name="clubId"
          label="Club"
          required
          placeholder="Sélectionnez un club…"
          options={clubs.map((c) => ({ value: c.id, label: c.nom }))}
        />
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
