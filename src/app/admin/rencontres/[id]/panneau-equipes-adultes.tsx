'use client'

import { useActionState, useId, useRef, useState } from 'react'

import { Bouton, Carte, ChampSelect, ChampTexte, TitreSection } from '@/composants'
import {
  EFFECTIF_EQUIPE_ADULTE_MAX,
  filtrerGrimpeursRecherche,
  nomEquipeAdulteParDefaut,
} from '@/domaine/engagement'
import {
  retirerGrimpeurAdmin,
  supprimerEquipeAdmin,
  type EtatAdminEngagement,
} from '@/lib/admin/engagement-actions'
import {
  ajouterGrimpeurEquipeAdulte,
  changerEquipeAdulte,
  creerEquipeAdulte,
} from '@/lib/admin/equipes-adultes-actions'
import type {
  EquipeAdulte,
  EquipesAdultesRencontre,
  GrimpeurAdulteOption,
  MembreAdulte,
} from '@/lib/admin/equipes-adultes'

const etatInitial: EtatAdminEngagement = undefined

/**
 * Équipes d'une rencontre adulte (spec #20 R10–R15) : sans club, composées par
 * l'admin avec des grimpeurs de 16 ans et plus de tous les clubs, 4 au plus.
 */
export function PanneauEquipesAdultes({ donnees }: { donnees: EquipesAdultesRencontre }) {
  const { rencontreId, equipes, roster } = donnees
  const disponibles = roster.filter((g) => !g.engage)

  return (
    <section className="flex flex-col gap-4">
      <div>
        <TitreSection>Équipes adultes</TitreSection>
        <p className="text-xs text-texte-attenue">
          Équipes sans club, de {EFFECTIF_EQUIPE_ADULTE_MAX} grimpeurs au plus, de 16 ans et plus,
          tous clubs confondus. La mixité et le mélange des clubs sont recommandés, sans contrôle.
          Les coachs n’ont aucun droit sur ces équipes.
        </p>
      </div>

      <Carte className="flex flex-col gap-3 p-4">
        {equipes.length === 0 ? (
          <p className="text-xs italic text-texte-doux">Aucune équipe.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {equipes.map((eq) => (
              <li key={eq.id}>
                <CarteEquipeAdulte
                  rencontreId={rencontreId}
                  equipe={eq}
                  disponibles={disponibles}
                  autresEquipes={equipes
                    .filter((e) => e.id !== eq.id)
                    .map((e) => ({
                      id: e.id,
                      nom: e.nom,
                      complete: e.membres.length >= EFFECTIF_EQUIPE_ADULTE_MAX,
                    }))}
                />
              </li>
            ))}
          </ul>
        )}

        <FormNouvelleEquipeAdulte
          rencontreId={rencontreId}
          nomParDefaut={nomEquipeAdulteParDefaut(equipes.map((e) => e.nom))}
        />
      </Carte>
    </section>
  )
}

type EquipeCible = { id: string; nom: string; complete: boolean }

function CarteEquipeAdulte({
  rencontreId,
  equipe,
  disponibles,
  autresEquipes,
}: {
  rencontreId: string
  equipe: EquipeAdulte
  disponibles: GrimpeurAdulteOption[]
  autresEquipes: EquipeCible[]
}) {
  const complete = equipe.membres.length >= EFFECTIF_EQUIPE_ADULTE_MAX

  return (
    <div className="rounded-xl border border-bordure bg-black/20 p-3" data-equipe={equipe.nom}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-texte-fort">{equipe.nom}</h4>
        <span className="text-xs font-bold text-texte-attenue">
          {equipe.membres.length}/{EFFECTIF_EQUIPE_ADULTE_MAX}
        </span>
      </div>

      {equipe.membres.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-white/5">
          {equipe.membres.map((m) => (
            <LigneMembreAdulte
              key={m.grimpeurId}
              rencontreId={rencontreId}
              equipeId={equipe.id}
              membre={m}
              autresEquipes={autresEquipes}
            />
          ))}
        </ul>
      )}

      {complete ? (
        <p className="mt-2 text-xs text-secondaire">
          Équipe complète — {EFFECTIF_EQUIPE_ADULTE_MAX} grimpeurs au plus.
        </p>
      ) : (
        <FormAjoutAdulte
          key={equipe.membres.map((m) => m.grimpeurId).join(',')}
          rencontreId={rencontreId}
          equipeId={equipe.id}
          disponibles={disponibles}
        />
      )}

      <FormSupprimerEquipe rencontreId={rencontreId} equipeId={equipe.id} nom={equipe.nom} />
    </div>
  )
}

function LigneMembreAdulte({
  rencontreId,
  equipeId,
  membre,
  autresEquipes,
}: {
  rencontreId: string
  equipeId: string
  membre: MembreAdulte
  autresEquipes: EquipeCible[]
}) {
  const [etatRetrait, actionRetrait, retraitEnCours] = useActionState(
    retirerGrimpeurAdmin,
    etatInitial,
  )

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="text-texte-fort">
        {membre.prenom} {membre.nom}
      </span>
      {membre.clubNom && (
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent-doux">
          {membre.clubNom}
        </span>
      )}
      <form action={actionRetrait} className="ml-auto">
        <input type="hidden" name="rencontreId" value={rencontreId} />
        <input type="hidden" name="equipeId" value={equipeId} />
        <input type="hidden" name="grimpeurId" value={membre.grimpeurId} />
        <button
          type="submit"
          disabled={retraitEnCours}
          aria-label={`Retirer ${membre.prenom} ${membre.nom}`}
          className="text-lg leading-none text-danger transition hover:opacity-100 disabled:opacity-40"
        >
          ×
        </button>
      </form>
      {etatRetrait?.erreur && (
        <p role="alert" className="w-full text-xs text-danger">
          {etatRetrait.erreur}
        </p>
      )}
      {autresEquipes.length > 0 && (
        <FormChangerEquipeAdulte
          rencontreId={rencontreId}
          equipeId={equipeId}
          membre={membre}
          autresEquipes={autresEquipes}
        />
      )}
    </li>
  )
}

function FormChangerEquipeAdulte({
  rencontreId,
  equipeId,
  membre,
  autresEquipes,
}: {
  rencontreId: string
  equipeId: string
  membre: MembreAdulte
  autresEquipes: EquipeCible[]
}) {
  const [etat, action, enCours] = useActionState(changerEquipeAdulte, etatInitial)
  const idCible = useId()

  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="equipeId" value={equipeId} />
      <input type="hidden" name="grimpeurId" value={membre.grimpeurId} />
      <label htmlFor={idCible} className="basis-full text-xs text-texte-attenue">
        Changer {membre.prenom} {membre.nom} d’équipe
      </label>
      <select
        id={idCible}
        name="equipeCibleId"
        required
        defaultValue=""
        className="h-11 min-w-0 flex-1 basis-40 rounded-lg border border-bordure bg-black/30 px-3 text-base text-texte-fort [color-scheme:dark] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
      >
        <option value="" disabled className="bg-fond text-texte">
          Équipe de destination…
        </option>
        {autresEquipes.map((e) => (
          <option key={e.id} value={e.id} disabled={e.complete} className="bg-fond text-texte">
            {e.nom}
            {e.complete ? ` (complète, ${EFFECTIF_EQUIPE_ADULTE_MAX})` : ''}
          </option>
        ))}
      </select>
      <Bouton type="submit" taille="sm" variante="secondaire" disabled={enCours} className="h-11 shrink-0">
        Changer d’équipe
      </Bouton>
      {etat?.erreur && (
        <p role="alert" className="basis-full text-xs text-danger">
          {etat.erreur}
        </p>
      )}
    </form>
  )
}

function FormAjoutAdulte({
  rencontreId,
  equipeId,
  disponibles,
}: {
  rencontreId: string
  equipeId: string
  disponibles: GrimpeurAdulteOption[]
}) {
  const [etat, action, enCours] = useActionState(ajouterGrimpeurEquipeAdulte, etatInitial)
  const idRecherche = useId()
  const idGrimpeur = useId()
  const [recherche, setRecherche] = useState('')
  const filtres = filtrerGrimpeursRecherche(disponibles, recherche)

  if (disponibles.length === 0) {
    return <p className="mt-2 text-xs text-texte-doux">Aucun grimpeur de 16 ans et plus disponible.</p>
  }

  return (
    <form
      action={action}
      className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-bordure bg-accent/[0.03] p-2"
    >
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="equipeId" value={equipeId} />
      <ChampTexte
        id={idRecherche}
        label="Ajouter un grimpeur (tous clubs, 16 ans et plus)"
        type="search"
        placeholder="Rechercher un nom ou prénom…"
        autoComplete="off"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
      />
      <ChampSelect
        key={recherche}
        id={idGrimpeur}
        name="grimpeurId"
        label={`Grimpeur (${filtres.length})`}
        defaultValue={filtres.length === 1 ? filtres[0].id : undefined}
        options={filtres.map((g) => ({
          value: g.id,
          label: g.clubNom ? `${g.prenom} ${g.nom} · ${g.clubNom}` : `${g.prenom} ${g.nom}`,
        }))}
        placeholder={filtres.length ? '— Choisir —' : 'Aucun grimpeur pour cette recherche'}
        required
      />
      {etat?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etat.erreur}
        </p>
      )}
      <Bouton type="submit" taille="sm" disabled={enCours}>
        {enCours ? 'Ajout…' : 'Ajouter'}
      </Bouton>
    </form>
  )
}

function FormSupprimerEquipe({
  rencontreId,
  equipeId,
  nom,
}: {
  rencontreId: string
  equipeId: string
  nom: string
}) {
  const [etat, action, enCours] = useActionState(supprimerEquipeAdmin, etatInitial)
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="equipeId" value={equipeId} />
      <Bouton
        type="submit"
        variante="fantome"
        taille="sm"
        disabled={enCours}
        aria-label={`Supprimer l'équipe ${nom}`}
      >
        Supprimer l’équipe
      </Bouton>
      {etat?.erreur && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {etat.erreur}
        </span>
      )}
    </form>
  )
}

/** Création d'une équipe adulte, pré-remplie « Équipe N » (spec #20 R14). */
function FormNouvelleEquipeAdulte({
  rencontreId,
  nomParDefaut,
}: {
  rencontreId: string
  nomParDefaut: string
}) {
  const [etat, action, enCours] = useActionState(creerEquipeAdulte, etatInitial)
  const idNom = useId()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={(fd) => {
        action(fd)
        formRef.current?.reset()
      }}
      className="flex items-end gap-2 rounded-lg border border-dashed border-bordure bg-accent/[0.03] p-2"
    >
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <ChampTexte
        key={nomParDefaut}
        id={idNom}
        name="nom"
        label="Nouvelle équipe"
        defaultValue={nomParDefaut}
        required
        maxLength={100}
        autoComplete="off"
        erreur={etat?.erreur}
        className="flex-1"
      />
      <Bouton type="submit" taille="sm" disabled={enCours}>
        {enCours ? 'Création…' : 'Créer'}
      </Bouton>
    </form>
  )
}
