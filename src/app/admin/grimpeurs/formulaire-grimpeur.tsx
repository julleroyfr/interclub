'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { Bouton, ChampSelect, ChampTexte } from '@/composants'
import { ANNEE_NAISSANCE_MAX, ANNEE_NAISSANCE_MIN } from '@/domaine/grimpeur'
import { creerGrimpeur } from '@/lib/grimpeurs/actions'
import type { EtatGrimpeur, OptionClub } from '@/lib/grimpeurs/grimpeurs'

const etatInitial: EtatGrimpeur = undefined

/** Formulaire d'ajout d'un grimpeur au roster (admin). Se vide après un succès. */
export function FormulaireGrimpeur({ clubs }: { clubs: OptionClub[] }) {
  const [etat, action, enCours] = useActionState(creerGrimpeur, etatInitial)
  const idClub = useId()
  const idNom = useId()
  const idPrenom = useId()
  const idAnnee = useId()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (etat?.succes) formRef.current?.reset()
  }, [etat?.succes])

  const optionsClub = clubs.map((c) => ({ value: c.id, label: c.nom }))

  return (
    <form ref={formRef} action={action} className="mt-4 flex flex-col gap-4">
      <ChampSelect
        id={idClub}
        name="clubId"
        label="Club"
        options={optionsClub}
        placeholder="Choisir un club…"
        required
      />
      <ChampTexte
        id={idPrenom}
        name="prenom"
        label="Prénom"
        required
        maxLength={100}
        autoComplete="off"
        placeholder="Ex. Léa"
      />
      <ChampTexte
        id={idNom}
        name="nom"
        label="Nom"
        required
        maxLength={100}
        autoComplete="off"
        placeholder="Ex. Dupont"
      />
      <ChampTexte
        id={idAnnee}
        name="anneeNaissance"
        type="number"
        inputMode="numeric"
        label="Année de naissance"
        required
        min={ANNEE_NAISSANCE_MIN}
        max={ANNEE_NAISSANCE_MAX}
        placeholder="Ex. 2014"
      />

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
        {enCours ? 'Ajout…' : 'Ajouter le grimpeur'}
      </Bouton>
    </form>
  )
}
