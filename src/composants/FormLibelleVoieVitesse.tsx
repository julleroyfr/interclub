'use client'

import { useActionState, useId } from 'react'

import { Bouton } from './Bouton'

type EtatLibelle = { erreur?: string; succes?: string } | undefined

/**
 * Formulaire de modification du libellé d'une voie de vitesse (spec #20 R9bis),
 * partagé par le gabarit et la structure de rencontre. `champsCaches` porte les
 * identifiants attendus par l'action (`id`, et `rencontreId` en rencontre) ;
 * `rang` (numéro ou ordre de la voie) distingue les champs entre eux.
 */
export function FormLibelleVoieVitesse({
  action,
  libelle,
  rang,
  champsCaches,
}: {
  action: (etat: EtatLibelle, formData: FormData) => Promise<EtatLibelle>
  libelle: string
  rang: number
  champsCaches: Record<string, string>
}) {
  const [etat, envoyer, enCours] = useActionState(action, undefined)
  const idChamp = useId()

  return (
    <form action={envoyer} className="flex flex-wrap items-end gap-2">
      {Object.entries(champsCaches).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor={idChamp} className="text-xs text-texte-attenue">
          Libellé (voie {rang})
        </label>
        <input
          id={idChamp}
          name="libelle"
          type="text"
          defaultValue={libelle}
          required
          className="w-44 rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-base text-texte-fort sm:text-sm"
        />
      </div>
      <Bouton type="submit" taille="sm" variante="fantome" disabled={enCours}>
        Enregistrer
      </Bouton>
      {etat?.erreur && (
        <p role="alert" className="w-full text-xs text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && <p className="w-full text-xs text-secondaire">{etat.succes}</p>}
    </form>
  )
}
