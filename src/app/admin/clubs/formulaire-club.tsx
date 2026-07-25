'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import { creerClub } from '@/lib/clubs/actions'
import type { EtatClub } from '@/lib/clubs/clubs'

const etatInitial: EtatClub = undefined

/** Formulaire de création d'un club (admin). Se vide après un succès. */
export function FormulaireClub() {
  const [etat, action, enCours] = useActionState(creerClub, etatInitial)
  const idNom = useId()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (etat?.succes) formRef.current?.reset()
  }, [etat?.succes])

  return (
    <form ref={formRef} action={action} className="mt-4 flex flex-col gap-4">
      <ChampTexte
        id={idNom}
        name="nom"
        label="Nom du club"
        required
        maxLength={100}
        autoComplete="off"
        placeholder="Ex. Grimpe Sud"
        erreur={etat?.erreur}
      />

      {etat?.succes && (
        <p role="status" className="text-sm text-secondaire">
          {etat.succes}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Création…' : 'Créer le club'}
      </Bouton>
    </form>
  )
}
