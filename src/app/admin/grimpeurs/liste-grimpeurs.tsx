'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, ChampSelect, ChampTexte } from '@/composants'
import { compter } from '@/domaine/accord'
import {
  ANNEE_NAISSANCE_MAX,
  ANNEE_NAISSANCE_MIN,
  estLicenceGeneree,
} from '@/domaine/grimpeur'
import { modifierGrimpeur, supprimerGrimpeur } from '@/lib/grimpeurs/actions'
import type {
  EtatGrimpeur,
  GrimpeurAvecDependances,
  OptionClub,
} from '@/lib/grimpeurs/grimpeurs'
import type { EtatSurclassementGrimpeur } from '@/lib/grimpeurs/surclassement'

import {
  BadgesSurclassement,
  BoutonsSurclassement,
  type PanneauSurclassement,
  PanneauxSurclassement,
} from './surclassement-grimpeur'

const etatInitial: EtatGrimpeur = undefined
const SANS_SURCLASSEMENT: EtatSurclassementGrimpeur = {
  historique: [],
  actifs: [],
  saisonsAccordables: [],
}

/**
 * Liste (page) des grimpeurs avec édition inline et suppression confirmée
 * (admin). La recherche et la pagination sont pilotées par la page (server-side,
 * via l'URL) : ce composant rend uniquement les grimpeurs qu'on lui donne.
 */
export function ListeGrimpeurs({
  grimpeurs,
  clubs,
  surclassements,
}: {
  grimpeurs: GrimpeurAvecDependances[]
  clubs: OptionClub[]
  /** État de surclassement par grimpeur (spec #21 R18–R19). */
  surclassements: Record<string, EtatSurclassementGrimpeur>
}) {
  if (grimpeurs.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">Aucun grimpeur à afficher.</p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {grimpeurs.map((g) => (
        // La clé inclut les champs mutables : après une écriture (revalidation),
        // la ligne se remonte à neuf — l'éditeur inline se referme sans effet.
        <li key={`${g.id}:${g.nom}:${g.prenom}:${g.anneeNaissance}:${g.sexe}:${g.licence}:${g.clubId}`}>
          <LigneGrimpeur
            grimpeur={g}
            clubs={clubs}
            surclassement={surclassements[g.id] ?? SANS_SURCLASSEMENT}
          />
        </li>
      ))}
    </ul>
  )
}

function LigneGrimpeur({
  grimpeur,
  clubs,
  surclassement,
}: {
  grimpeur: GrimpeurAvecDependances
  clubs: OptionClub[]
  surclassement: EtatSurclassementGrimpeur
}) {
  const [edition, setEdition] = useState(false)
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [panneauSurcl, setPanneauSurcl] = useState<PanneauSurclassement>(null)
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
  const idSexe = useId()
  const idLicence = useId()

  const optionsClub = clubs.map((c) => ({ value: c.id, label: c.nom }))
  const optionsSexe = [
    { value: 'F', label: 'Femme' },
    { value: 'H', label: 'Homme' },
  ]

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
          <ChampSelect
            id={idSexe}
            name="sexe"
            label="Sexe"
            options={optionsSexe}
            defaultValue={grimpeur.sexe}
            required
          />
          <ChampTexte
            id={idLicence}
            name="licence"
            type="number"
            inputMode="numeric"
            label="Numéro de licence"
            defaultValue={grimpeur.licence}
            required
            min={1}
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
              <span className="uppercase">{grimpeur.nom}</span> {grimpeur.prenom}
              <BadgesSurclassement etat={surclassement} />
            </p>
            <p className="mt-1 text-xs text-texte-doux">
              {grimpeur.clubNom} · {grimpeur.sexe === 'F' ? 'née' : 'né'} en {grimpeur.anneeNaissance} ·{' '}
              {grimpeur.sexe === 'F' ? 'Femme' : 'Homme'} · licence{' '}
              {grimpeur.licence}
              {/* Licence de la plage réservée (spec #3 R21c/R26). */}
              {estLicenceGeneree(grimpeur.licence) && (
                <span className="ml-1 rounded-full border border-attention/30 bg-attention/10 px-2 py-0.5 text-[10px] font-semibold text-attention">
                  générée
                </span>
              )}{' '}
              · {compter(grimpeur.nbEngagements, 'engagement')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Bouton variante="fantome" onClick={() => setEdition(true)}>
              Modifier
            </Bouton>
            <BoutonsSurclassement
              etat={surclassement}
              panneau={panneauSurcl}
              setPanneau={setPanneauSurcl}
            />

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

      {!edition && (
        <PanneauxSurclassement
          grimpeurId={grimpeur.id}
          prenom={grimpeur.prenom}
          etat={surclassement}
          panneau={panneauSurcl}
          setPanneau={setPanneauSurcl}
        />
      )}
    </div>
  )
}
