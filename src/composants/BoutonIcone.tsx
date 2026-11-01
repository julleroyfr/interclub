import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type IconeBouton = 'valider' | 'supprimer' | 'modifier'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  icone: IconeBouton
  /** Texte de l'infobulle au survol, repris comme nom accessible du bouton. */
  libelle: string
}

const base =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fond ' +
  'disabled:pointer-events-none disabled:opacity-40'

// Coche verte (valider), croix rouge (supprimer), crayon (modifier).
const couleurs: Record<IconeBouton, string> = {
  valider: 'border-secondaire/40 bg-secondaire/10 text-secondaire hover:bg-secondaire/20',
  supprimer: 'border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
  modifier: 'border-bordure bg-surface text-accent-doux hover:bg-surface-forte',
}

const traces: Record<IconeBouton, ReactNode> = {
  valider: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  supprimer: <path d="M6 6l12 12M18 6L6 18" />,
  modifier: (
    <>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
}

/**
 * Bouton carré à icône seule (cible tactile 44 px) : le `libelle` s'affiche en
 * infobulle au survol et sert de nom accessible. `type="button"` par défaut.
 */
export function BoutonIcone({ icone, libelle, type = 'button', className = '', ...props }: Props) {
  return (
    <button
      type={type}
      title={libelle}
      aria-label={props['aria-label'] ?? libelle}
      className={`${base} ${couleurs[icone]} ${className}`}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {traces[icone]}
      </svg>
    </button>
  )
}
