import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, TempsReel, variantePhase } from '@/composants'
import { PHASES, phaseEnDirect, type Phase } from '@/domaine/rencontre'
import { exigerContexteCapitaine } from '@/lib/auth/session'
import { liensCapitaine } from '@/lib/capitaine/navigation'
import { getSaisieEquipe } from '@/lib/coach/resultats'

import { PanneauResultats } from '../coach/rencontres/[id]/resultats/panneau-resultats'

export const metadata: Metadata = { title: 'Saisie de mon équipe — Interclub' }

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

/** Heure du serveur au rendu : écart d'horloge de l'appareil (spec #17 R6). */
function heureServeur(): number {
  return Date.now()
}

function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Espace capitaine (spec #20 R17–R19) : saisie des voies et blocs des membres de
 * SON équipe adulte, en ③ compétition. Réutilise l'écran de saisie du coach
 * (vues, file d'attente hors ligne, score) ; la vitesse reste en lecture seule
 * (juges). Hors ③ ou jeton révoqué, la garde renvoie un 404. La base est la
 * frontière (RLS et fonctions d'enregistrement).
 */
export default async function PageCapitaine() {
  const contexte = await exigerContexteCapitaine()

  const saisie = await getSaisieEquipe(contexte.rencontreId, contexte.equipeId)
  if (!saisie) notFound()
  const nomEquipe = saisie.grimpeurs[0]?.equipeNom ?? 'Mon équipe'

  return (
    <Coquille liens={liensCapitaine()} finSession>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(saisie.dateRencontre)} — ${saisie.clubPorteurNom}`}
            sousTitre={`Adulte · capitaine de « ${nomEquipe} »`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[saisie.phase]}>{labelPhase(saisie.phase)}</Etiquette>
            <Link
              href="/capitaine/classement"
              prefetch={false}
              className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
            >
              Voir le classement →
            </Link>
            <TempsReel
              tables={['resultat_voie', 'resultat_bloc', 'temps_vitesse', 'points_vitesse']}
              actif={phaseEnDirect(saisie.phase)}
              ignorerMesEcritures
              grimpeursAffiches={saisie.grimpeurs.map((g) => g.grimpeurId)}
            />
          </div>
          <p className="mt-3 rounded-2xl border border-accent/25 bg-accent/5 p-3 text-xs text-accent-doux">
            {/* Sans les épreuves désactivées (spec #20 R38). */}
            Vous saisissez {saisie.blocActif ? 'les voies et les blocs' : 'les voies'} des
            membres de votre équipe.
            {saisie.vitesseActive && ' La vitesse est saisie par les juges (lecture seule).'}
          </p>
        </div>

        <PanneauResultats
          saisie={saisie}
          clubId=""
          equipeCapitaineId={contexte.equipeId}
          sessionQr
          heureServeur={heureServeur()}
        />
      </div>
    </Coquille>
  )
}
