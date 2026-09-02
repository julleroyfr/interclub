'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'

import { Bouton, ChampSelect, ChampTexte } from '@/composants'
import { EFFECTIF_EQUIPE_MAX, GROUPES_DEPART, voiesDuGroupeDepart } from '@/domaine/engagement'
import {
  ajouterGrimpeurEquipe,
  creerEquipe,
  definirGroupeDepart,
  retirerGrimpeurEquipe,
  supprimerEquipe,
  type EtatEngagement,
} from '@/lib/coach/actions'
import type {
  EngagementRencontre,
  EquipeEngagee,
  MembreEquipe,
} from '@/lib/coach/engagement'

const etatInitial: EtatEngagement = undefined

/** Options de groupe de départ (R19) : M1–M4 puis T1–T8 (T9/T10 exclus). */
const OPTIONS_GROUPE = GROUPES_DEPART.map((g) => ({ value: g, label: `Groupe ${g}` }))

/**
 * Panneau d'engagement (spec #5) : équipes du club avec composition et effectif
 * n/8, et — si l'édition est ouverte (R16) — les formulaires CRUD équipe (R10),
 * composition (R12–R15) et groupe de départ (R19–R21). Hors fenêtre : lecture
 * seule (R17), aucun formulaire affiché. La RLS reste la frontière ultime.
 */
export function PanneauEngagement({
  engagement,
  peutEditer,
  estEnfant,
}: {
  engagement: EngagementRencontre
  peutEditer: boolean
  estEnfant: boolean
}) {
  const rencontreId = engagement.id

  return (
    <div className="flex flex-col gap-4">
      {!peutEditer && (
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-sm text-texte-attenue">
          Cette rencontre n’est pas dans une phase d’édition : la composition est
          consultable mais ne peut plus être modifiée (R17).
        </p>
      )}

      {engagement.equipes.length === 0 ? (
        <p className="text-sm text-texte-attenue">
          Aucune équipe engagée pour l’instant.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {engagement.equipes.map((eq) => (
            <li key={eq.id}>
              <CarteEquipe
                equipe={eq}
                rencontreId={rencontreId}
                roster={engagement.roster}
                peutEditer={peutEditer}
                estEnfant={estEnfant}
              />
            </li>
          ))}
        </ul>
      )}

      {peutEditer && <FormNouvelleEquipe rencontreId={rencontreId} />}
    </div>
  )
}

/** Jauge visuelle d'effectif n/8 ; les grimpeurs prêtés apparaissent en violet. */
function JaugeEffectif({ total, prete }: { total: number; prete: number }) {
  const plein = total >= EFFECTIF_EQUIPE_MAX
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold text-texte-attenue">
      <span className="flex gap-0.5">
        {Array.from({ length: EFFECTIF_EQUIPE_MAX }, (_, i) => {
          const rempli = i < total
          const estPrete = i >= total - prete && rempli
          return (
            <span
              key={i}
              aria-hidden
              className={`inline-block size-2 rounded-sm ${
                rempli ? (estPrete ? 'bg-prete' : 'bg-accent') : 'bg-surface-forte'
              }`}
            />
          )
        })}
      </span>
      <span className={plein ? 'text-secondaire' : 'text-texte-fort'}>
        {total}
      </span>
      /{EFFECTIF_EQUIPE_MAX}
    </span>
  )
}

/** Carte d'une équipe : en-tête (nom, effectif, suppression) + composition + ajout. */
function CarteEquipe({
  equipe,
  rencontreId,
  roster,
  peutEditer,
  estEnfant,
}: {
  equipe: EquipeEngagee
  rencontreId: string
  roster: EngagementRencontre['roster']
  peutEditer: boolean
  estEnfant: boolean
}) {
  const nbPrete = equipe.membres.filter((m) => m.prete).length
  const complete = equipe.membres.length >= EFFECTIF_EQUIPE_MAX
  // Grimpeurs du roster ajoutables : pas déjà engagés dans la rencontre (R14).
  const disponibles = roster.filter((g) => !g.dejaEngage)

  return (
    <div className="rounded-2xl border border-bordure bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-texte-fort">{equipe.nom}</h3>
        <JaugeEffectif total={equipe.membres.length} prete={nbPrete} />
      </div>

      {equipe.membres.length === 0 ? (
        <p className="mt-3 text-xs italic text-texte-doux">Équipe vide.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-white/5">
          {equipe.membres.map((m) => (
            <LigneMembre
              key={`${m.grimpeurId}:${m.groupeDepart ?? ''}`}
              equipe={equipe}
              membre={m}
              rencontreId={rencontreId}
              peutEditer={peutEditer}
              estEnfant={estEnfant}
            />
          ))}
        </ul>
      )}

      {peutEditer && (
        <>
          {complete ? (
            <p className="mt-3 text-xs text-secondaire">
              Équipe complète — plafond de {EFFECTIF_EQUIPE_MAX} atteint (R15).
            </p>
          ) : (
            <FormAjoutGrimpeur
              // Remonte (formulaire vidé) dès que la composition change (succès).
              key={equipe.membres.map((m) => m.grimpeurId).join(',')}
              equipe={equipe}
              rencontreId={rencontreId}
              disponibles={disponibles}
              estEnfant={estEnfant}
            />
          )}
          <FormSupprimerEquipe equipe={equipe} rencontreId={rencontreId} />
        </>
      )}
    </div>
  )
}

/** Une ligne de composition : grimpeur, badge prêté, groupe de départ, retrait. */
function LigneMembre({
  equipe,
  membre,
  rencontreId,
  peutEditer,
  estEnfant,
}: {
  equipe: EquipeEngagee
  membre: MembreEquipe
  rencontreId: string
  peutEditer: boolean
  estEnfant: boolean
}) {
  const [etat, action, enCours] = useActionState(retirerGrimpeurEquipe, etatInitial)

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
        <span className="ml-auto">
          <GroupeDepart
            equipe={equipe}
            membre={membre}
            rencontreId={rencontreId}
            editable={peutEditer}
          />
        </span>
      )}

      {peutEditer && (
        <form action={action} className={estEnfant ? '' : 'ml-auto'}>
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="equipeId" value={equipe.id} />
          <input type="hidden" name="grimpeurId" value={membre.grimpeurId} />
          <button
            type="submit"
            disabled={enCours}
            aria-label={`Retirer ${membre.prenom} ${membre.nom}`}
            className="text-lg leading-none text-danger transition hover:opacity-100 disabled:opacity-40"
          >
            ×
          </button>
        </form>
      )}

      {etat?.erreur && (
        <p role="alert" className="w-full text-xs text-danger">
          {etat.erreur}
        </p>
      )}
    </li>
  )
}

/** Groupe de départ d'un membre enfant (R19–R21) : badge en lecture, sélecteur en édition. */
function GroupeDepart({
  equipe,
  membre,
  rencontreId,
  editable,
}: {
  equipe: EquipeEngagee
  membre: MembreEquipe
  rencontreId: string
  editable: boolean
}) {
  const [etat, action, enCours] = useActionState(definirGroupeDepart, etatInitial)
  const idGroupe = useId()

  if (!editable) {
    return membre.groupeDepart ? (
      <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent-doux">
        Groupe {membre.groupeDepart}
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full border border-dashed border-bordure px-2 py-0.5 text-[11px] font-medium text-texte-doux">
        à définir
      </span>
    )
  }

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="equipeId" value={equipe.id} />
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
      <Bouton type="submit" taille="sm" variante="secondaire" disabled={enCours}>
        OK
      </Bouton>
      {etat?.erreur && (
        <span role="alert" className="text-xs text-danger">
          {etat.erreur}
        </span>
      )}
    </form>
  )
}

/** Formulaire d'ajout d'un grimpeur du roster à l'équipe (R12/R19). */
function FormAjoutGrimpeur({
  equipe,
  rencontreId,
  disponibles,
  estEnfant,
}: {
  equipe: EquipeEngagee
  rencontreId: string
  disponibles: EngagementRencontre['roster']
  estEnfant: boolean
}) {
  const [etat, action, enCours] = useActionState(ajouterGrimpeurEquipe, etatInitial)
  const idGrimpeur = useId()
  const idGroupe = useId()
  // Après un ajout réussi, la revalidation change la composition : le parent
  // remonte ce formulaire (via `key`), ce qui le vide sans setState dans un effet.
  const [groupe, setGroupe] = useState('')

  if (disponibles.length === 0) {
    return (
      <p className="mt-3 text-xs text-texte-doux">
        Tous les grimpeurs du club sont déjà engagés dans cette rencontre.
      </p>
    )
  }

  const voies = groupe ? voiesDuGroupeDepart(groupe).join(' · ') : null

  return (
    <form
      action={action}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-dashed border-bordure bg-accent/[0.03] p-3"
    >
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="equipeId" value={equipe.id} />

      <ChampSelect
        id={idGrimpeur}
        name="grimpeurId"
        label="Ajouter depuis le roster"
        tonLabel="accent"
        options={disponibles.map((g) => ({
          value: g.id,
          label: g.prete
            ? `${g.prenom} ${g.nom} (prêté · ${g.clubOrigineNom})`
            : `${g.prenom} ${g.nom}`,
        }))}
        placeholder="— Choisir un grimpeur —"
        required
      />

      {estEnfant && (
        <div>
          <ChampSelect
            id={idGroupe}
            name="groupeDepart"
            label="Groupe de départ (optionnel)"
            options={OPTIONS_GROUPE}
            placeholder="— À définir —"
            onChange={(e) => setGroupe(e.target.value)}
          />
          {voies && (
            <p className="mt-1 text-xs text-accent-doux">
              Voies de l’enfant : <strong>{voies}</strong> (3 voies croissantes).
            </p>
          )}
        </div>
      )}

      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Ajout…' : 'Ajouter à l’équipe'}
      </Bouton>
    </form>
  )
}

/** Suppression d'une équipe (R10), avec confirmation. */
function FormSupprimerEquipe({
  equipe,
  rencontreId,
}: {
  equipe: EquipeEngagee
  rencontreId: string
}) {
  const [etat, action, enCours] = useActionState(supprimerEquipe, etatInitial)
  const [confirme, setConfirme] = useState(false)

  return (
    <div className="mt-2">
      {confirme ? (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="rencontreId" value={rencontreId} />
          <input type="hidden" name="equipeId" value={equipe.id} />
          <span className="text-xs text-texte-attenue">
            Supprimer « {equipe.nom} » et sa composition ?
          </span>
          <Bouton type="submit" variante="danger" taille="sm" disabled={enCours}>
            {enCours ? 'Suppression…' : 'Oui, supprimer'}
          </Bouton>
          <Bouton variante="fantome" taille="sm" onClick={() => setConfirme(false)}>
            Non
          </Bouton>
        </form>
      ) : (
        <Bouton variante="fantome" taille="sm" onClick={() => setConfirme(true)}>
          Supprimer l’équipe
        </Bouton>
      )}
      {etat?.erreur && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {etat.erreur}
        </p>
      )}
    </div>
  )
}

/** Formulaire de création d'une nouvelle équipe (R10/R11). Se vide après succès. */
function FormNouvelleEquipe({ rencontreId }: { rencontreId: string }) {
  const [etat, action, enCours] = useActionState(creerEquipe, etatInitial)
  const idNom = useId()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (etat?.succes) formRef.current?.reset()
  }, [etat?.succes])

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-bordure bg-accent/[0.03] p-4"
    >
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <ChampTexte
        id={idNom}
        name="nom"
        label="Nouvelle équipe"
        tonLabel="accent"
        placeholder="Ex. A3"
        required
        maxLength={100}
        autoComplete="off"
        erreur={etat?.erreur}
      />
      <Bouton type="submit" disabled={enCours}>
        {enCours ? 'Création…' : 'Créer l’équipe'}
      </Bouton>
    </form>
  )
}
