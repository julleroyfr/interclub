'use client'

import { useActionState, useId, useRef } from 'react'

import { Bouton, Carte, ChampSelect, ChampTexte, TitreSection } from '@/composants'
import { EFFECTIF_EQUIPE_MAX, GROUPES_DEPART } from '@/domaine/engagement'
import {
  ajouterGrimpeurAdmin,
  creerEquipeAdmin,
  definirGroupeAdmin,
  retirerGrimpeurAdmin,
  supprimerEquipeAdmin,
  type EtatAdminEngagement,
} from '@/lib/admin/engagement-actions'
import type { EngagementClub } from '@/lib/admin/engagement'
import type { EquipeEngagee, MembreEquipe, OptionGrimpeur } from '@/lib/coach/engagement'

const etatInitial: EtatAdminEngagement = undefined
const OPTIONS_GROUPE = GROUPES_DEPART.map((g) => ({ value: g, label: `Groupe ${g}` }))

/**
 * CRUD admin des équipes/compositions de TOUS les clubs d'une rencontre (R10),
 * en toute phase (R6). Un bloc par club : ses équipes + un formulaire de création.
 */
export function PanneauEquipes({
  rencontreId,
  estEnfant,
  clubs,
}: {
  rencontreId: string
  estEnfant: boolean
  clubs: EngagementClub[]
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <TitreSection>Équipes & engagement (tous clubs)</TitreSection>
        <p className="text-xs text-texte-attenue">
          Créez, composez ou corrigez les équipes de n’importe quel club, en toute
          phase (R10).
        </p>
      </div>

      {clubs.map((c) => {
        const nbEquipes = c.engagement.equipes.length
        const nbGrimpeurs = c.engagement.equipes.reduce((n, eq) => n + eq.membres.length, 0)
        return (
          <Carte key={c.clubId} className="p-0">
            {/* Repliable par club : une dizaine d'équipes reste scannable. */}
            <details open className="group" data-club={c.clubNom}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 hover:bg-surface-forte">
                <h3 className="text-sm font-bold text-texte-fort">{c.clubNom}</h3>
                <span className="flex items-center gap-2 text-xs text-texte-attenue">
                  {nbEquipes} équipe(s) · {nbGrimpeurs} grimpeur(s)
                  <span className="text-texte-doux transition group-open:rotate-180">▾</span>
                </span>
              </summary>

              <div className="flex flex-col gap-3 px-4 pb-4">
                {nbEquipes === 0 ? (
                  <p className="text-xs italic text-texte-doux">Aucune équipe.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {c.engagement.equipes.map((eq) => (
                      <li key={eq.id}>
                        <CarteEquipe
                          rencontreId={rencontreId}
                          equipe={eq}
                          roster={c.engagement.roster}
                          estEnfant={estEnfant}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <FormNouvelleEquipe rencontreId={rencontreId} clubId={c.clubId} />
              </div>
            </details>
          </Carte>
        )
      })}
    </section>
  )
}

function CarteEquipe({
  rencontreId,
  equipe,
  roster,
  estEnfant,
}: {
  rencontreId: string
  equipe: EquipeEngagee
  roster: OptionGrimpeur[]
  estEnfant: boolean
}) {
  const complete = equipe.membres.length >= EFFECTIF_EQUIPE_MAX
  const disponibles = roster.filter((g) => !g.dejaEngage)

  return (
    <div className="rounded-xl border border-bordure bg-black/20 p-3" data-equipe={equipe.nom}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-texte-fort">{equipe.nom}</h4>
        <span className="text-xs font-bold text-texte-attenue">
          {equipe.membres.length}/{EFFECTIF_EQUIPE_MAX}
        </span>
      </div>

      {equipe.membres.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-white/5">
          {equipe.membres.map((m) => (
            <LigneMembre
              key={`${m.grimpeurId}:${m.groupeDepart ?? ''}`}
              rencontreId={rencontreId}
              equipeId={equipe.id}
              membre={m}
              estEnfant={estEnfant}
            />
          ))}
        </ul>
      )}

      {complete ? (
        <p className="mt-2 text-xs text-secondaire">
          Équipe complète — plafond de {EFFECTIF_EQUIPE_MAX} (R15).
        </p>
      ) : (
        <FormAjout
          key={equipe.membres.map((m) => m.grimpeurId).join(',')}
          rencontreId={rencontreId}
          equipeId={equipe.id}
          disponibles={disponibles}
          estEnfant={estEnfant}
        />
      )}

      <FormSupprimer rencontreId={rencontreId} equipeId={equipe.id} nom={equipe.nom} />
    </div>
  )
}

function LigneMembre({
  rencontreId,
  equipeId,
  membre,
  estEnfant,
}: {
  rencontreId: string
  equipeId: string
  membre: MembreEquipe
  estEnfant: boolean
}) {
  const [etatRetrait, actionRetrait, retraitEnCours] = useActionState(
    retirerGrimpeurAdmin,
    etatInitial,
  )
  const [, actionGroupe, groupeEnCours] = useActionState(definirGroupeAdmin, etatInitial)
  const idGroupe = useId()

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="text-texte-fort">
        {membre.prenom} {membre.nom}
      </span>
      {membre.prete && (
        <span className="inline-flex items-center rounded-full border border-prete/35 bg-prete/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-prete">
          Prêté{membre.clubOrigineNom ? ` · ${membre.clubOrigineNom}` : ''}
        </span>
      )}

      {estEnfant && (
        <form action={actionGroupe} className="ml-auto flex items-center gap-1">
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="equipeId" value={equipeId} />
          <input type="hidden" name="grimpeurId" value={membre.grimpeurId} />
          <label htmlFor={idGroupe} className="sr-only">
            Groupe de départ de {membre.prenom} {membre.nom}
          </label>
          <select
            id={idGroupe}
            name="groupeDepart"
            defaultValue={membre.groupeDepart ?? ''}
            className="h-9 rounded-lg border border-bordure bg-black/30 px-2 text-xs text-texte-fort [color-scheme:dark] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="" className="bg-fond text-texte">
              à définir
            </option>
            {GROUPES_DEPART.map((g) => (
              <option key={g} value={g} className="bg-fond text-texte">
                Groupe {g}
              </option>
            ))}
          </select>
          <Bouton type="submit" taille="sm" variante="secondaire" disabled={groupeEnCours}>
            OK
          </Bouton>
        </form>
      )}

      <form action={actionRetrait} className={estEnfant ? '' : 'ml-auto'}>
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
    </li>
  )
}

function FormAjout({
  rencontreId,
  equipeId,
  disponibles,
  estEnfant,
}: {
  rencontreId: string
  equipeId: string
  disponibles: OptionGrimpeur[]
  estEnfant: boolean
}) {
  const [etat, action, enCours] = useActionState(ajouterGrimpeurAdmin, etatInitial)
  const idGrimpeur = useId()
  const idGroupe = useId()

  if (disponibles.length === 0) {
    return (
      <p className="mt-2 text-xs text-texte-doux">
        Aucun grimpeur disponible pour ce club.
      </p>
    )
  }

  return (
    <form
      action={action}
      className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-bordure bg-accent/[0.03] p-2"
    >
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="equipeId" value={equipeId} />
      <ChampSelect
        id={idGrimpeur}
        name="grimpeurId"
        label="Ajouter un grimpeur"
        options={disponibles.map((g) => ({
          value: g.id,
          label: g.prete
            ? `${g.prenom} ${g.nom} (prêté · ${g.clubOrigineNom})`
            : `${g.prenom} ${g.nom}`,
        }))}
        placeholder="— Choisir —"
        required
      />
      {estEnfant && (
        <ChampSelect
          id={idGroupe}
          name="groupeDepart"
          label="Groupe (optionnel)"
          options={OPTIONS_GROUPE}
          placeholder="— À définir —"
        />
      )}
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

function FormSupprimer({
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

function FormNouvelleEquipe({
  rencontreId,
  clubId,
}: {
  rencontreId: string
  clubId: string
}) {
  const [etat, action, enCours] = useActionState(creerEquipeAdmin, etatInitial)
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
      <input type="hidden" name="clubId" value={clubId} />
      <ChampTexte
        id={idNom}
        name="nom"
        label="Nouvelle équipe"
        placeholder="Ex. A3"
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
