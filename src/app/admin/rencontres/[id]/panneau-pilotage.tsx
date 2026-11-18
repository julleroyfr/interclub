'use client'

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
 * Pilotage d'une rencontre en en-tête du tableau de bord (spec #3 R41a, R41k) :
 * changement de phase pas à pas — même action et même garde jour J (R5) que la
 * liste `/admin/rencontres`. Le lien vers les jetons QR (R41b) est dans
 * l'onglet Vue d'ensemble.
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
    <Carte className="flex flex-col gap-4 p-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
        <div className="flex items-center justify-between gap-2 lg:justify-start">
          <TitreSection>Phase</TitreSection>
          <Etiquette variante={variantePhase[phase]}>{labelPhase(phase)}</Etiquette>
        </div>

        <div className="flex items-center gap-2 lg:order-1 lg:ml-auto">
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
                  ? 'Activable seulement le jour de la rencontre.'
                  : undefined
              }
              aria-label="Avancer à la phase suivante"
            >
              {suivante ? labelPhase(suivante) : 'Fin'} →
            </Bouton>
          </form>
        </div>

        <ol className="flex flex-wrap items-center gap-1 lg:flex-1">
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
          <p className="text-xs text-texte-doux lg:order-2 lg:basis-full">
            {labelPhase(suivante)} ne s’active que le jour de la rencontre.
          </p>
        )}
        {etat?.erreur && (
          <p role="alert" className="text-xs text-danger lg:order-2 lg:basis-full">
            {etat.erreur}
          </p>
        )}
      </Carte>
  )
}
