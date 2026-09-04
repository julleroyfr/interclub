'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Bouton, Carte, Etiquette, TitreSection, variantePhase } from '@/composants'
import {
  PHASES,
  peutEntrerEnPhase,
  phasePrecedenteEffective,
  phaseSuivante,
  type Phase,
} from '@/domaine/rencontre'
import { changerPhaseRencontre } from '@/lib/rencontres/actions'
import type { EtatRencontre } from '@/lib/rencontres/rencontres'

const etatInitial: EtatRencontre = undefined
const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Pilotage d'une rencontre depuis le tableau de bord (spec #3 R41a/R41b) :
 * changement de phase pas à pas — même action et même garde jour J (R5) que la
 * liste `/admin/rencontres` — et lien vers les jetons QR de la rencontre.
 * La phase reçue en prop se met à jour après revalidation de l'écran.
 */
export function PanneauPilotage({
  rencontreId,
  phase,
  dateRencontre,
}: {
  rencontreId: string
  phase: Phase
  dateRencontre: string
}) {
  const [etat, action, enCours] = useActionState(changerPhaseRencontre, etatInitial)

  const aujourdhui = aujourdhuiISO()
  // Garde-fou jour J (R5) reflété dans l'IHM ; l'action reste la garde autoritaire.
  const precedente = phasePrecedenteEffective(phase, dateRencontre, aujourdhui)
  const suivante = phaseSuivante(phase)
  const suivanteBloquee =
    suivante !== null && !peutEntrerEnPhase(suivante, dateRencontre, aujourdhui)
  const precedenteBloquee =
    precedente !== null && !peutEntrerEnPhase(precedente, dateRencontre, aujourdhui)
  const iCourant = PHASES.findIndex((p) => p.value === phase)

  return (
    <div className="flex flex-col gap-4">
      <Carte className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <TitreSection>Phase</TitreSection>
          <Etiquette variante={variantePhase[phase]}>{labelPhase(phase)}</Etiquette>
        </div>

        <div className="flex items-center gap-2">
          <form action={action}>
            <input type="hidden" name="id" value={rencontreId} />
            <input type="hidden" name="phase" value={precedente ?? ''} />
            <Bouton
              type="submit"
              variante="secondaire"
              taille="sm"
              disabled={!precedente || enCours || precedenteBloquee}
              aria-label="Revenir à la phase précédente"
            >
              ← {precedente ? labelPhase(precedente) : 'Début'}
            </Bouton>
          </form>
          <span className="flex-1" />
          <form action={action}>
            <input type="hidden" name="id" value={rencontreId} />
            <input type="hidden" name="phase" value={suivante ?? ''} />
            <Bouton
              type="submit"
              taille="sm"
              disabled={!suivante || enCours || suivanteBloquee}
              title={
                suivanteBloquee
                  ? 'Activable seulement le jour de la rencontre (R5).'
                  : undefined
              }
              aria-label="Avancer à la phase suivante"
            >
              {suivante ? labelPhase(suivante) : 'Fin'} →
            </Bouton>
          </form>
        </div>

        <ol className="flex flex-wrap items-center gap-1">
          {PHASES.map((p, i) => (
            <li key={p.value} className="flex items-center gap-1">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  i < iCourant
                    ? 'border-secondaire/30 text-secondaire'
                    : i === iCourant
                      ? 'border-accent/40 bg-accent/10 font-bold text-accent-doux'
                      : 'border-bordure text-texte-doux'
                }`}
              >
                {p.label}
              </span>
              {i < PHASES.length - 1 && (
                <span aria-hidden className="text-[10px] text-texte-doux">
                  ›
                </span>
              )}
            </li>
          ))}
        </ol>

        {suivante && suivanteBloquee && (
          <p className="text-xs text-texte-doux">
            {labelPhase(suivante)} ne s’active que le jour de la rencontre (R5).
          </p>
        )}
        {etat?.erreur && (
          <p role="alert" className="text-xs text-danger">
            {etat.erreur}
          </p>
        )}
      </Carte>

      <Link
        href={`/admin/jetons?rencontre=${rencontreId}`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-bordure bg-black/20 p-4 transition hover:bg-surface-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden className="text-xl">
            ▦
          </span>
          <span>
            <span className="block text-sm font-semibold text-texte-fort">Jetons QR</span>
            <span className="block text-xs text-texte-doux">Coach temporaire &amp; juges</span>
          </span>
        </span>
        <span aria-hidden className="text-accent">
          →
        </span>
      </Link>
    </div>
  )
}
