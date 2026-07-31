'use client'

import { useActionState, useId } from 'react'

import { Bouton, Carte, Etiquette, TitreSection } from '@/composants'
import { NIVEAUX_MOULINETTE, NIVEAUX_TETE } from '@/domaine/gabarit'
import type { Categorie } from '@/domaine/rencontre'
import {
  ajouterVoieDifficulteGabarit,
  supprimerVoieDifficulteGabarit,
  type EtatGabarit,
} from '@/lib/gabarit/actions'
import type { EpreuveGabaritVue } from '@/lib/gabarit/gabarit'

const labelType: Record<string, string> = {
  voie: 'Voie de difficulté',
  bloc: 'Bloc',
  vitesse: 'Vitesse',
}

const labelTypeVoie: Record<string, string> = {
  moulinette: 'Moulinette',
  tete: 'Tête',
}

function SectionVoiesDifficulte({
  epreuve,
  categorie,
}: {
  epreuve: EpreuveGabaritVue
  categorie: Categorie
}) {
  const etatInitial: EtatGabarit = undefined
  const [etatAjout, actionAjout, ajoutEnCours] = useActionState(
    ajouterVoieDifficulteGabarit,
    etatInitial,
  )
  const [, actionSuppr] = useActionState(supprimerVoieDifficulteGabarit, etatInitial)

  const idNiveau = useId()
  const idTypeVoie = useId()
  const idCotation = useId()

  const niveauxMoulinette = categorie === 'enfant' ? NIVEAUX_MOULINETTE : []
  const niveaux = [...niveauxMoulinette, ...NIVEAUX_TETE]

  return (
    <div className="flex flex-col gap-3">
      {epreuve.voiesDifficulte.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucune voie de difficulté.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {epreuve.voiesDifficulte.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2">
              <span className="text-sm text-texte-fort">
                {v.niveau}
                <span className="ml-1.5 text-texte-attenue">
                  {labelTypeVoie[v.typeVoie]} · {v.cotation}
                </span>
              </span>
              <form action={actionSuppr}>
                <input type="hidden" name="id" value={v.id} />
                <Bouton type="submit" variante="fantome" taille="sm">
                  ✕
                </Bouton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={actionAjout} className="flex flex-wrap items-end gap-2 pt-1">
        <input type="hidden" name="gabaritEpreuveId" value={epreuve.id} />
        <input type="hidden" name="categorie" value={categorie} />

        <div className="flex flex-col gap-1">
          <label htmlFor={idNiveau} className="text-xs text-texte-attenue">
            Niveau
          </label>
          <select
            id={idNiveau}
            name="niveau"
            required
            className="rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort [color-scheme:dark]"
          >
            {niveaux.map((n) => (
              <option key={n} value={n} className="bg-fond text-texte">
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={idTypeVoie} className="text-xs text-texte-attenue">
            Type
          </label>
          <select
            id={idTypeVoie}
            name="typeVoie"
            required
            className="rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort [color-scheme:dark]"
          >
            {categorie === 'enfant' && (
              <option value="moulinette" className="bg-fond text-texte">
                Moulinette
              </option>
            )}
            <option value="tete" className="bg-fond text-texte">
              Tête
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={idCotation} className="text-xs text-texte-attenue">
            Cotation
          </label>
          <input
            id={idCotation}
            name="cotation"
            type="text"
            placeholder="ex. 6a+"
            required
            className="w-20 rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort placeholder:text-texte-attenue"
          />
        </div>

        <Bouton type="submit" taille="sm" disabled={ajoutEnCours}>
          + Voie
        </Bouton>

        {etatAjout?.erreur && (
          <p role="alert" className="w-full text-xs text-danger">
            {etatAjout.erreur}
          </p>
        )}
      </form>
    </div>
  )
}

/** Panneau d'affichage et d'édition d'un gabarit par catégorie. */
export function PanneauGabarit({
  categorie,
  label,
  epreuves,
}: {
  categorie: Categorie
  label: string
  epreuves: EpreuveGabaritVue[]
}) {
  return (
    <Carte className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-3">
        <TitreSection>Gabarit {label}</TitreSection>
        <Etiquette variante="neutre">{epreuves.length} épreuve(s)</Etiquette>
      </div>

      {epreuves.length === 0 ? (
        <p className="text-sm text-texte-attenue">Gabarit vide — aucune épreuve configurée.</p>
      ) : (
        epreuves.map((e) => (
          <section key={e.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-texte-fort">{labelType[e.type]}</h3>

            {e.type === 'voie' && (
              <SectionVoiesDifficulte epreuve={e} categorie={categorie} />
            )}

            {e.type === 'bloc' && (
              <ul className="flex gap-2">
                {e.blocs.map((b) => (
                  <li key={b.id}>
                    <Etiquette variante="neutre">{b.code}</Etiquette>
                  </li>
                ))}
              </ul>
            )}

            {e.type === 'vitesse' && (
              <ul className="flex gap-2">
                {e.voiesVitesse.map((vv) => (
                  <li key={vv.id}>
                    <Etiquette variante="neutre">{vv.libelle}</Etiquette>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </Carte>
  )
}
