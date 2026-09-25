import type { Metadata } from 'next'
import Link from 'next/link'

import {
  Carte,
  Coquille,
  EnTetePage,
  TitreSection,
} from '@/composants'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import {
  GRIMPEURS_PAR_PAGE,
  listerClubsOptions,
  rechercherGrimpeurs,
} from '@/lib/grimpeurs/grimpeurs'

import { FormulaireGrimpeur } from './formulaire-grimpeur'
import { ListeGrimpeurs } from './liste-grimpeurs'

export const metadata: Metadata = {
  title: 'Grimpeurs — Interclub',
}

type Params = { recherche?: string; page?: string }

export default async function PageGrimpeurs({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  // Volet admin du roster (spec #1 R11/R13). On masque l'écran aux non-admins
  // (404 plutôt que 403). La RLS reste la vraie frontière (elle admet aussi le
  // coach du club, R18 — via un futur écran coach).
  await exigerAdmin()

  const sp = await searchParams
  const recherche = (sp.recherche ?? '').trim()
  const page = Math.max(1, Number(sp.page) || 1)

  const [{ grimpeurs, total }, clubs] = await Promise.all([
    rechercherGrimpeurs(recherche, page),
    listerClubsOptions(),
  ])

  const nbPages = Math.max(1, Math.ceil(total / GRIMPEURS_PAR_PAGE))
  const hrefPage = (p: number) => {
    const params = new URLSearchParams()
    if (recherche) params.set('recherche', recherche)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/admin/grimpeurs?${qs}` : '/admin/grimpeurs'
  }

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <EnTetePage
            titre="Grimpeurs"
            sousTitre="Gérez le roster des grimpeurs licenciés, par club."
          />
          <Link
            href="/admin/grimpeurs/import"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-admin/40 bg-admin/15 px-4 py-2 text-sm font-semibold text-admin hover:bg-admin/25"
          >
            📥 Importer des licenciés
          </Link>
        </div>

        {clubs.length === 0 ? (
          <Carte className="max-w-xl p-6">
            <p className="text-sm text-texte-attenue">
              Créez d’abord un club pour lui rattacher des grimpeurs.
            </p>
          </Carte>
        ) : (
          <Carte className="max-w-xl p-4">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                <TitreSection>Nouveau grimpeur</TitreSection>
                <span className="text-sm text-texte-attenue transition-transform group-open:rotate-45">
                  ＋
                </span>
              </summary>
              <div className="mt-2">
                <FormulaireGrimpeur clubs={clubs} />
              </div>
            </details>
          </Carte>
        )}

        <section className="flex flex-col gap-3">
          <TitreSection>Grimpeurs ({total})</TitreSection>

          {/* Recherche server-side : porte sur TOUT le roster (pas seulement la
              page affichée). Un envoi GET remet à la page 1 (R26). */}
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="recherche"
              defaultValue={recherche}
              placeholder="Rechercher un nom ou prénom…"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-xl border border-bordure bg-black/30 px-4 text-base text-texte-fort placeholder:text-texte-doux focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              className="inline-flex min-h-12 items-center rounded-xl border border-accent/40 bg-accent/15 px-4 text-sm font-semibold text-accent hover:bg-accent/25"
            >
              Rechercher
            </button>
            {recherche && (
              <Link
                href="/admin/grimpeurs"
                className="inline-flex min-h-12 items-center rounded-xl border border-bordure px-4 text-sm font-medium text-texte-attenue hover:bg-white/5"
              >
                Effacer
              </Link>
            )}
          </form>

          {recherche && (
            <p className="text-xs text-texte-doux">
              {total} résultat{total > 1 ? 's' : ''} pour « {recherche} »
            </p>
          )}

          <ListeGrimpeurs grimpeurs={grimpeurs} clubs={clubs} />

          {nbPages > 1 && (
            <nav className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <LienPage
                href={hrefPage(page - 1)}
                actif={page > 1}
                label="← Précédent"
              />
              <span className="text-xs text-texte-doux">
                Page {page} / {nbPages}
              </span>
              <LienPage
                href={hrefPage(page + 1)}
                actif={page < nbPages}
                label="Suivant →"
              />
            </nav>
          )}
        </section>
      </div>
    </Coquille>
  )
}

function LienPage({
  href,
  actif,
  label,
}: {
  href: string
  actif: boolean
  label: string
}) {
  if (!actif) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-xl border border-bordure px-4 text-sm text-texte-doux opacity-40">
        {label}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-xl border border-bordure px-4 text-sm font-medium text-texte hover:bg-white/5"
    >
      {label}
    </Link>
  )
}
