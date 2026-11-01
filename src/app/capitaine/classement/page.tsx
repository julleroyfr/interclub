import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, TempsReel, variantePhase } from '@/composants'
import { PHASES, phaseEnDirect, type Phase } from '@/domaine/rencontre'
import { exigerContexteCapitaine } from '@/lib/auth/session'
import { liensCapitaine } from '@/lib/capitaine/navigation'
import { getClassementRencontre } from '@/lib/classement/classement'

import { PanneauClassement } from '../../coach/rencontres/[id]/classement/panneau-classement'

export const metadata: Metadata = { title: 'Classement — Interclub' }

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

/**
 * Classement de la rencontre du capitaine (spec #20 R19), en lecture, au fil de
 * l'eau (non officiel avant la ⑤). Réutilise le panneau de classement du coach.
 */
export default async function PageClassementCapitaine() {
  const contexte = await exigerContexteCapitaine()

  const classement = await getClassementRencontre(contexte.rencontreId)
  if (!classement) notFound()

  return (
    <Coquille liens={liensCapitaine()} finSession>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage titre="Classement" sousTitre="Rencontre adulte" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[classement.phase]}>
              {labelPhase(classement.phase)}
            </Etiquette>
            <span className="inline-flex items-center gap-1 rounded-full border border-bordure bg-white/5 px-2.5 py-0.5 text-xs font-bold text-texte-attenue">
              {classement.officiel ? '✓ Officiel' : '● Non officiel'}
            </span>
            <TempsReel
              tables={['resultat_voie', 'resultat_bloc', 'points_vitesse']}
              actif={phaseEnDirect(classement.phase)}
            />
          </div>
        </div>
        <PanneauClassement classement={classement} monClubId={null} />
      </div>
    </Coquille>
  )
}
