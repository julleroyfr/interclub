'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Bouton, Carte, Etiquette, TitreSection } from '@/composants'
import {
  CATEGORIES,
  PHASES,
  phasePrecedente,
  phaseSuivante,
  type Phase,
} from '@/domaine/rencontre'
import { changerPhaseRencontre } from '@/lib/rencontres/actions'
import type { EtatRencontre } from '@/lib/rencontres/rencontres'
import type { RencontreTdb } from '@/lib/tableau-de-bord/tableau-de-bord'

const labelCategorie = (v: string) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

const variantePhase = (phase: Phase) => {
  if (phase === 'competition') return 'accent' as const
  if (phase === 'resultats_publics') return 'succes' as const
  return 'neutre' as const
}

function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString(
    'fr-FR',
    { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' },
  )
}

/** Ligne de rencontre avec boutons avancer/revenir de phase. */
function LigneRencontreTdb({ rencontre }: { rencontre: RencontreTdb }) {
  const etatInitial: EtatRencontre = undefined
  const [etatPhase, actionPhase, phaseEnCours] = useActionState(
    changerPhaseRencontre,
    etatInitial,
  )

  const precedente = phasePrecedente(rencontre.phase)
  const suivante = phaseSuivante(rencontre.phase)

  return (
    <li
      key={`${rencontre.id}:${rencontre.phase}`}
      className="flex flex-col gap-2 rounded-xl border border-bordure bg-black/20 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-texte-fort">
            {labelCategorie(rencontre.categorie)} · {rencontre.clubPorteurNom}
          </p>
          <p className="mt-0.5 text-xs text-texte-doux">
            {formaterDate(rencontre.dateRencontre)}
          </p>
        </div>
        <Etiquette variante={variantePhase(rencontre.phase)}>
          {labelPhase(rencontre.phase)}
        </Etiquette>
      </div>

      <div className="flex flex-wrap gap-2">
        {precedente && (
          <form action={actionPhase}>
            <input type="hidden" name="id" value={rencontre.id} />
            <input type="hidden" name="phase" value={precedente} />
            <Bouton type="submit" variante="fantome" taille="sm" disabled={phaseEnCours}>
              ← {labelPhase(precedente)}
            </Bouton>
          </form>
        )}
        {suivante && (
          <form action={actionPhase}>
            <input type="hidden" name="id" value={rencontre.id} />
            <input type="hidden" name="phase" value={suivante} />
            <Bouton type="submit" taille="sm" disabled={phaseEnCours}>
              {labelPhase(suivante)} →
            </Bouton>
          </form>
        )}
      </div>

      {etatPhase?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etatPhase.erreur}
        </p>
      )}
    </li>
  )
}

/** Carte principale du tableau de bord : liste des rencontres + actions de phase. */
export function CarteRencontres({
  rencontres,
  totalRencontres,
}: {
  rencontres: RencontreTdb[]
  totalRencontres: number
}) {
  return (
    <Carte className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <TitreSection>Rencontres</TitreSection>
        <Link
          href="/admin/rencontres"
          className="text-xs font-medium text-accent-doux hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Gérer →
        </Link>
      </div>

      {rencontres.length === 0 ? (
        <p className="text-sm text-texte-attenue">
          Aucune rencontre.{' '}
          <Link href="/admin/rencontres" className="text-accent-doux hover:underline">
            Créer la première →
          </Link>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {rencontres.map((r) => (
              <LigneRencontreTdb key={`${r.id}:${r.phase}`} rencontre={r} />
            ))}
          </ul>
          {totalRencontres > 5 && (
            <Link
              href="/admin/rencontres"
              className="text-xs text-texte-attenue hover:text-texte focus-visible:outline-none"
            >
              Voir tout ({totalRencontres} rencontres) →
            </Link>
          )}
        </>
      )}
    </Carte>
  )
}
