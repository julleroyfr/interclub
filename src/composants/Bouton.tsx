import type { ButtonHTMLAttributes } from 'react'

export type VarianteBouton = 'primaire' | 'secondaire' | 'fantome' | 'danger'
export type TailleBouton = 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBouton
  taille?: TailleBouton
  pleineLargeur?: boolean
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fond ' +
  'disabled:pointer-events-none disabled:opacity-40'

const variantes: Record<VarianteBouton, string> = {
  primaire: 'bg-accent text-slate-950 hover:brightness-110',
  secondaire: 'border border-bordure bg-surface text-texte hover:bg-surface-forte',
  fantome: 'text-texte-attenue hover:bg-surface hover:text-texte',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
}

// md = 44px de haut : cible tactile minimale. sm réservé aux contextes denses.
const tailles: Record<TailleBouton, string> = {
  md: 'min-h-11 px-4 text-sm',
  sm: 'min-h-9 px-3 text-sm',
}

/** Bouton homogène du design system. `type="button"` par défaut. */
export function Bouton({
  variante = 'primaire',
  taille = 'md',
  pleineLargeur = false,
  className = '',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`${base} ${variantes[variante]} ${tailles[taille]} ${
        pleineLargeur ? 'w-full' : ''
      } ${className}`}
      {...props}
    />
  )
}
