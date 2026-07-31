'use client'

import { useActionState, useId } from 'react'

import { Bouton, Carte, Etiquette, TitreSection } from '@/composants'
import { NIVEAUX_MOULINETTE, NIVEAUX_TETE } from '@/domaine/gabarit'
import type { Categorie } from '@/domaine/rencontre'
import {
  ajouterBlocGabarit,
  ajouterPalierBlocGabarit,
  ajouterVoieDifficulteGabarit,
  ajouterVoieVitesseGabarit,
  modifierPointsVoieGabarit,
  supprimerBlocGabarit,
  supprimerPalierBlocGabarit,
  supprimerVoieDifficulteGabarit,
  supprimerVoieVitesseGabarit,
  type EtatGabarit,
} from '@/lib/gabarit/actions'
import type { BlocVue, EpreuveGabaritVue, VoieDifficulteVue } from '@/lib/gabarit/gabarit'

const labelType: Record<string, string> = {
  voie: 'Voie de difficulté',
  bloc: 'Bloc',
  vitesse: 'Vitesse',
}

const labelTypeVoie: Record<string, string> = {
  moulinette: 'Moulinette',
  tete: 'Tête',
}

const champTexte =
  'rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort placeholder:text-texte-attenue'
const champNombre = `w-16 ${champTexte}`

/** Petit champ de points (entier ≥ 0) avec libellé compact. */
function ChampPoints({
  nom,
  label,
  defaultValue,
  required = false,
}: {
  nom: string
  label: string
  defaultValue?: number | null
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[0.7rem] text-texte-attenue">{label}</span>
      <input
        name={nom}
        type="number"
        min={0}
        step={1}
        required={required}
        defaultValue={defaultValue ?? undefined}
        className={champNombre}
      />
    </label>
  )
}

/** Une voie du gabarit : identité + édition des points (R38). */
function LigneVoieDifficulte({
  voie,
  categorie,
}: {
  voie: VoieDifficulteVue
  categorie: Categorie
}) {
  const etatInitial: EtatGabarit = undefined
  const [etatPoints, actionPoints, majEnCours] = useActionState(
    modifierPointsVoieGabarit,
    etatInitial,
  )
  const [, actionSuppr] = useActionState(supprimerVoieDifficulteGabarit, etatInitial)

  const estEnfantTete = categorie === 'enfant' && voie.typeVoie === 'tete'
  const estAdo = categorie === 'ado'

  return (
    <li className="flex flex-col gap-1 border-b border-bordure/40 pb-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-texte-fort">
          {voie.niveau}
          <span className="ml-1.5 text-texte-attenue">
            {labelTypeVoie[voie.typeVoie]} · {voie.cotation}
          </span>
        </span>
        <form action={actionSuppr}>
          <input type="hidden" name="id" value={voie.id} />
          <Bouton type="submit" variante="fantome" taille="sm">
            ✕
          </Bouton>
        </form>
      </div>

      <form action={actionPoints} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={voie.id} />
        <input type="hidden" name="categorie" value={categorie} />
        <input type="hidden" name="typeVoie" value={voie.typeVoie} />

        <ChampPoints nom="points" label="Voie entière" defaultValue={voie.points} required />
        {estEnfantTete && (
          <ChampPoints
            nom="pointsPriseValorisee"
            label="Prise valorisée"
            defaultValue={voie.pointsPriseValorisee}
          />
        )}
        {estAdo && (
          <>
            <ChampPoints nom="pointsZone1" label="Zone 1" defaultValue={voie.pointsZone1} />
            <ChampPoints nom="pointsZone2" label="Zone 2" defaultValue={voie.pointsZone2} />
          </>
        )}

        <Bouton type="submit" variante="secondaire" taille="sm" disabled={majEnCours}>
          Enregistrer
        </Bouton>

        {etatPoints?.erreur && (
          <p role="alert" className="w-full text-xs text-danger">
            {etatPoints.erreur}
          </p>
        )}
      </form>
    </li>
  )
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
        <ul className="flex flex-col gap-2">
          {epreuve.voiesDifficulte.map((v) => (
            <LigneVoieDifficulte key={v.id} voie={v} categorie={categorie} />
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
            className={`w-20 ${champTexte}`}
          />
        </div>

        <ChampPoints nom="points" label="Voie entière" required />
        {categorie === 'enfant' && <ChampPoints nom="pointsPriseValorisee" label="Prise valo." />}
        {categorie === 'ado' && (
          <>
            <ChampPoints nom="pointsZone1" label="Zone 1" />
            <ChampPoints nom="pointsZone2" label="Zone 2" />
          </>
        )}

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

/** Un bloc du gabarit : code + paliers de points éditables (R39). */
function LigneBloc({ bloc }: { bloc: BlocVue }) {
  const etatInitial: EtatGabarit = undefined
  const [, actionSupprBloc] = useActionState(supprimerBlocGabarit, etatInitial)
  const [etatPalier, actionAjoutPalier, ajoutEnCours] = useActionState(
    ajouterPalierBlocGabarit,
    etatInitial,
  )
  const [, actionSupprPalier] = useActionState(supprimerPalierBlocGabarit, etatInitial)

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-bordure/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <Etiquette variante="neutre">{bloc.code}</Etiquette>
        <form action={actionSupprBloc}>
          <input type="hidden" name="id" value={bloc.id} />
          <Bouton type="submit" variante="fantome" taille="sm">
            ✕ bloc
          </Bouton>
        </form>
      </div>

      {bloc.paliers.length === 0 ? (
        <p className="text-xs text-texte-attenue">Aucun palier.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {bloc.paliers.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-texte-fort">
                {p.libelle}
                <span className="ml-1.5 text-texte-attenue">{p.points} pts</span>
              </span>
              <form action={actionSupprPalier}>
                <input type="hidden" name="id" value={p.id} />
                <Bouton type="submit" variante="fantome" taille="sm">
                  ✕
                </Bouton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={actionAjoutPalier} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="gabaritBlocId" value={bloc.id} />

        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-texte-attenue">Palier</span>
          <input
            name="libelle"
            type="text"
            placeholder="ex. Zone 1"
            required
            className={`w-28 ${champTexte}`}
          />
        </label>

        <ChampPoints nom="points" label="Points" required />

        <Bouton type="submit" variante="secondaire" taille="sm" disabled={ajoutEnCours}>
          + Palier
        </Bouton>

        {etatPalier?.erreur && (
          <p role="alert" className="w-full text-xs text-danger">
            {etatPalier.erreur}
          </p>
        )}
      </form>
    </li>
  )
}

function SectionBlocs({ epreuve }: { epreuve: EpreuveGabaritVue }) {
  const etatInitial: EtatGabarit = undefined
  const [etatAjout, actionAjout, ajoutEnCours] = useActionState(ajouterBlocGabarit, etatInitial)

  const idCode = useId()

  return (
    <div className="flex flex-col gap-3">
      {epreuve.blocs.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucun bloc.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {epreuve.blocs.map((b) => (
            <LigneBloc key={b.id} bloc={b} />
          ))}
        </ul>
      )}

      <form action={actionAjout} className="flex flex-wrap items-end gap-2 pt-1">
        <input type="hidden" name="gabaritEpreuveId" value={epreuve.id} />

        <div className="flex flex-col gap-1">
          <label htmlFor={idCode} className="text-xs text-texte-attenue">
            Code
          </label>
          <input
            id={idCode}
            name="code"
            type="text"
            placeholder="ex. B3"
            required
            className={`w-24 ${champTexte}`}
          />
        </div>

        <Bouton type="submit" taille="sm" disabled={ajoutEnCours}>
          + Bloc
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

function SectionVitesse({ epreuve }: { epreuve: EpreuveGabaritVue }) {
  const etatInitial: EtatGabarit = undefined
  const [etatAjout, actionAjout, ajoutEnCours] = useActionState(
    ajouterVoieVitesseGabarit,
    etatInitial,
  )
  const [, actionSuppr] = useActionState(supprimerVoieVitesseGabarit, etatInitial)

  const idLibelle = useId()
  const idSuggestions = useId()

  return (
    <div className="flex flex-col gap-3">
      {epreuve.voiesVitesse.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucune voie de vitesse.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {epreuve.voiesVitesse.map((vv) => (
            <li key={vv.id} className="flex items-center gap-1">
              <Etiquette variante="neutre">{vv.libelle}</Etiquette>
              <form action={actionSuppr}>
                <input type="hidden" name="id" value={vv.id} />
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

        <div className="flex flex-col gap-1">
          <label htmlFor={idLibelle} className="text-xs text-texte-attenue">
            Libellé
          </label>
          <input
            id={idLibelle}
            name="libelle"
            type="text"
            list={idSuggestions}
            placeholder="ex. Mixte"
            required
            className="w-32 rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort placeholder:text-texte-attenue"
          />
          <datalist id={idSuggestions}>
            <option value="Filles" />
            <option value="Garçons" />
            <option value="Mixte" />
          </datalist>
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

            {e.type === 'bloc' && <SectionBlocs epreuve={e} />}

            {e.type === 'vitesse' && <SectionVitesse epreuve={e} />}
          </section>
        ))
      )}
    </Carte>
  )
}
