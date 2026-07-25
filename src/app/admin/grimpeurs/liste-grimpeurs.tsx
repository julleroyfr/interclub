'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, ChampSelect, ChampTexte } from '@/composants'
import { ANNEE_NAISSANCE_MAX, ANNEE_NAISSANCE_MIN } from '@/domaine/grimpeur'
import { modifierGrimpeur, supprimerGrimpeur } from '@/lib/grimpeurs/actions'
import type {
  EtatGrimpeur,
  GrimpeurAvecDependances,
  OptionClub,
} from '@/lib/grimpeurs/grimpeurs'

const etatInitial: EtatGrimpeur = undefined

/** Liste des grimpeurs avec édition inline et suppression confirmée (admin). */
export function ListeGrimpeurs({
  grimpeurs,
  clubs,
}: {
  grimpeurs: GrimpeurAvecDependances[]
  clubs: OptionClub[]
}) {
  if (grimpeurs.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">Aucun grimpeur pour l’instant.</p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {grimpeurs.map((g) => (
        // La clé inclut les champs mutables : après une écriture (revalidation),
        // la ligne se remonte à neuf — l'éditeur inline se referme sans effet.
        <li key={`${g.id}:${g.nom}:${g.prenom}:${g.anneeNaissance}:${g.clubId}`}>
          <LigneGrimpeur grimpeur={g} clubs={clubs} />
        </li>
      ))}
    </ul>
  )
}

function LigneGrimpeur({
  grimpeur,
  clubs,
}: {
  grimpeur: GrimpeurAvecDependances
  clubs: OptionClub[]
}) {
  const [edition, setEdition] = useState(false)
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [etatMod, actionMod, modEnCours] = useActionState(
    modifierGrimpeur,
    etatInitial,
  )
  const [etatSuppr, actionSuppr, supprEnCours] = useActionState(
    supprimerGrimpeur,
    etatInitial,
  )
  const idClub = useId()
  const idNom = useId()
  const idPrenom = useId()
  const idAnnee = useId()

  const optionsClub = clubs.map((c) => ({ value: c.id, label: c.nom }))

  return (
    <div className="rounded-2xl border border-bordure bg-black/20 p-4">
      {edition ? (
        <form action={actionMod} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={grimpeur.id} />
          <ChampSelect
            id={idClub}
            name="clubId"
            label="Club"
            options={optionsClub}
            defaultValue={grimpeur.clubId}
            required
          />
          <ChampTexte
            id={idPrenom}
            name="prenom"
            label="Prénom"
            defaultValue={grimpeur.prenom}
            required
            maxLength={100}
            autoComplete="off"
          />
          <ChampTexte
            id={idNom}
            name="nom"
            label="Nom"
            defaultValue={grimpeur.nom}
            required
            maxLength={100}
            autoComplete="off"
          />
          <ChampTexte
            id={idAnnee}
            name="anneeNaissance"
            type="number"
            inputMode="numeric"
            label="Année de naissance"
            defaultValue={grimpeur.anneeNaissance}
            required
            min={ANNEE_NAISSANCE_MIN}
            max={ANNEE_NAISSANCE_MAX}
          />
          {etatMod?.erreur && (
            <p role="alert" className="text-sm text-danger">
              {etatMod.erreur}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Bouton type="submit" disabled={modEnCours}>
              {modEnCours ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
            <Bouton variante="fantome" onClick={() => setEdition(false)}>
              Annuler
            </Bouton>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-texte-fort">
              {grimpeur.prenom} {grimpeur.nom}
            </p>
            <p className="mt-1 text-xs text-texte-doux">
              {grimpeur.clubNom} · né(e) en {grimpeur.anneeNaissance} ·{' '}
              {grimpeur.nbEngagements} engagement(s)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Bouton variante="fantome" onClick={() => setEdition(true)}>
              Modifier
            </Bouton>

            {confirmSuppr ? (
              <form action={actionSuppr} className="flex items-center gap-2">
                <input type="hidden" name="id" value={grimpeur.id} />
                <span className="text-xs text-texte-attenue">
                  {grimpeur.nbEngagements > 0
                    ? 'Supprimer (et ses engagements/résultats) ?'
                    : 'Confirmer ?'}
                </span>
                <Bouton type="submit" variante="danger" disabled={supprEnCours}>
                  {supprEnCours ? 'Suppression…' : 'Oui, supprimer'}
                </Bouton>
                <Bouton variante="fantome" onClick={() => setConfirmSuppr(false)}>
                  Non
                </Bouton>
              </form>
            ) : (
              <Bouton variante="danger" onClick={() => setConfirmSuppr(true)}>
                Supprimer
              </Bouton>
            )}
          </div>
        </div>
      )}

      {etatSuppr?.erreur && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {etatSuppr.erreur}
        </p>
      )}
    </div>
  )
}
