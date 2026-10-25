import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, TempsReel, variantePhase } from '@/composants'
import { compositionModifiableParCoach } from '@/domaine/engagement'
import { CATEGORIES, PHASES, type Categorie, type Phase } from '@/domaine/rencontre'
import { exigerContexteCoach } from '@/lib/auth/session'
import { getEngagementRencontre } from '@/lib/coach/engagement'
import { lienSuiteRencontreCoach, liensCoach } from '@/lib/coach/navigation'

import { PanneauEngagement } from './panneau-engagement'

export const metadata: Metadata = { title: 'Engagement — Interclub' }

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v
const labelCategorie = (v: Categorie) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString(
    'fr-FR',
    { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' },
  )
}

/**
 * Écran d'engagement d'une rencontre (spec #5 R9–R21) : en-tête récap, équipes
 * du club avec composition et effectif n/8, formulaires d'édition. Ouvert au
 * coach de son club (permanent ou temporaire) ; l'édition suit le bornage de
 * phase (R16) : permanent en pré-compétition/préparation, temporaire en
 * préparation seule. Hors fenêtre → composition figée (R17). La RLS reste la frontière.
 */
export default async function PageEngagement({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const contexte = await exigerContexteCoach()

  const { id } = await params
  // Le coach temporaire est borné à SA rencontre (spec #1 R27).
  if (contexte.type === 'temporaire' && contexte.rencontreId !== id) notFound()

  const engagement = await getEngagementRencontre(id, contexte.clubId)
  if (!engagement) notFound()

  // Rencontre adulte : équipes créées et composées par l'admin seul (spec #20 R10).
  const estAdulte = engagement.categorie === 'adulte'
  // Édition : phases ①/② pour le permanent, ② préparation seule pour le temporaire (R16).
  const peutEditer = !estAdulte && compositionModifiableParCoach(engagement.phase, contexte.type)
  // Résultats (enfant/ado) ou classement (adulte, spec #20 R19bis), dès la ③.
  const lienSuite = lienSuiteRencontreCoach(id, engagement.categorie, engagement.phase)

  return (
    <Coquille liens={liensCoach(contexte)} deconnexion={contexte.type === 'permanent'} finSession={contexte.type === 'temporaire'}>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(engagement.dateRencontre)} — ${engagement.clubPorteurNom}`}
            sousTitre={`Catégorie ${labelCategorie(engagement.categorie)}`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[engagement.phase]}>
              {labelPhase(engagement.phase)}
            </Etiquette>
            {lienSuite && (
              <Link
                href={lienSuite.href}
                className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
              >
                {lienSuite.label}
              </Link>
            )}
            {/* Live : prêts, équipes et compositions tant que la composition est
                modifiable (spec #11 R1/R3/R7, rév. 2026-10-09). */}
            <TempsReel
              tables={['pret', 'equipe', 'composition']}
              actif={peutEditer}
              infobulle="Les équipes et les grimpeurs prêtés se mettent à jour automatiquement"
            />
          </div>
        </div>

        {estAdulte ? (
          <p className="rounded-2xl border border-bordure bg-surface p-4 text-sm text-texte-attenue">
            Rencontre adulte : les équipes, qui mélangent les clubs, sont créées et composées par
            l’administrateur. Le classement est consultable dès la compétition.
          </p>
        ) : (
          <PanneauEngagement
            engagement={engagement}
            peutEditer={peutEditer}
            estEnfant={engagement.categorie === 'enfant'}
          />
        )}
      </div>
    </Coquille>
  )
}
