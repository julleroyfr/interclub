'use client'

import { useActionState, useId, useRef, useState } from 'react'

import {
  Bouton,
  BoutonIcone,
  Carte,
  Etiquette,
  FormLibelleVoieVitesse,
  TitreSection,
} from '@/composants'
import { NIVEAUX_MOULINETTE, NIVEAUX_TETE, champsPointsVoie, type TypeVoie } from '@/domaine/gabarit'
import { PHASES, epreuveDesactivable, etatEpreuveModifiable, type Categorie } from '@/domaine/rencontre'
import { editionStructurePossible } from '@/domaine/structure'
import { REPERE_VOIE_MAX, repereModifiable } from '@/domaine/voie'
import {
  ajouterBlocRencontre,
  ajouterEpreuveRencontre,
  ajouterPalierBlocRencontre,
  ajouterVoieDifficulteRencontre,
  ajouterVoieVitesseRencontre,
  changerEtatEpreuve,
  mettreAJourBaremeVitesse,
  modifierCodeBlocRencontre,
  modifierLibelleVoieVitesseRencontre,
  modifierPalierBlocRencontre,
  modifierRepereVoie,
  modifierVoieDifficulteRencontre,
  supprimerBlocRencontre,
  supprimerPalierBlocRencontre,
  supprimerVoieDifficulteRencontre,
  supprimerVoieVitesseRencontre,
  type EtatStructure,
} from '@/lib/rencontres/structure-actions'
import type {
  BaremeVitesseVue,
  BlocPalierRencontreVue,
  BlocRencontreVue,
  EpreuveRencontreVue,
  StructureRencontre,
  VoieDifficulteRencontreVue,
} from '@/lib/rencontres/structure'

/** Signature commune des Server Actions de la structure. */
type ActionStructure = (etat: EtatStructure, formData: FormData) => Promise<EtatStructure>

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
  valeur,
}: {
  nom: string
  label: string
  required?: boolean
  /** Valeur initiale (formulaire de modification, R52). */
  valeur?: number | null
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
        defaultValue={valeur ?? undefined}
        className={champNombre}
      />
    </label>
  )
}

/** Message affiché à partir de la ③ compétition : structure verrouillée (R44, R51). */
function NoteLectureSeule({ phase, repereEditable }: { phase: string; repereEditable: boolean }) {
  return (
    <p className="rounded-lg border border-bordure bg-black/20 px-3 py-2 text-xs text-texte-attenue">
      Phase « {labelPhase(phase)} » : la structure est verrouillée. Elle ne peut être modifiée
      qu’en pré-compétition ou en préparation jour J.
      {repereEditable && ' Le repère des voies reste modifiable.'}
    </p>
  )
}

/** Message d'erreur / de succès d'une action de structure. */
function RetourAction({ etat }: { etat: EtatStructure }) {
  return (
    <>
      {etat?.erreur && (
        <p role="alert" className="w-full text-xs text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && <p className="w-full text-xs text-secondaire">{etat.succes}</p>}
    </>
  )
}

/**
 * Suppression d'un élément de la structure avec confirmation explicite (R54) ;
 * un refus (résultats saisis, R55) s'affiche sous le bouton.
 */
function BoutonSupprimer({
  action,
  champs,
  question,
  libelle,
}: {
  action: ActionStructure
  /** Champs cachés transmis à l'action (id, rencontreId…). */
  champs: Record<string, string>
  question: string
  /** Désignation de l'élément, pour l'accessibilité. */
  libelle: string
}) {
  const [confirmation, setConfirmation] = useState(false)
  const [etat, actionSuppr, enCours] = useActionState(action, etatInitial)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirmation ? (
        <form action={actionSuppr} className="flex flex-wrap items-center gap-2">
          {Object.entries(champs).map(([nom, valeur]) => (
            <input key={nom} type="hidden" name={nom} value={valeur} />
          ))}
          <span className="text-xs text-texte-attenue">{question}</span>
          <Bouton type="submit" taille="sm" variante="danger" disabled={enCours}>
            {enCours ? 'Suppression…' : 'Oui, supprimer'}
          </Bouton>
          <Bouton taille="sm" variante="fantome" onClick={() => setConfirmation(false)}>
            Non
          </Bouton>
        </form>
      ) : (
        <BoutonIcone
          icone="supprimer"
          libelle={`Supprimer ${libelle}`}
          onClick={() => setConfirmation(true)}
        />
      )}
      {etat?.erreur && (
        <p role="alert" className="w-full text-xs text-danger">
          {etat.erreur}
        </p>
      )}
    </div>
  )
}

/** Saisie / modification du repère d'une voie (spec #3 R49d) ; vide = effacer. */
function FormRepere({
  voie,
  epreuveId,
  rencontreId,
}: {
  voie: VoieDifficulteRencontreVue
  epreuveId: string
  rencontreId: string
}) {
  const [etat, action, enCours] = useActionState(modifierRepereVoie, etatInitial)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="epreuveId" value={epreuveId} />
      <input type="hidden" name="voieId" value={voie.id} />
      <input type="hidden" name="niveau" value={voie.niveau} />
      <input
        name="repere"
        type="text"
        defaultValue={voie.repere ?? ''}
        maxLength={REPERE_VOIE_MAX}
        placeholder="Repère (relais, couleur)"
        aria-label={`Repère de la voie ${voie.libelle}`}
        className={`min-h-11 w-44 ${champTexte}`}
      />
      <BoutonIcone
        type="submit"
        icone="valider"
        libelle={`Enregistrer le repère (${voie.libelle})`}
        disabled={enCours}
      />
      {etat?.erreur && (
        <p role="alert" className="w-full text-xs text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && <p className="w-full text-xs text-secondaire">{etat.succes}</p>}
    </form>
  )
}

/**
 * État d'une épreuve de bloc ou de vitesse d'une rencontre adulte (spec #20
 * R36–R39) : active ou désactivée ; bouton de bascule en ① et ② seulement.
 */
function EtatEpreuve({
  epreuve,
  rencontreId,
  modifiable,
}: {
  epreuve: EpreuveRencontreVue
  rencontreId: string
  modifiable: boolean
}) {
  const [etat, action, enCours] = useActionState(changerEtatEpreuve, etatInitial)
  const nom = epreuve.type === 'bloc' ? 'de bloc' : 'de vitesse'
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-3 ${
        epreuve.active ? 'border-bordure bg-black/20' : 'border-dashed border-bordure bg-black/10'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texte-attenue">
          {epreuve.active
            ? `Épreuve ${nom} active.`
            : `Épreuve ${nom} désactivée : masquée à la saisie et au classement.`}
        </p>
        <Etiquette variante={epreuve.active ? 'succes' : 'neutre'}>
          {epreuve.active ? 'Active' : 'Désactivée'}
        </Etiquette>
      </div>
      {modifiable && (
        <form action={action}>
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="epreuveId" value={epreuve.id} />
          <input type="hidden" name="active" value={epreuve.active ? 'false' : 'true'} />
          <Bouton
            type="submit"
            taille="sm"
            variante={epreuve.active ? 'danger' : 'secondaire'}
            disabled={enCours}
          >
            {epreuve.active ? `Désactiver l’épreuve ${nom}` : `Réactiver l’épreuve ${nom}`}
          </Bouton>
        </form>
      )}
      {modifiable && epreuve.active && epreuve.type === 'vitesse' && (
        <p className="text-xs text-texte-doux">
          Désactiver la vitesse révoque ses jetons juges ; après réactivation, générez-en de nouveaux.
        </p>
      )}
      {etat?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && <p className="text-xs text-secondaire">{etat.succes}</p>}
    </div>
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

/**
 * Champs communs d'une voie de difficulté — niveau, type, cotation, points (R37,
 * R38) — pour l'ajout (R43) comme pour la modification (R52). Les champs de
 * points conditionnels suivent le type choisi.
 */
function ChampsVoie({
  categorie,
  voie,
  repere,
}: {
  categorie: Categorie
  /** Voie modifiée (valeurs initiales) ; absente à l'ajout. */
  voie?: VoieDifficulteRencontreVue
  /** Champ Repère (ajout seulement : en modification il a son propre formulaire, R49). */
  repere?: boolean
}) {
  const [typeVoie, setTypeVoie] = useState<TypeVoie>(voie?.typeVoie ?? 'tete')
  const idNiveau = useId()
  const idType = useId()
  const idCotation = useId()
  const idRepere = useId()

  const niveaux = [...(categorie === 'enfant' ? NIVEAUX_MOULINETTE : []), ...NIVEAUX_TETE]
  // Champs de points conditionnels à la catégorie et au type (R38).
  const champs = champsPointsVoie(categorie, typeVoie)

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={idNiveau} className="text-xs text-texte-attenue">
          Niveau
        </label>
        <select
          id={idNiveau}
          name="niveau"
          required
          defaultValue={voie?.niveau}
          className={champSelect}
        >
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
        <select
          id={idType}
          name="typeVoie"
          required
          value={typeVoie}
          onChange={(e) => setTypeVoie(e.target.value as TypeVoie)}
          className={champSelect}
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
          defaultValue={voie?.cotation}
          className={`w-20 ${champTexte}`}
        />
      </div>

      {repere && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idRepere} className="text-xs text-texte-attenue">
            Repère
          </label>
          <input
            id={idRepere}
            name="repere"
            type="text"
            maxLength={REPERE_VOIE_MAX}
            placeholder="Relais 12, Jaune…"
            className={`w-36 ${champTexte}`}
          />
        </div>
      )}

      <ChampPoints nom="points" label="Voie entière" required valeur={voie?.points} />
      {champs.priseValorisee && (
        <ChampPoints
          nom="pointsPriseValorisee"
          label="Prise valo."
          valeur={voie?.pointsPriseValorisee}
        />
      )}
      {champs.zones && (
        <>
          <ChampPoints nom="pointsZone1" label="Zone 1" valeur={voie?.pointsZone1} />
          <ChampPoints nom="pointsZone2" label="Zone 2" valeur={voie?.pointsZone2} />
        </>
      )}
    </>
  )
}

/** Formulaire de modification d'une voie, ouvert sous sa ligne (R52, R55b). */
function FormModifierVoie({
  voie,
  rencontreId,
  categorie,
  onFermer,
}: {
  voie: VoieDifficulteRencontreVue
  rencontreId: string
  categorie: Categorie
  onFermer: () => void
}) {
  const [etat, action, enCours] = useActionState(
    async (prec: EtatStructure, formData: FormData): Promise<EtatStructure> => {
      const res = await modifierVoieDifficulteRencontre(prec, formData)
      if (res?.succes) onFermer()
      return res
    },
    etatInitial,
  )
  return (
    <form
      action={action}
      aria-label={`Modifier la voie ${voie.libelle}`}
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3"
    >
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="voieId" value={voie.id} />
      <ChampsVoie categorie={categorie} voie={voie} />
      <Bouton type="submit" taille="sm" disabled={enCours}>
        Enregistrer
      </Bouton>
      <Bouton taille="sm" variante="fantome" onClick={onFermer}>
        Annuler
      </Bouton>
      <RetourAction etat={etat} />
    </form>
  )
}

/** Ligne d'une voie : libellé, détail, repère et gestes d'édition (R42, R49, R52, R54). */
function LigneVoie({
  voie,
  epreuveId,
  rencontreId,
  categorie,
  edition,
  repereEditable,
}: {
  voie: VoieDifficulteRencontreVue
  epreuveId: string
  rencontreId: string
  categorie: Categorie
  edition: boolean
  repereEditable: boolean
}) {
  const [enModification, setEnModification] = useState(false)
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 border-b border-bordure/40 pb-1.5 text-sm last:border-0">
      {/* Libellé : niveau + repère, ou lettre si niveau doublé (R50). */}
      <span className="min-w-10 font-medium text-accent-doux">{voie.libelle}</span>
      <span className="text-texte-fort">{voie.cotation}</span>
      <span className="text-texte-attenue">
        {labelTypeVoie[voie.typeVoie]} · voie {voie.points} pts
        {voie.pointsPriseValorisee != null && ` · prise ${voie.pointsPriseValorisee} pts`}
        {voie.pointsZone1 != null && ` · Z1 ${voie.pointsZone1} pts`}
        {voie.pointsZone2 != null && ` · Z2 ${voie.pointsZone2} pts`}
      </span>
      {(repereEditable || (edition && !enModification)) && (
        <div className="flex w-full flex-wrap items-center gap-2">
          {repereEditable && (
            <FormRepere voie={voie} epreuveId={epreuveId} rencontreId={rencontreId} />
          )}
          {edition && !enModification && (
            <>
              <BoutonIcone
                icone="modifier"
                libelle={`Modifier la voie ${voie.libelle}`}
                onClick={() => setEnModification(true)}
              />
              <BoutonSupprimer
                action={supprimerVoieDifficulteRencontre}
                champs={{ id: voie.id, rencontreId }}
                question={`Supprimer la voie ${voie.libelle} ?`}
                libelle={`la voie ${voie.libelle}`}
              />
            </>
          )}
        </div>
      )}
      {enModification && (
        <FormModifierVoie
          voie={voie}
          rencontreId={rencontreId}
          categorie={categorie}
          onFermer={() => setEnModification(false)}
        />
      )}
    </li>
  )
}

/** Onglet Voies de difficulté : liste + modification/suppression + ajout (R42, R43, R52, R54). */
function OngletVoies({
  epreuve,
  rencontreId,
  categorie,
  edition,
  repereEditable,
}: {
  epreuve: EpreuveRencontreVue
  rencontreId: string
  categorie: Categorie
  /** Ajout, modification, suppression possibles (① et ②, R51). */
  edition: boolean
  /** Repère modifiable (① à ③, spec #3 R49d). */
  repereEditable: boolean
}) {
  const [etat, action, enCours] = useActionState(ajouterVoieDifficulteRencontre, etatInitial)

  return (
    <div className="flex flex-col gap-3">
      {epreuve.voiesDifficulte.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucune voie de difficulté.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {epreuve.voiesDifficulte.map((v) => (
            <LigneVoie
              key={v.id}
              voie={v}
              epreuveId={epreuve.id}
              rencontreId={rencontreId}
              categorie={categorie}
              edition={edition}
              repereEditable={repereEditable}
            />
          ))}
        </ul>
      )}

      {edition && (
        <form action={action} className="flex flex-wrap items-end gap-2 pt-1">
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="epreuveId" value={epreuve.id} />
          <input type="hidden" name="categorie" value={categorie} />
          <ChampsVoie categorie={categorie} repere />
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

/** Libellé et points d'un palier existant, modifiables, et sa suppression (R53, R55c). */
function LignePalier({
  palier,
  blocCode,
  rencontreId,
  edition,
}: {
  palier: BlocPalierRencontreVue
  /** Code du bloc, pour distinguer les paliers homonymes à l’accessibilité. */
  blocCode: string
  rencontreId: string
  edition: boolean
}) {
  const [etat, action, enCours] = useActionState(modifierPalierBlocRencontre, etatInitial)
  if (!edition) {
    return (
      <li className="text-xs text-texte-attenue">
        {palier.libelle} {palier.points} pts
      </li>
    )
  }
  return (
    <li className="flex flex-wrap items-center gap-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="rencontreId" value={rencontreId} />
        <input type="hidden" name="id" value={palier.id} />
        <input
          name="libelle"
          type="text"
          required
          defaultValue={palier.libelle}
          aria-label={`Libellé du palier ${palier.libelle} (bloc ${blocCode})`}
          className={`min-h-11 w-32 ${champTexte}`}
        />
        <input
          name="points"
          type="number"
          min={0}
          step={1}
          required
          defaultValue={palier.points}
          aria-label={`Points du palier ${palier.libelle} (bloc ${blocCode})`}
          className={`min-h-11 ${champNombre}`}
        />
        <BoutonIcone
          type="submit"
          icone="valider"
          libelle={`Enregistrer le palier ${palier.libelle} (bloc ${blocCode})`}
          disabled={enCours}
        />
        <RetourAction etat={etat} />
      </form>
      <BoutonSupprimer
        action={supprimerPalierBlocRencontre}
        champs={{ id: palier.id, rencontreId }}
        question={`Supprimer le palier « ${palier.libelle} » ?`}
        libelle={`le palier ${palier.libelle} du bloc ${blocCode}`}
      />
    </li>
  )
}

/** Ajout d'un palier en dernière position d'un bloc (R53). */
function FormAjoutPalier({ bloc, rencontreId }: { bloc: BlocRencontreVue; rencontreId: string }) {
  const [etat, action, enCours] = useActionState(ajouterPalierBlocRencontre, etatInitial)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="blocId" value={bloc.id} />
      <input
        name="libelle"
        type="text"
        required
        placeholder="ex. Zone 2"
        aria-label={`Libellé du nouveau palier (bloc ${bloc.code})`}
        className={`min-h-11 w-32 ${champTexte}`}
      />
      <input
        name="points"
        type="number"
        min={0}
        step={1}
        required
        placeholder="pts"
        aria-label={`Points du nouveau palier (bloc ${bloc.code})`}
        className={`min-h-11 ${champNombre}`}
      />
      <Bouton type="submit" variante="secondaire" disabled={enCours}>
        + Palier
      </Bouton>
      <RetourAction etat={etat} />
    </form>
  )
}

/** Carte d'un bloc : code, paliers et gestes d'édition (R42, R53, R54). */
function CarteBloc({
  bloc,
  rencontreId,
  edition,
}: {
  bloc: BlocRencontreVue
  rencontreId: string
  edition: boolean
}) {
  const [etat, action, enCours] = useActionState(modifierCodeBlocRencontre, etatInitial)
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-bordure/50 p-3">
      {edition ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="rencontreId" value={rencontreId} />
            <input type="hidden" name="id" value={bloc.id} />
            <input
              name="code"
              type="text"
              required
              defaultValue={bloc.code}
              aria-label={`Code du bloc ${bloc.code}`}
              className={`min-h-11 w-24 ${champTexte}`}
            />
            <BoutonIcone
              type="submit"
              icone="valider"
              libelle={`Enregistrer le code (bloc ${bloc.code})`}
              disabled={enCours}
            />
            <RetourAction etat={etat} />
          </form>
          <BoutonSupprimer
            action={supprimerBlocRencontre}
            champs={{ id: bloc.id, rencontreId }}
            question={`Supprimer le bloc ${bloc.code} et ses paliers ?`}
            libelle={`le bloc ${bloc.code}`}
          />
        </div>
      ) : (
        <Etiquette variante="neutre">{bloc.code}</Etiquette>
      )}
      {bloc.paliers.length === 0 ? (
        <p className="text-xs text-texte-attenue">Aucun palier.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bloc.paliers.map((p) => (
            <LignePalier
              key={p.id}
              palier={p}
              blocCode={bloc.code}
              rencontreId={rencontreId}
              edition={edition}
            />
          ))}
        </ul>
      )}
      {edition && <FormAjoutPalier bloc={bloc} rencontreId={rencontreId} />}
    </li>
  )
}

/** Onglet Blocs : liste (code + paliers) + édition + ajout d'un bloc (R42, R43, R53, R54). */
function OngletBlocs({
  epreuve,
  rencontreId,
  edition,
}: {
  epreuve: EpreuveRencontreVue
  rencontreId: string
  edition: boolean
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
            <CarteBloc key={b.id} bloc={b} rencontreId={rencontreId} edition={edition} />
          ))}
        </ul>
      )}

      {edition && (
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

/** Libellé lisible d'une plage de rangs d'un échelon (R46). */
function libelleRang(e: { rangMin: number; rangMax: number | null }): string {
  if (e.rangMax == null) return `${e.rangMin}e et +`
  if (e.rangMin === e.rangMax) return `${e.rangMin}e`
  return `${e.rangMin}–${e.rangMax}e`
}

/** Une ligne d'échelon éditable (valeurs en chaînes pour un contrôle simple). */
type LigneEchelon = {
  key: string
  rangMin: string
  rangMax: string
  points: string
  decrement: string
}

/**
 * Éditeur du barème de vitesse par rang (spec #3 R46/R47/R48) : édition complète des
 * échelons (rangs, points, décrément, ajout/suppression) + points de chute /
 * non-présentation. Éditable en pré-compétition (R44) ; sinon lecture seule. La
 * validation fine de l'invariant (contiguïté, pas de trou, dernier ouvert…) est
 * refaite côté serveur (R48) — l'IHM ne fait que collecter la saisie.
 */
function EditeurBaremeVitesse({
  bareme,
  rencontreId,
  editable,
}: {
  bareme: BaremeVitesseVue
  rencontreId: string
  editable: boolean
}) {
  // Clés stables : les échelons seedés prennent e0…e(n-1), les ajouts continuent après.
  const compteur = useRef(bareme.echelons.length)
  const [lignes, setLignes] = useState<LigneEchelon[]>(() =>
    bareme.echelons.map((e, i) => ({
      key: `e${i}`,
      rangMin: String(e.rangMin),
      rangMax: e.rangMax == null ? '' : String(e.rangMax),
      points: String(e.points),
      decrement: String(e.decrement),
    })),
  )

  // Enveloppe l'action : après un enregistrement réussi, réordonner l'affichage par
  // rang croissant — comme le barème est désormais stocké (R48 trie le jeu validé).
  // Les valeurs locales sont exactement celles persistées (validation passée).
  const [etat, action, enCours] = useActionState(
    async (prec: EtatStructure, formData: FormData): Promise<EtatStructure> => {
      const res = await mettreAJourBaremeVitesse(prec, formData)
      if (res?.succes) {
        setLignes((ls) => [...ls].sort((a, b) => Number(a.rangMin) - Number(b.rangMin)))
      }
      return res
    },
    etatInitial,
  )

  const majLigne = (key: string, champ: keyof Omit<LigneEchelon, 'key'>, valeur: string) =>
    setLignes((ls) => ls.map((l) => (l.key === key ? { ...l, [champ]: valeur } : l)))
  const ajouterLigne = () =>
    setLignes((ls) => [
      ...ls,
      { key: `e${compteur.current++}`, rangMin: '', rangMax: '', points: '0', decrement: '0' },
    ])
  const supprimerLigne = (key: string) => setLignes((ls) => ls.filter((l) => l.key !== key))

  // Jeu d'échelons transmis à la Server Action (validation R48 refaite côté serveur).
  const echelonsJson = JSON.stringify(
    lignes.map((l) => ({
      rangMin: l.rangMin,
      rangMax: l.rangMax,
      points: l.points,
      decrement: l.decrement,
    })),
  )

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-bordure bg-black/20 p-3">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="epreuveId" value={bareme.epreuveId} />
      <input type="hidden" name="echelons" value={echelonsJson} />

      <TitreSection>Barème par rang</TitreSection>
      <p className="text-[11px] text-texte-attenue">
        Points d’un rang = points − (rang − rang min) × décrément. Laisser le rang max
        vide pour le dernier échelon (« et + »), qui couvre tous les rangs au-delà. Les
        échelons doivent être contigus, sans trou ni chevauchement, à partir du rang 1.
      </p>

      {editable ? (
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-texte-attenue">
                  <th className="px-1 py-1 text-left font-semibold">Rang min</th>
                  <th className="px-1 py-1 text-left font-semibold">Rang max</th>
                  <th className="px-1 py-1 text-left font-semibold">Points</th>
                  <th className="px-1 py-1 text-left font-semibold">Décrément</th>
                  <th className="px-1 py-1" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.key} className="border-t border-bordure/40">
                    <td className="px-1 py-1.5">
                      <input
                        aria-label="Rang minimum"
                        type="number"
                        min={1}
                        step={1}
                        value={l.rangMin}
                        onChange={(e) => majLigne(l.key, 'rangMin', e.target.value)}
                        className={champNombre}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        aria-label="Rang maximum (vide = et +)"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="et +"
                        value={l.rangMax}
                        onChange={(e) => majLigne(l.key, 'rangMax', e.target.value)}
                        className={champNombre}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        aria-label="Points"
                        type="number"
                        min={0}
                        step={1}
                        value={l.points}
                        onChange={(e) => majLigne(l.key, 'points', e.target.value)}
                        className={champNombre}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        aria-label="Décrément"
                        type="number"
                        min={0}
                        step={1}
                        value={l.decrement}
                        onChange={(e) => majLigne(l.key, 'decrement', e.target.value)}
                        className={champNombre}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => supprimerLigne(l.key)}
                        aria-label="Supprimer l’échelon"
                        className="rounded-lg border border-danger/40 px-2 py-1 text-sm text-danger hover:bg-danger/10"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={ajouterLigne}
            className="self-start rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-doux hover:bg-accent/20"
          >
            + Ajouter un échelon
          </button>
        </div>
      ) : bareme.echelons.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucun échelon de barème.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-texte-attenue">
                <th className="px-1 py-1 text-left font-semibold">Rangs</th>
                <th className="px-1 py-1 text-left font-semibold">Points</th>
                <th className="px-1 py-1 text-left font-semibold">Décrément</th>
              </tr>
            </thead>
            <tbody>
              {bareme.echelons.map((e) => (
                <tr key={e.id} className="border-t border-bordure/40">
                  <td className="px-1 py-1.5 font-medium text-texte-fort">{libelleRang(e)}</td>
                  <td className="px-1 py-1.5 text-texte">{e.points}</td>
                  <td className="px-1 py-1.5 text-texte">{e.decrement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 pt-1">
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-texte-attenue">Chute</span>
          {editable ? (
            <input
              name="pointsChute"
              type="number"
              min={0}
              step={1}
              defaultValue={bareme.pointsChute ?? 0}
              required
              className={champNombre}
            />
          ) : (
            <span className="text-texte">{bareme.pointsChute ?? '—'}</span>
          )}
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-texte-attenue">Non-présentation</span>
          {editable ? (
            <input
              name="pointsNonPresentation"
              type="number"
              min={0}
              step={1}
              defaultValue={bareme.pointsNonPresentation ?? 0}
              required
              className={champNombre}
            />
          ) : (
            <span className="text-texte">{bareme.pointsNonPresentation ?? '—'}</span>
          )}
        </label>
        {editable && (
          <Bouton type="submit" taille="sm" disabled={enCours}>
            Enregistrer le barème
          </Bouton>
        )}
      </div>

      {etat?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && <p className="text-xs text-secondaire">{etat.succes}</p>}
    </form>
  )
}

/** Onglet Vitesse : liste des voies (numéro + libellé) + suppression + ajout (R42, R43, R32, R54). */
function OngletVitesse({
  structure,
  edition,
}: {
  structure: StructureRencontre
  /** Ajout, libellé, suppression et barème : ① et ② (R51, R47). */
  edition: boolean
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
            <li key={vv.id} className="flex flex-wrap items-end gap-1.5">
              <span className="pb-2 text-xs text-texte-doux">{vv.numero}</span>
              {edition ? (
                // Libellé modifiable en ① et ② (spec #20 R9bis, spec #3 R51).
                <FormLibelleVoieVitesse
                  action={modifierLibelleVoieVitesseRencontre}
                  libelle={vv.libelle ?? ''}
                  rang={vv.numero}
                  champsCaches={{ id: vv.id, rencontreId: structure.id }}
                />
              ) : (
                <Etiquette variante="neutre">{vv.libelle ?? '(sans libellé)'}</Etiquette>
              )}
              {edition && (
                <BoutonSupprimer
                  action={supprimerVoieVitesseRencontre}
                  champs={{ id: vv.id, rencontreId: structure.id }}
                  question={`Supprimer la voie de vitesse « ${vv.libelle ?? vv.numero} » ? Ses jetons juges seront aussi supprimés.`}
                  libelle={`la voie de vitesse ${vv.libelle ?? vv.numero}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {edition && (
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

      {structure.baremeVitesse && (
        <EditeurBaremeVitesse
          bareme={structure.baremeVitesse}
          rencontreId={structure.id}
          editable={edition}
        />
      )}
    </div>
  )
}

/** Écran de configuration de la structure d'une rencontre (R40–R45, Option B). */
export function PanneauStructure({ structure }: { structure: StructureRencontre }) {
  const [onglet, setOnglet] = useState<Onglet>('voie')
  // Ajout, modification, suppression et barème en ① et ② (R51, rév. 2026-10-25).
  const edition = editionStructurePossible(structure.phase)
  const repereEditable = repereModifiable(structure.phase)

  const epreuveVoie = structure.epreuves.find((e) => e.type === 'voie')
  const epreuveBloc = structure.epreuves.find((e) => e.type === 'bloc')
  const epreuveVitesse = structure.epreuves.find((e) => e.type === 'vitesse')
  // Bloc et vitesse désactivables en adulte, en ① et ② (spec #20 R36/R37).
  const etatModifiable = etatEpreuveModifiable(structure.phase)
  const desactivable = (e: EpreuveRencontreVue | undefined): e is EpreuveRencontreVue =>
    !!e && epreuveDesactivable(structure.categorie, e.type)
  const desactivee: Record<Onglet, boolean> = {
    voie: false,
    bloc: epreuveBloc?.active === false,
    vitesse: epreuveVitesse?.active === false,
  }

  const comptes: Record<Onglet, number> = {
    voie: epreuveVoie?.voiesDifficulte.length ?? 0,
    bloc: epreuveBloc?.blocs.length ?? 0,
    vitesse: structure.voiesVitesse.length,
  }

  return (
    <Carte className="flex flex-col gap-5 p-5">
      <TitreSection>Structure</TitreSection>

      {!edition && <NoteLectureSeule phase={structure.phase} repereEditable={repereEditable} />}

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
            {desactivee[o.cle] && ' · désactivée'}
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
              edition={edition}
              repereEditable={repereEditable}
            />
          ) : edition ? (
            <FormAjoutEpreuve rencontreId={structure.id} type="voie" libelle="Voies de difficulté" />
          ) : (
            <p className="text-sm text-texte-attenue">Aucune épreuve de voies.</p>
          ))}

        {onglet !== 'voie' && desactivable(onglet === 'bloc' ? epreuveBloc : epreuveVitesse) && (
          <div className="mb-4">
            <EtatEpreuve
              key={onglet}
              epreuve={(onglet === 'bloc' ? epreuveBloc : epreuveVitesse)!}
              rencontreId={structure.id}
              modifiable={etatModifiable}
            />
          </div>
        )}

        {onglet === 'bloc' &&
          (epreuveBloc ? (
            <OngletBlocs
              epreuve={epreuveBloc}
              rencontreId={structure.id}
              edition={edition}
            />
          ) : edition ? (
            <FormAjoutEpreuve rencontreId={structure.id} type="bloc" libelle="Blocs" />
          ) : (
            <p className="text-sm text-texte-attenue">Aucune épreuve de blocs.</p>
          ))}

        {onglet === 'vitesse' && <OngletVitesse structure={structure} edition={edition} />}
      </section>
    </Carte>
  )
}
