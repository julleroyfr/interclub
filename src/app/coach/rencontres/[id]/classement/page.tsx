import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, TempsReel, variantePhase } from '@/composants'
import { CATEGORIES, PHASES, phaseEnDirect, type Categorie, type Phase } from '@/domaine/rencontre'
import { getContexteCoach } from '@/lib/auth/session'
import { getClassementRencontre } from '@/lib/classement/classement'
import { liensCoach } from '@/lib/coach/navigation'

import { PanneauClassement } from './panneau-classement'

export const metadata: Metadata = { title: 'Classement — Interclub' }

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
 * Écran de classement d'une rencontre (spec #7). Consultable dès la ③ par tout
 * compte authentifié, tous clubs (R11) : ici l'espace coach (le coach temporaire
 * reste borné à sa rencontre). Trois vues — individuel (par sexe), équipe, club
 * (R12) — recalculées au fil de l'eau, non officielles jusqu'à la ⑤ (R10). Le
 * calcul est fait par le domaine pur ; ce loader assemble tous les clbs.
 */
export default async function PageClassement({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const contexte = await getContexteCoach()
  if (!contexte) notFound()

  const { id } = await params
  if (contexte.type === 'temporaire' && contexte.rencontreId !== id) notFound()

  const classement = await getClassementRencontre(id)
  if (!classement) notFound()

  return (
    <Coquille liens={liensCoach(contexte)}>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(classement.dateRencontre)} — Classement`}
            sousTitre={`Catégorie ${labelCategorie(classement.categorie)}`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[classement.phase]}>
              {labelPhase(classement.phase)}
            </Etiquette>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                classement.officiel
                  ? 'border-secondaire/30 bg-secondaire/10 text-secondaire'
                  : 'border-bordure bg-white/5 text-texte-attenue'
              }`}
            >
              {classement.officiel ? '✓ Officiel' : '● Non officiel'}
            </span>
            {/* Live : le classement bouge quand un coach/juge saisit (spec #11 R1/R3). */}
            <TempsReel
              tables={['resultat_voie', 'resultat_bloc', 'points_vitesse']}
              actif={phaseEnDirect(classement.phase)}
            />
          </div>
        </div>

        <PanneauClassement classement={classement} monClubId={contexte.clubId} />
      </div>
    </Coquille>
  )
}
