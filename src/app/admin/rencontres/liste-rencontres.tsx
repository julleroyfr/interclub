'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'

import { Bouton, ChampSelect, ChampTexte, Etiquette, variantePhase } from '@/composants'
import {
  CATEGORIES,
  PHASES,
  labelSaison,
  peutEntrerEnPhase,
  phasePrecedenteEffective,
  phaseSuivante,
  type Phase,
} from '@/domaine/rencontre'
import {
  changerPhaseRencontre,
  modifierRencontre,
  supprimerRencontre,
} from '@/lib/rencontres/actions'
import type {
  EtatRencontre,
  OptionClub,
  RencontreAvecDependances,
} from '@/lib/rencontres/rencontres'

const etatInitial: EtatRencontre = undefined

const optionsCategorie = CATEGORIES.map((c) => ({ value: c.value, label: c.label }))
const labelCategorie = (v: string) =>
  CATEGORIES.find((c) => c.value === v)?.label ?? v
const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

/** Date ISO (AAAA-MM-JJ) affichée en français, sans dérive de fuseau. */
function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString(
    'fr-FR',
    { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' },
  )
}

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Liste des rencontres avec édition inline, changement de phase et suppression. */
export function ListeRencontres({
  rencontres,
  clubs,
}: {
  rencontres: RencontreAvecDependances[]
  clubs: OptionClub[]
}) {
  if (rencontres.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">Aucune rencontre pour l’instant.</p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {rencontres.map((r) => (
        // La clé inclut les champs mutables : après une écriture (revalidation),
        // la ligne se remonte à neuf — l'éditeur inline se referme sans effet.
        <li
          key={`${r.id}:${r.phase}:${r.dateRencontre}:${r.categorie}:${r.clubPorteurId}`}
        >
          <LigneRencontre rencontre={r} clubs={clubs} />
        </li>
      ))}
    </ul>
  )
}

function LigneRencontre({
  rencontre,
  clubs,
}: {
  rencontre: RencontreAvecDependances
  clubs: OptionClub[]
}) {
  const [edition, setEdition] = useState(false)
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [etatMod, actionMod, modEnCours] = useActionState(
    modifierRencontre,
    etatInitial,
  )
  const [etatPhase, actionPhase, phaseEnCours] = useActionState(
    changerPhaseRencontre,
    etatInitial,
  )
  const [etatSuppr, actionSuppr, supprEnCours] = useActionState(
    supprimerRencontre,
    etatInitial,
  )
  const idDate = useId()
  const idClub = useId()
  const idCat = useId()

  const optionsClub = clubs.map((c) => ({ value: c.id, label: c.nom }))
  const aujourdhui = aujourdhuiISO()
  // Garde-fou jour J (R5) reflété dans l'IHM : préparation ET compétition ne
  // s'activent que le jour de la rencontre ; reculer depuis la compétition hors
  // jour J ramène en pré-compétition (l'action reste la garde autoritaire).
  const precedente = phasePrecedenteEffective(rencontre.phase, rencontre.dateRencontre, aujourdhui)
  const suivante = phaseSuivante(rencontre.phase)
  const aDependances = rencontre.nbEquipes > 0 || rencontre.nbEpreuves > 0
  const suivanteBloquee =
    suivante !== null && !peutEntrerEnPhase(suivante, rencontre.dateRencontre, aujourdhui)
  const precedenteBloquee =
    precedente !== null && !peutEntrerEnPhase(precedente, rencontre.dateRencontre, aujourdhui)

  return (
    <div className="rounded-2xl border border-bordure bg-black/20 p-4">
      {edition ? (
        <form action={actionMod} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={rencontre.id} />
          <ChampTexte
            id={idDate}
            name="dateRencontre"
            type="date"
            label="Date de la rencontre"
            defaultValue={rencontre.dateRencontre}
            required
            erreur={etatMod?.erreur}
          />
          <ChampSelect
            id={idClub}
            name="clubPorteurId"
            label="Club porteur"
            options={optionsClub}
            defaultValue={rencontre.clubPorteurId}
            required
          />
          <ChampSelect
            id={idCat}
            name="categorie"
            label="Catégorie"
            options={optionsCategorie}
            defaultValue={rencontre.categorie}
            required
          />
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
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-texte-fort">
                {formaterDate(rencontre.dateRencontre)}
              </p>
              <p className="mt-1 text-xs text-texte-doux">
                {labelCategorie(rencontre.categorie)} · {rencontre.clubPorteurNom}
              </p>
              <p className="mt-1 text-xs text-texte-doux">
                Saison {labelSaison(rencontre.saison)} ·{' '}
                {rencontre.nbEquipes} équipe(s) · {rencontre.nbEpreuves} épreuve(s)
              </p>
            </div>
            <Etiquette variante={variantePhase[rencontre.phase]}>
              {labelPhase(rencontre.phase)}
            </Etiquette>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {precedente && (
              <form action={actionPhase}>
                <input type="hidden" name="id" value={rencontre.id} />
                <input type="hidden" name="phase" value={precedente} />
                <Bouton
                  type="submit"
                  variante="fantome"
                  disabled={phaseEnCours || precedenteBloquee}
                  title={
                    precedenteBloquee
                      ? 'Activable seulement le jour de la rencontre (R5).'
                      : undefined
                  }
                >
                  ← {labelPhase(precedente)}
                </Bouton>
              </form>
            )}
            {suivante && (
              <>
                <form action={actionPhase}>
                  <input type="hidden" name="id" value={rencontre.id} />
                  <input type="hidden" name="phase" value={suivante} />
                  <Bouton
                    type="submit"
                    disabled={phaseEnCours || suivanteBloquee}
                    title={
                      suivanteBloquee
                        ? 'Activable seulement le jour de la rencontre (R5).'
                        : undefined
                    }
                  >
                    {labelPhase(suivante)} →
                  </Bouton>
                </form>
                {suivanteBloquee && (
                  <span className="basis-full text-xs text-texte-doux">
                    {labelPhase(suivante)} ne s’active que le jour de la rencontre (R5).
                  </span>
                )}
              </>
            )}

            <Link
              href={`/admin/rencontres/${rencontre.id}`}
              className="inline-flex items-center rounded-xl border border-bordure px-3 py-1.5 text-sm text-texte-fort transition hover:bg-surface-forte"
            >
              Tableau de bord
            </Link>

            <Bouton variante="fantome" onClick={() => setEdition(true)}>
              Modifier
            </Bouton>

            {confirmSuppr ? (
              <form action={actionSuppr} className="flex items-center gap-2">
                <input type="hidden" name="id" value={rencontre.id} />
                <span className="text-xs text-texte-attenue">
                  {aDependances ? 'Supprimer (et ses équipes/épreuves) ?' : 'Confirmer ?'}
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

      {etatPhase?.erreur && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {etatPhase.erreur}
        </p>
      )}
      {etatSuppr?.erreur && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {etatSuppr.erreur}
        </p>
      )}
    </div>
  )
}
