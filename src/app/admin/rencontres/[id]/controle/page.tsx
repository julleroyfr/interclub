import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, TempsReel, variantePhase } from '@/composants'
import { CATEGORIES, PHASES, type Categorie, type Phase } from '@/domaine/rencontre'
import { getControleRencontre } from '@/lib/admin/controle'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'

import { PanneauControle } from './panneau-controle'

export const metadata: Metadata = { title: 'Contrôle des résultats — Interclub' }

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
 * Écran de contrôle des résultats contre les fiches papier des juges (spec #16).
 * Réservé à l'admin (404 sinon, R1) ; disponible en ④ (contrôle) et en ⑤
 * (lecture seule), 404 avant (R2). Temps réel sur les coches des autres admins
 * (R12bis, mécanique spec #11).
 */
export default async function PageControle({ params }: { params: Promise<{ id: string }> }) {
  await exigerAdmin()

  const { id } = await params
  const controle = await getControleRencontre(id)
  if (!controle) notFound()

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(controle.dateRencontre)} — Contrôle des résultats`}
            sousTitre={`Catégorie ${labelCategorie(controle.categorie)} · fiches de juges · voies et blocs, tous clubs`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[controle.phase]}>
              {labelPhase(controle.phase)}
            </Etiquette>
            <Link
              href={`/admin/rencontres/${id}`}
              className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
            >
              ← Tableau de bord
            </Link>
            {/* Live : coches posées par les autres admins (spec #16 R12bis). */}
            <TempsReel
              tables={['resultat_voie', 'resultat_bloc']}
              actif={controle.mode === 'controle'}
            />
          </div>
        </div>

        <PanneauControle controle={controle} />
      </div>
    </Coquille>
  )
}
