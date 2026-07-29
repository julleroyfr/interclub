'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { Bouton, ChampSelect, ChampTexte } from '@/composants'
import { CATEGORIES } from '@/domaine/rencontre'
import { creerRencontre } from '@/lib/rencontres/actions'
import type { EtatRencontre, OptionClub } from '@/lib/rencontres/rencontres'

const etatInitial: EtatRencontre = undefined

const optionsCategorie = CATEGORIES.map((c) => ({ value: c.value, label: c.label }))

/** Formulaire de création d'une rencontre (admin). Se vide après un succès. */
export function FormulaireRencontre({ clubs }: { clubs: OptionClub[] }) {
  const [etat, action, enCours] = useActionState(creerRencontre, etatInitial)
  const idDate = useId()
  const idClub = useId()
  const idCat = useId()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (etat?.succes) formRef.current?.reset()
  }, [etat?.succes])

  const optionsClub = clubs.map((c) => ({ value: c.id, label: c.nom }))

  return (
    <form ref={formRef} action={action} className="mt-4 flex flex-col gap-4">
      <ChampTexte
        id={idDate}
        name="dateRencontre"
        type="date"
        label="Date de la rencontre"
        required
        erreur={etat?.erreur}
      />
      <ChampSelect
        id={idClub}
        name="clubPorteurId"
        label="Club porteur"
        options={optionsClub}
        placeholder="Choisir un club…"
        required
      />
      <ChampSelect
        id={idCat}
        name="categorie"
        label="Catégorie"
        options={optionsCategorie}
        placeholder="Choisir une catégorie…"
        required
      />

      {etat?.succes && (
        <p role="status" className="text-sm text-secondaire">
          {etat.succes}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Création…' : 'Créer la rencontre'}
      </Bouton>
    </form>
  )
}
