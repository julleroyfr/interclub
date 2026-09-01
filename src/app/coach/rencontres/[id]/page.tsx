import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, variantePhase, type LienNav } from '@/composants'
import { CATEGORIES, PHASES, type Categorie, type Phase } from '@/domaine/rencontre'
import { getContexteCoach } from '@/lib/auth/session'
import { getEngagementRencontre } from '@/lib/coach/engagement'

import { PanneauEngagement } from './panneau-engagement'

export const metadata: Metadata = { title: 'Engagement — Interclub' }

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/coach', label: 'Mes rencontres' },
]

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
 * préparation seule. Hors fenêtre → lecture seule (R17). La RLS reste la frontière.
 */
export default async function PageEngagement({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const contexte = await getContexteCoach()
  if (!contexte) notFound()

  const { id } = await params
  // Le coach temporaire est borné à SA rencontre (spec #1 R27).
  if (contexte.type === 'temporaire' && contexte.rencontreId !== id) notFound()

  const engagement = await getEngagementRencontre(id, contexte.clubId)
  if (!engagement) notFound()

  // Édition : phases ①/② pour le permanent, ② préparation seule pour le temporaire (R16).
  const peutEditer =
    engagement.editable &&
    (contexte.type === 'permanent' || engagement.phase === 'preparation')

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(engagement.dateRencontre)} — ${engagement.clubPorteurNom}`}
            sousTitre={`Catégorie ${labelCategorie(engagement.categorie)}`}
          />
          <div className="mt-2">
            <Etiquette variante={variantePhase[engagement.phase]}>
              {labelPhase(engagement.phase)}
              {peutEditer ? ' — édition ouverte' : ' — lecture seule'}
            </Etiquette>
          </div>
        </div>

        <PanneauEngagement
          engagement={engagement}
          peutEditer={peutEditer}
          estEnfant={engagement.categorie === 'enfant'}
        />
      </div>
    </Coquille>
  )
}
