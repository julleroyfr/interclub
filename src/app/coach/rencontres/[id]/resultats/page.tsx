import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, TempsReel, variantePhase } from '@/composants'
import { CATEGORIES, PHASES, phaseEnDirect, type Categorie, type Phase } from '@/domaine/rencontre'
import { exigerContexteCoach } from '@/lib/auth/session'
import { liensCoach } from '@/lib/coach/navigation'
import { getSaisieRencontre } from '@/lib/coach/resultats'

import { PanneauResultats } from './panneau-resultats'

export const metadata: Metadata = { title: 'Saisie des résultats — Interclub' }

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v
const labelCategorie = (v: Categorie) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

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
 * Écran de saisie des résultats d'une rencontre (spec #6). Réservé au coach de son
 * club (permanent ou temporaire, R1/R2). La saisie n'est active qu'en ③ compétition
 * (R5) ; hors ③, l'écran reste consultable. La RLS est la frontière ultime.
 */
export default async function PageResultats({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const contexte = await exigerContexteCoach()

  const { id } = await params
  if (contexte.type === 'temporaire' && contexte.rencontreId !== id) notFound()

  const saisie = await getSaisieRencontre(id, contexte.clubId)
  if (!saisie) notFound()

  return (
    <Coquille liens={liensCoach(contexte)} deconnexion={contexte.type === 'permanent'} finSession={contexte.type === 'temporaire'}>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(saisie.dateRencontre)} — ${saisie.clubPorteurNom}`}
            sousTitre={`Saisie des résultats · catégorie ${labelCategorie(saisie.categorie)}`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[saisie.phase]}>{labelPhase(saisie.phase)}</Etiquette>
            {saisie.phase !== 'pre_competition' && saisie.phase !== 'preparation' && (
              <Link
                href={`/coach/rencontres/${id}/classement`}
                className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
              >
                Voir le classement →
              </Link>
            )}
            {/* Live : temps de vitesse (juge) + résultats saisis par l'admin (spec #11 R1/R3). */}
            <TempsReel
              tables={['resultat_voie', 'resultat_bloc', 'temps_vitesse', 'points_vitesse']}
              actif={phaseEnDirect(saisie.phase)}
            />
          </div>
        </div>

        <PanneauResultats saisie={saisie} />
      </div>
    </Coquille>
  )
}
