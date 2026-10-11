import type { InputHTMLAttributes, ReactNode } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Requis pour associer le libellé et l'indice (accessibilité). */
  id: string
  label: ReactNode
  indice?: string
}

/**
 * Case à cocher labellisée, cohérente avec le DSM. La ligne entière est une
 * cible tactile confortable (≥44px) et cliquable ; accent cyan sur la coche.
 * Utilisable contrôlée (`checked` + `onChange`) ou non (`defaultChecked`).
 */
export function ChampCase({
  id,
  label,
  indice,
  className = '',
  ...props
}: Props) {
  const indiceId = indice ? `${id}-indice` : undefined

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex min-h-11 items-center gap-3 text-sm text-texte has-[:disabled]:opacity-40"
      >
        <input
          id={id}
          type="checkbox"
          aria-describedby={indiceId}
          className="size-4 shrink-0 accent-accent"
          {...props}
        />
        {label}
      </label>
      {indice && (
        <p id={indiceId} className="ml-7 text-xs text-texte-doux">
          {indice}
        </p>
      )}
    </div>
  )
}
