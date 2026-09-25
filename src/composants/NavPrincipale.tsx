'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type LienNav = { href: string; label: string }

/** Navigation principale avec surlignage de l'onglet actif. */
export function NavPrincipale({ liens }: { liens: LienNav[] }) {
  const chemin = usePathname()

  // On ne surligne que le lien le PLUS spécifique (href le plus long) qui matche,
  // sinon un lien « racine » (ex. /admin) s'allumerait sur toutes ses sous-pages.
  const actifHref = liens
    .filter((l) => chemin === l.href || chemin.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="flex gap-1" aria-label="Navigation principale">
      {liens.map((l) => {
        const actif = l.href === actifHref
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              actif
                ? 'bg-surface-forte text-accent'
                : 'text-texte-attenue hover:bg-surface hover:text-texte-fort'
            }`}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
