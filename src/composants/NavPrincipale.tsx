'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId, useState } from 'react'

export type LienNav = { href: string; label: string }

/**
 * Navigation principale avec surlignage de l'onglet actif.
 *
 * Mobile-first (conv. 08 : menu compact sur mobile, nav étendue au-delà) :
 * sous `md`, les liens sont repliés derrière un bouton « Menu » qui ouvre un
 * panneau déroulant sous l'en-tête (cibles ≥ 44 px) — la rangée de liens ne
 * provoque plus de défilement horizontal de la page. À partir de `md`, rangée
 * de liens en ligne.
 */
export function NavPrincipale({ liens }: { liens: LienNav[] }) {
  const chemin = usePathname()
  const idPanneau = useId()

  // Le panneau est ouvert « pour » un chemin donné : naviguer (changement de
  // chemin) le referme sans effet de bord ni setState dans un effect.
  const [ouvertSur, setOuvertSur] = useState<string | null>(null)
  const ouvert = ouvertSur === chemin

  // On ne surligne que le lien le PLUS spécifique (href le plus long) qui matche,
  // sinon un lien « racine » (ex. /admin) s'allumerait sur toutes ses sous-pages.
  const actifHref = liens
    .filter((l) => chemin === l.href || chemin.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav
      aria-label="Navigation principale"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOuvertSur(null)
      }}
    >
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        onClick={() => setOuvertSur(ouvert ? null : chemin)}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-bordure px-3 text-sm font-medium text-texte transition hover:bg-surface hover:text-texte-fort md:hidden"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {ouvert ? '✕' : '☰'}
        </span>
        Menu
      </button>

      <ul
        id={idPanneau}
        className={`${
          ouvert ? 'flex' : 'hidden'
        } absolute inset-x-0 top-full flex-col gap-1 border-b border-bordure bg-fond px-4 py-3 shadow-lg md:static md:flex md:flex-row md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
      >
        {liens.map((l) => {
          const actif = l.href === actifHref
          return (
            <li key={l.href}>
              {/* Pas de préchargement : les pages sont dynamiques (seule leur coquille
                  serait préchargée) et Next le relance après CHAQUE action serveur —
                  une rafale d'appels serveur à chaque saisie, coûteuse sur le
                  réseau d'une salle. */}
              <Link
                href={l.href}
                prefetch={false}
                aria-current={actif ? 'page' : undefined}
                onClick={() => setOuvertSur(null)}
                className={`flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition md:min-h-0 md:py-1.5 md:text-sm ${
                  actif
                    ? 'bg-surface-forte text-accent'
                    : 'text-texte-attenue hover:bg-surface hover:text-texte-fort'
                }`}
              >
                {l.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
