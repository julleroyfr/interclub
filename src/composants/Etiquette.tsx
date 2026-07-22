import type { HTMLAttributes } from 'react'

export type VarianteEtiquette = 'accent' | 'succes' | 'neutre' | 'danger'

type Props = HTMLAttributes<HTMLSpanElement> & {
  variante?: VarianteEtiquette
}

const variantes: Record<VarianteEtiquette, string> = {
  accent: 'bg-accent/10 text-accent-doux ring-accent/40',
  succes: 'bg-secondaire/10 text-secondaire ring-secondaire/40',
  neutre: 'bg-surface text-texte-attenue ring-bordure',
  danger: 'bg-danger/10 text-danger ring-danger/40',
}

/** Étiquette de statut (badge). */
export function Etiquette({
  variante = 'neutre',
  className = '',
  ...props
}: Props) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${variantes[variante]} ${className}`}
      {...props}
    />
  )
}
