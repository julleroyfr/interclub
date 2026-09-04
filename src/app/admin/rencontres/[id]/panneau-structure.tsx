'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, Carte, Etiquette, TitreSection } from '@/composants'
import { NIVEAUX_MOULINETTE, NIVEAUX_TETE, champsPointsVoie } from '@/domaine/gabarit'
import { PHASES, type Categorie } from '@/domaine/rencontre'
import {
  ajouterBlocRencontre,
  ajouterEpreuveRencontre,
  ajouterVoieDifficulteRencontre,
  ajouterVoieVitesseRencontre,
  type EtatStructure,
} from '@/lib/rencontres/structure-actions'
import type {
  EpreuveRencontreVue,
  StructureRencontre,
} from '@/lib/rencontres/structure'

const etatInitial: EtatStructure = undefined

type Onglet = 'voie' | 'bloc' | 'vitesse'

const ONGLETS: { cle: Onglet; label: string }[] = [
  { cle: 'voie', label: 'Voies de difficulté' },
  { cle: 'bloc', label: 'Blocs' },
  { cle: 'vitesse', label: 'Vitesse' },
]

const labelTypeVoie: Record<string, string> = {
  moulinette: 'Moulinette',
  tete: 'Tête',
}

const labelPhase = (v: string) => PHASES.find((p) => p.value === v)?.label ?? v

const champTexte =
  'rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort placeholder:text-texte-attenue'
const champSelect =
  'rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-sm text-texte-fort [color-scheme:dark]'
const champNombre = `w-16 ${champTexte}`

/** Petit champ de points (entier ≥ 0) avec libellé compact. */
function ChampPoints({
  nom,
  label,
  required = false,
}: {
  nom: string
  label: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[0.7rem] text-texte-attenue">{label}</span>
      <input name={nom} type="number" min={0} step={1} required={required} className={champNombre} />
    </label>
  )
}

/** Message affiché à la place des formulaires hors phase pré-compétition (R44). */
function NoteLectureSeule({ phase }: { phase: string }) {
  return (
    <p className="rounded-lg border border-bordure bg-black/20 px-3 py-2 text-xs text-texte-attenue">
      Phase « {labelPhase(phase)} » : la structure est verrouillée. Elle ne peut être modifiée qu’en
      phase pré-compétition (R36).
    </p>
  )
}

/** Bouton d'ajout d'une épreuve d'un type donné, pour une rencontre sans format (R35). */
function FormAjoutEpreuve({
  rencontreId,
  type,
  libelle,
}: {
  rencontreId: string
  type: Onglet
  libelle: string
}) {
  const [etat, action, enCours] = useActionState(ajouterEpreuveRencontre, etatInitial)
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="type" value={type} />
      <p className="text-sm text-texte-attenue">
        Aucune épreuve « {libelle} » pour cette rencontre.
      </p>
      <div>
        <Bouton type="submit" taille="sm" disabled={enCours}>
          + Ajouter l’épreuve
        </Bouton>
      </div>
      {etat?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etat.erreur}
        </p>
      )}
    </form>
  )
}

/** Onglet Voies de difficulté : liste + formulaire d'ajout (R42, R43). */
function OngletVoies({
  epreuve,
  rencontreId,
  categorie,
  editable,
}: {
  epreuve: EpreuveRencontreVue
  rencontreId: string
  categorie: Categorie
  editable: boolean
}) {
  const [etat, action, enCours] = useActionState(ajouterVoieDifficulteRencontre, etatInitial)
  const idNiveau = useId()
  const idType = useId()
  const idCotation = useId()

  const niveaux = [...(categorie === 'enfant' ? NIVEAUX_MOULINETTE : []), ...NIVEAUX_TETE]
  // Champs de points conditionnels à la catégorie (R38) — pilotent le formulaire (R43).
  const champs = champsPointsVoie(categorie, 'tete')

  return (
    <div className="flex flex-col gap-3">
      {epreuve.voiesDifficulte.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucune voie de difficulté.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {epreuve.voiesDifficulte.map((v) => (
            <li
              key={v.id}
              className="flex items-baseline gap-2 border-b border-bordure/40 pb-1.5 text-sm last:border-0"
            >
              <span className="w-10 font-medium text-accent-doux">{v.niveau}</span>
              <span className="text-texte-fort">{v.cotation}</span>
              <span className="text-texte-attenue">
                {labelTypeVoie[v.typeVoie]} · voie {v.points} pts
                {v.pointsPriseValorisee != null && ` · prise ${v.pointsPriseValorisee} pts`}
                {v.pointsZone1 != null && ` · Z1 ${v.pointsZone1} pts`}
                {v.pointsZone2 != null && ` · Z2 ${v.pointsZone2} pts`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form action={action} className="flex flex-wrap items-end gap-2 pt-1">
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="epreuveId" value={epreuve.id} />
          <input type="hidden" name="categorie" value={categorie} />

          <div className="flex flex-col gap-1">
            <label htmlFor={idNiveau} className="text-xs text-texte-attenue">
              Niveau
            </label>
            <select id={idNiveau} name="niveau" required className={champSelect}>
              {niveaux.map((n) => (
                <option key={n} value={n} className="bg-fond text-texte">
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={idType} className="text-xs text-texte-attenue">
              Type
            </label>
            <select id={idType} name="typeVoie" required className={champSelect}>
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
          {champs.priseValorisee && <ChampPoints nom="pointsPriseValorisee" label="Prise valo." />}
          {champs.zones && (
            <>
              <ChampPoints nom="pointsZone1" label="Zone 1" />
              <ChampPoints nom="pointsZone2" label="Zone 2" />
            </>
          )}

          <Bouton type="submit" taille="sm" disabled={enCours}>
            + Voie
          </Bouton>

          {etat?.erreur && (
            <p role="alert" className="w-full text-xs text-danger">
              {etat.erreur}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

/** Onglet Blocs : liste (code + paliers) + ajout d'un bloc (R42, R43). */
function OngletBlocs({
  epreuve,
  rencontreId,
  editable,
}: {
  epreuve: EpreuveRencontreVue
  rencontreId: string
  editable: boolean
}) {
  const [etat, action, enCours] = useActionState(ajouterBlocRencontre, etatInitial)
  const idCode = useId()

  return (
    <div className="flex flex-col gap-3">
      {epreuve.blocs.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucun bloc.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {epreuve.blocs.map((b) => (
            <li key={b.id} className="flex flex-col gap-1 rounded-lg border border-bordure/50 p-3">
              <Etiquette variante="neutre">{b.code}</Etiquette>
              {b.paliers.length === 0 ? (
                <p className="text-xs text-texte-attenue">Aucun palier.</p>
              ) : (
                <p className="text-xs text-texte-attenue">
                  {b.paliers.map((p) => `${p.libelle} ${p.points} pts`).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form action={action} className="flex flex-wrap items-end gap-2 pt-1">
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="epreuveId" value={epreuve.id} />
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
          <Bouton type="submit" taille="sm" disabled={enCours}>
            + Bloc
          </Bouton>
          {etat?.erreur && (
            <p role="alert" className="w-full text-xs text-danger">
              {etat.erreur}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

/** Onglet Vitesse : liste des voies (numéro + libellé) + ajout (R42, R43, R32). */
function OngletVitesse({
  structure,
  editable,
}: {
  structure: StructureRencontre
  editable: boolean
}) {
  const [etat, action, enCours] = useActionState(ajouterVoieVitesseRencontre, etatInitial)
  const idLibelle = useId()
  const idSuggestions = useId()

  return (
    <div className="flex flex-col gap-3">
      {structure.voiesVitesse.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucune voie de vitesse.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {structure.voiesVitesse.map((vv) => (
            <li key={vv.id} className="flex items-center gap-1.5">
              <span className="text-xs text-texte-doux">{vv.numero}</span>
              <Etiquette variante="neutre">{vv.libelle ?? '(sans libellé)'}</Etiquette>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form action={action} className="flex flex-wrap items-end gap-2 pt-1">
          <input type="hidden" name="rencontreId" value={structure.id} />
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
              className={`w-32 ${champTexte}`}
            />
            <datalist id={idSuggestions}>
              <option value="Filles" />
              <option value="Garçons" />
              <option value="Mixte" />
            </datalist>
          </div>
          <Bouton type="submit" taille="sm" disabled={enCours}>
            + Voie
          </Bouton>
          {etat?.erreur && (
            <p role="alert" className="w-full text-xs text-danger">
              {etat.erreur}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

/** Écran de configuration de la structure d'une rencontre (R40–R45, Option B). */
export function PanneauStructure({ structure }: { structure: StructureRencontre }) {
  const [onglet, setOnglet] = useState<Onglet>('voie')
  const editable = structure.phase === 'pre_competition'

  const epreuveVoie = structure.epreuves.find((e) => e.type === 'voie')
  const epreuveBloc = structure.epreuves.find((e) => e.type === 'bloc')

  const comptes: Record<Onglet, number> = {
    voie: epreuveVoie?.voiesDifficulte.length ?? 0,
    bloc: epreuveBloc?.blocs.length ?? 0,
    vitesse: structure.voiesVitesse.length,
  }

  return (
    <Carte className="flex flex-col gap-5 p-5">
      <TitreSection>Structure</TitreSection>

      {!editable && <NoteLectureSeule phase={structure.phase} />}

      <div className="flex gap-1 rounded-xl border border-bordure bg-black/20 p-1">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            aria-pressed={onglet === o.cle}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
              onglet === o.cle
                ? 'bg-surface-forte text-texte-fort'
                : 'text-texte-attenue hover:text-texte'
            }`}
          >
            {o.label} · {comptes[o.cle]}
          </button>
        ))}
      </div>

      <section>
        {onglet === 'voie' &&
          (epreuveVoie ? (
            <OngletVoies
              epreuve={epreuveVoie}
              rencontreId={structure.id}
              categorie={structure.categorie}
              editable={editable}
            />
          ) : editable ? (
            <FormAjoutEpreuve rencontreId={structure.id} type="voie" libelle="Voies de difficulté" />
          ) : (
            <p className="text-sm text-texte-attenue">Aucune épreuve de voies.</p>
          ))}

        {onglet === 'bloc' &&
          (epreuveBloc ? (
            <OngletBlocs epreuve={epreuveBloc} rencontreId={structure.id} editable={editable} />
          ) : editable ? (
            <FormAjoutEpreuve rencontreId={structure.id} type="bloc" libelle="Blocs" />
          ) : (
            <p className="text-sm text-texte-attenue">Aucune épreuve de blocs.</p>
          ))}

        {onglet === 'vitesse' && <OngletVitesse structure={structure} editable={editable} />}
      </section>
    </Carte>
  )
}
