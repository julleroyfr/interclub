import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, Etiquette, type LienNav, TempsReel, variantePhase } from '@/composants'
import { CATEGORIES, PHASES, phaseEnDirect, type Categorie, type Phase } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { getClassementRencontre } from '@/lib/classement/classement'

import { PanneauClassement } from '@/app/coach/rencontres/[id]/classement/panneau-classement'

export const metadata: Metadata = { title: 'Classement (admin) — Interclub' }

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
 * Vue classement côté admin (spec #12 R14/R15). Réservée au rôle admin (404
 * sinon, comme les autres écrans admin) : elle remplace le lien qui renvoyait
 * l'admin dans l'espace coach (bug B1 → 404). Périmètre tous clubs, sans « mon
 * club » (`monClubId=null`). Réutilise le loader et le panneau de la spec #7
 * (aucune donnée nouvelle). La RLS reste la frontière ultime.
 */
export default async function PageClassementAdmin({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const { id } = await params
  const classement = await getClassementRencontre(id)
  if (!classement) notFound()

  return (
    <Coquille liens={liens} largeur="large">
      <div className="flex flex-col gap-6">
        <div>
          <EnTetePage
            titre={`${formaterDate(classement.dateRencontre)} — Classement`}
            sousTitre={`Catégorie ${labelCategorie(classement.categorie)} · administrateur · tous clubs`}
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
            <Link
              href={`/admin/rencontres/${id}`}
              className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
            >
              ← Tableau de bord
            </Link>
            {/* Live : le classement bouge quand un coach/juge saisit (spec #11 R1/R3). */}
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
