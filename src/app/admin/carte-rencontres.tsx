'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Bouton, Carte, Etiquette, TitreSection, variantePhase } from '@/composants'
import {
  CATEGORIES,
  PHASES,
  labelSaison,
  peutEntrerEnPhase,
  phasePrecedenteEffective,
  phaseSuivante,
  type Phase,
} from '@/domaine/rencontre'
import { changerPhaseRencontre } from '@/lib/rencontres/actions'
import type { EtatRencontre } from '@/lib/rencontres/rencontres'
import type { RencontreTdb } from '@/lib/tableau-de-bord/tableau-de-bord'

const labelCategorie = (v: string) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

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

/** Ligne de rencontre avec boutons avancer/revenir de phase. */
function LigneRencontreTdb({ rencontre }: { rencontre: RencontreTdb }) {
  const etatInitial: EtatRencontre = undefined
  const [etatPhase, actionPhase, phaseEnCours] = useActionState(
    changerPhaseRencontre,
    etatInitial,
  )

  const aujourdhui = aujourdhuiISO()
  // Garde-fou jour J (R5) reflété dans l'IHM : préparation ET compétition ne
  // s'activent que le jour de la rencontre ; reculer depuis la compétition hors
  // jour J ramène en pré-compétition (l'action reste la garde autoritaire).
  const precedente = phasePrecedenteEffective(rencontre.phase, rencontre.dateRencontre, aujourdhui)
  const suivante = phaseSuivante(rencontre.phase)
  const suivanteBloquee =
    suivante !== null && !peutEntrerEnPhase(suivante, rencontre.dateRencontre, aujourdhui)
  const precedenteBloquee =
    precedente !== null && !peutEntrerEnPhase(precedente, rencontre.dateRencontre, aujourdhui)

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
              taille="sm"
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
          <form action={actionPhase}>
            <input type="hidden" name="id" value={rencontre.id} />
            <input type="hidden" name="phase" value={suivante} />
            <Bouton
              type="submit"
              taille="sm"
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
        )}
        <Link
          href={`/admin/jetons?rencontre=${rencontre.id}`}
          aria-label="Jetons QR de cette rencontre"
          title="Jetons QR"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-bordure text-texte-attenue transition hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <IconeQR />
        </Link>
      </div>

      {etatPhase?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etatPhase.erreur}
        </p>
      )}
    </li>
  )
}

function IconeQR() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      {/* cadre haut-gauche */}
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
      {/* cadre haut-droit */}
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
      {/* cadre bas-gauche */}
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
      {/* modules bas-droit */}
      <rect x="14" y="14" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="18" y="14" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="14" y="18" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="18" y="18" width="3" height="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Carte principale du tableau de bord : liste des rencontres + actions de phase. */
export function CarteRencontres({
  rencontres,
  totalRencontres,
  saison,
}: {
  rencontres: RencontreTdb[]
  totalRencontres: number
  saison: number
}) {
  return (
    <Carte className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <TitreSection>Rencontres</TitreSection>
          <p className="text-xs text-texte-attenue">Saison {labelSaison(saison)}</p>
        </div>
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
