'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import { renommerClub, supprimerClub } from '@/lib/clubs/actions'
import type { ClubAvecDependances, EtatClub } from '@/lib/clubs/clubs'

const etatInitial: EtatClub = undefined

/** Liste des clubs avec renommage inline et suppression confirmée (admin). */
export function ListeClubs({ clubs }: { clubs: ClubAvecDependances[] }) {
  if (clubs.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">Aucun club pour l’instant.</p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {clubs.map((club) => (
        // La clé inclut le nom : après un renommage (revalidation), la ligne se
        // remonte à neuf — l'éditeur inline se referme sans effet de bord.
        <li key={`${club.id}:${club.nom}`}>
          <LigneClub club={club} />
        </li>
      ))}
    </ul>
  )
}

function LigneClub({ club }: { club: ClubAvecDependances }) {
  const [edition, setEdition] = useState(false)
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [etatRenom, actionRenom, renomEnCours] = useActionState(
    renommerClub,
    etatInitial,
  )
  const [etatSuppr, actionSuppr, supprEnCours] = useActionState(
    supprimerClub,
    etatInitial,
  )
  const idNom = useId()
  const supprimable = club.nbRencontres === 0 && club.nbGrimpeurs === 0

  return (
    <div className="rounded-2xl border border-bordure bg-black/20 p-4">
      {edition ? (
        <form action={actionRenom} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={club.id} />
          <ChampTexte
            id={idNom}
            name="nom"
            label="Nom du club"
            defaultValue={club.nom}
            required
            maxLength={100}
            autoComplete="off"
            erreur={etatRenom?.erreur}
          />
          <div className="flex flex-wrap gap-2">
            <Bouton type="submit" disabled={renomEnCours}>
              {renomEnCours ? 'Enregistrement…' : 'Enregistrer'}
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
              {club.nom}
            </p>
            <p className="mt-1 text-xs text-texte-doux">
              {club.nbRencontres} rencontre(s) · {club.nbGrimpeurs} grimpeur(s)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Bouton variante="fantome" onClick={() => setEdition(true)}>
              Renommer
            </Bouton>

            {confirmSuppr ? (
              <form action={actionSuppr} className="flex items-center gap-2">
                <input type="hidden" name="id" value={club.id} />
                <span className="text-xs text-texte-attenue">Confirmer ?</span>
                <Bouton type="submit" variante="danger" disabled={supprEnCours}>
                  {supprEnCours ? 'Suppression…' : 'Oui, supprimer'}
                </Bouton>
                <Bouton variante="fantome" onClick={() => setConfirmSuppr(false)}>
                  Non
                </Bouton>
              </form>
            ) : (
              <Bouton
                variante="danger"
                onClick={() => setConfirmSuppr(true)}
                disabled={!supprimable}
                title={
                  supprimable
                    ? undefined
                    : 'Club référencé (rencontres/grimpeurs) : suppression impossible'
                }
              >
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
      {etatRenom?.succes && (
        <p role="status" className="mt-2 text-sm text-secondaire">
          {etatRenom.succes}
        </p>
      )}
    </div>
  )
}
