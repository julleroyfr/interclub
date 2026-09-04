import type { ReactNode } from 'react'

import { NavPrincipale, type LienNav } from './NavPrincipale'

type Props = {
  liens: LienNav[]
  children: ReactNode
  /**
   * Largeur du contenu. `normale` (défaut) = colonne de lecture (max-w-5xl) pour
   * l'espace public et coach ; `large` = presque pleine largeur (max-w-[1680px])
   * pour les tableaux de bord admin qui exploitent l'écran (rail + colonnes).
   */
  largeur?: 'normale' | 'large'
}

const LARGEURS: Record<NonNullable<Props['largeur']>, string> = {
  normale: 'max-w-5xl',
  large: 'max-w-[1680px]',
}

/**
 * Coquille applicative du thème Nuit : fond profond, voiles d'aurore,
 * en-tête collant avec logo + navigation. Server Component ; la nav
 * (surlignage actif) est isolée dans un Client Component.
 */
export function Coquille({ liens, children, largeur = 'normale' }: Props) {
  const largeurCls = LARGEURS[largeur]
  return (
    <div className="min-h-screen bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] text-texte">
      <header className="sticky top-0 z-10 border-b border-bordure bg-fond/70 backdrop-blur">
        <div className={`mx-auto flex ${largeurCls} items-center justify-between px-4 py-3`}>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-accent/20 font-bold text-accent-doux ring-1 ring-accent/40">
              I
            </span>
            <span className="font-semibold text-texte-fort">Interclub</span>
          </div>
          <NavPrincipale liens={liens} />
        </div>
      </header>

      <main className={`mx-auto ${largeurCls} px-4 py-6`}>{children}</main>
    </div>
  )
}
