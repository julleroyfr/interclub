import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, type LienNav, TempsReel, variantePhase } from '@/composants'
import { CATEGORIES, PHASES, phaseEnDirect, type Categorie, type Phase } from '@/domaine/rencontre'
import { exigerAdmin } from '@/lib/auth/session'
import { getSaisieAdminRencontre } from '@/lib/admin/resultats'

import { PanneauSaisieAdmin } from './panneau-saisie-admin'

export const metadata: Metadata = { title: 'Saisie admin des résultats — Interclub' }

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/rencontres', label: 'Rencontres' },
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
 * Écran admin de saisie/correction des résultats (spec #9). Réservé au rôle admin
 * (404 sinon, R1). Transverse : tous les clubs engagés (R2). L'écriture n'est
 * possible qu'en ③ compétition ou ④ clôture (R5) — reflété par l'IHM ; la Server
 * Action revérifie rôle + phase, la RLS reste la frontière.
 */
export default async function PageSaisieAdmin({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigerAdmin()

  const { id } = await params
  const saisie = await getSaisieAdminRencontre(id)
  if (!saisie) notFound()

  const enCorrection = saisie.phase === 'cloture'

  return (
    <Coquille liens={liens} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(saisie.dateRencontre)} — ${enCorrection ? 'Correction' : 'Saisie'} des résultats`}
            sousTitre={`Catégorie ${labelCategorie(saisie.categorie)} · administrateur · tous clubs`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Etiquette variante={variantePhase[saisie.phase]}>
              {labelPhase(saisie.phase)}
            </Etiquette>
            <Link
              href={`/admin/rencontres/${id}`}
              className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
            >
              ← Tableau de bord
            </Link>
            <Link
              href={`/admin/rencontres/${id}/classement`}
              className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
            >
              Voir le classement →
            </Link>
            {/* Live : coachs saisissant en parallèle + temps de vitesse (spec #11 R1/R3). */}
            <TempsReel
              tables={['resultat_voie', 'resultat_bloc', 'temps_vitesse', 'points_vitesse']}
              actif={phaseEnDirect(saisie.phase)}
            />
          </div>
        </div>

        <PanneauSaisieAdmin saisie={saisie} />
      </div>
    </Coquille>
  )
}
