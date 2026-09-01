import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import {
  Coquille,
  EnTetePage,
  Etiquette,
  variantePhase,
  type LienNav,
} from '@/composants'
import { CATEGORIES, PHASES, type Categorie, type Phase } from '@/domaine/rencontre'
import { getContexteCoach } from '@/lib/auth/session'
import { listerRencontresCoach, type RencontreCoach } from '@/lib/coach/engagement'

export const metadata: Metadata = { title: 'Mes rencontres — Interclub' }

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/coach', label: 'Mes rencontres' },
]

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v
const labelCategorie = (v: Categorie) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

/** Date ISO (AAAA-MM-JJ) en français, sans dérive de fuseau. */
function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString(
    'fr-FR',
    { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' },
  )
}

/** Date du jour (locale) au format ISO, pour borner la saison (loader R6). */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Accueil coach (spec #5 R6–R8) : liste des rencontres de la saison où le club
 * peut être / est engagé, triées par priorité (préparation → compétition →
 * pré-compétition → clôture → résultats), avec phase et effectif. Ouvert au coach
 * permanent (toutes ses rencontres) et au coach temporaire (bornée à la sienne).
 */
export default async function PageCoach() {
  const contexte = await getContexteCoach()
  if (!contexte) notFound()

  const toutes = await listerRencontresCoach({
    clubId: contexte.clubId,
    aujourdhui: aujourdhuiISO(),
  })
  // Le coach temporaire est rattaché à UNE rencontre : on ne montre que celle-ci.
  const rencontres =
    contexte.type === 'temporaire'
      ? toutes.filter((r) => r.id === contexte.rencontreId)
      : toutes

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Mes rencontres"
          sousTitre={
            contexte.type === 'temporaire'
              ? 'Session du jour — préparez votre engagement.'
              : 'Rencontres où votre club peut être ou est engagé, les plus actionnables en premier.'
          }
        />

        {rencontres.length === 0 ? (
          <p className="text-sm text-texte-attenue">
            Aucune rencontre à afficher pour cette saison.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rencontres.map((r) => (
              <li key={r.id}>
                <CarteRencontre rencontre={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Coquille>
  )
}

/** Carte-lien d'une rencontre vers son écran d'engagement (R7). */
function CarteRencontre({ rencontre: r }: { rencontre: RencontreCoach }) {
  return (
    <Link
      href={`/coach/rencontres/${r.id}`}
      className="block rounded-2xl border border-bordure bg-black/20 p-4 transition hover:bg-surface-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-doux">
          {labelCategorie(r.categorie)}
        </span>
        <Etiquette variante={variantePhase[r.phase]}>{labelPhase(r.phase)}</Etiquette>
      </div>
      <p className="mt-1 text-base font-medium text-texte-fort">
        {formaterDate(r.dateRencontre)} — {r.clubPorteurNom}
      </p>
      <p className="mt-1 text-xs text-texte-doux">
        {r.nbEquipesClub} équipe(s) · {r.nbGrimpeursClub} grimpeur(s)
        {r.editable && <span className="text-secondaire"> · édition ouverte</span>}
      </p>
    </Link>
  )
}
