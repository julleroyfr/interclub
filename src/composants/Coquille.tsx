import type { ReactNode } from 'react'

import { seDeconnecter } from '@/lib/auth/actions'

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
  /**
   * Affiche l'action « Se déconnecter » dans l'en-tête (spec #12 R20). Réservée
   * aux **comptes permanents** (admin, coach permanent) : les sessions QR (coach
   * temporaire, juge) relèvent de la fin de session, pas de la déconnexion (R22).
   */
  deconnexion?: boolean
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
export function Coquille({ liens, children, largeur = 'normale', deconnexion = false }: Props) {
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
          <div className="flex items-center gap-2">
            <NavPrincipale liens={liens} />
            {deconnexion && (
              <form action={seDeconnecter}>
                <button
                  type="submit"
                  className="rounded-lg border border-bordure px-3 py-1.5 text-sm font-medium text-texte-attenue transition hover:bg-surface hover:text-texte-fort"
                >
                  Se déconnecter
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main className={`mx-auto ${largeurCls} px-4 py-6`}>{children}</main>
    </div>
  )
}
