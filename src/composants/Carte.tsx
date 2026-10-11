import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Réhausse la surface au survol (listes cliquables). */
  interactive?: boolean
}

const base =
  'rounded-2xl border border-bordure bg-surface backdrop-blur-xl'

/** Carte en verre — conteneur de base du design system Nuit. */
export function Carte({
  interactive = false,
  className = '',
  ...props
}: Props) {
  return (
    <div
      className={`${base} ${
        interactive ? 'transition hover:bg-surface-forte' : ''
      } ${className}`}
      {...props}
    />
  )
}
