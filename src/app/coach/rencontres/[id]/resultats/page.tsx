import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, variantePhase, type LienNav } from '@/composants'
import { CATEGORIES, PHASES, type Categorie, type Phase } from '@/domaine/rencontre'
import { getContexteCoach } from '@/lib/auth/session'
import { getSaisieRencontre } from '@/lib/coach/resultats'

import { PanneauResultats } from './panneau-resultats'

export const metadata: Metadata = { title: 'Saisie des résultats — Interclub' }

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
  const contexte = await getContexteCoach()
  if (!contexte) notFound()

  const { id } = await params
  if (contexte.type === 'temporaire' && contexte.rencontreId !== id) notFound()

  const saisie = await getSaisieRencontre(id, contexte.clubId)
  if (!saisie) notFound()

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(saisie.dateRencontre)} — ${saisie.clubPorteurNom}`}
            sousTitre={`Saisie des résultats · catégorie ${labelCategorie(saisie.categorie)}`}
          />
          <div className="mt-2">
            <Etiquette variante={variantePhase[saisie.phase]}>{labelPhase(saisie.phase)}</Etiquette>
          </div>
        </div>

        <PanneauResultats saisie={saisie} />
      </div>
    </Coquille>
  )
}
