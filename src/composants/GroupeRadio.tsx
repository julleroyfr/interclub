import type { ReactNode } from 'react'

/** Une option d'un groupe de boutons radio. */
export type OptionRadio = { value: string; label: ReactNode; disabled?: boolean }

type Props = {
  /** Nom partagé par les radios du groupe (obligatoire pour le regroupement). */
  name: string
  legend: string
  options: OptionRadio[]
  /** Contrôlé : valeur sélectionnée (fournir aussi `onChange`). */
  value?: string
  /** Non contrôlé : valeur cochée au montage. */
  defaultValue?: string
  onChange?: (value: string) => void
  /** Couleur d'accent de la légende. */
  tonLabel?: 'accent' | 'secondaire' | 'neutre'
  orientation?: 'horizontale' | 'verticale'
  className?: string
}

const tons = {
  accent: 'text-accent',
  secondaire: 'text-secondaire',
  neutre: 'text-texte-attenue',
}

/**
 * Groupe de boutons radio labellisés (un seul choix), cohérent avec le DSM.
 * Utilisable contrôlé (`value` + `onChange`) ou non (`defaultValue`). Chaque
 * option est une cible tactile confortable (≥44px). Accent cyan sur la coche.
 */
export function GroupeRadio({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  tonLabel = 'neutre',
  orientation = 'horizontale',
  className = '',
}: Props) {
  const controle = value !== undefined

  return (
    <fieldset className={`flex flex-col gap-2 ${className}`}>
      <legend
        className={`text-xs font-medium uppercase tracking-wide ${tons[tonLabel]}`}
      >
        {legend}
      </legend>
      <div
        className={`flex gap-x-5 gap-y-1 ${
          orientation === 'verticale' ? 'flex-col' : 'flex-wrap'
        }`}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 items-center gap-2 text-sm text-texte has-[:disabled]:opacity-40"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              disabled={o.disabled}
              className="size-4 accent-accent"
              {...(controle
                ? { checked: value === o.value, onChange: () => onChange?.(o.value) }
                : { defaultChecked: defaultValue === o.value })}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
