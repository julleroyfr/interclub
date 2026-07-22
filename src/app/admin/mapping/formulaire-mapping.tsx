'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, ChampSelect, GroupeRadio } from '@/composants'
import { attribuerMapping } from '@/lib/auth/mapping-actions'
import type {
  ClubOption,
  CompteSupabase,
  EtatMapping,
} from '@/lib/auth/mapping'

const etatInitial: EtatMapping = undefined

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

      <GroupeRadio
        name="role"
        legend="Rôle"
        value={role}
        onChange={(v) => setRole(v as 'coach' | 'admin')}
        options={[
          { value: 'coach', label: 'Coach' },
          { value: 'admin', label: 'Admin' },
        ]}
      />

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
