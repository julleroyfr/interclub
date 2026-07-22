import type { SelectHTMLAttributes } from 'react'

/** Une option sélectionnable. */
export type OptionSelect = { value: string; label: string }

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  /** Requis pour associer le <label> (accessibilité). */
  id: string
  label: string
  options: OptionSelect[]
  /** Texte de l'option vide initiale (désactivée). Absent = pas de placeholder. */
  placeholder?: string
  indice?: string
  erreur?: string
  /** Couleur d'accent du label (voie/bloc, etc.). */
  tonLabel?: 'accent' | 'secondaire' | 'neutre'
}

const tons = {
  accent: 'text-accent',
  secondaire: 'text-secondaire',
  neutre: 'text-texte-attenue',
}

/**
 * Liste déroulante labellisée, cohérente avec `ChampTexte`. `text-base` (16px)
 * anti-zoom iOS, hauteur 48px pour le tactile, focus visible, erreurs reliées.
 *
 * `color-scheme: dark` fait dessiner le menu natif en sombre ; les `<option>`
 * reçoivent en plus un fond/texte explicites (secours navigateurs).
 */
export function ChampSelect({
  id,
  label,
  options,
  placeholder,
  indice,
  erreur,
  tonLabel = 'neutre',
  className = '',
  defaultValue,
  ...props
}: Props) {
  const indiceId = indice ? `${id}-indice` : undefined
  const erreurId = erreur ? `${id}-erreur` : undefined

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={`text-xs font-medium uppercase tracking-wide ${tons[tonLabel]}`}
      >
        {label}
      </label>
      <select
        id={id}
        // Sans valeur initiale explicite, on retombe sur le placeholder (option vide).
        defaultValue={defaultValue ?? (placeholder !== undefined ? '' : undefined)}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={[indiceId, erreurId].filter(Boolean).join(' ') || undefined}
        className={`mt-1 h-12 w-full rounded-xl border bg-black/30 px-4 text-base text-texte-fort [color-scheme:dark] focus:outline-none focus:ring-2 ${
          erreur
            ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
            : 'border-bordure focus:border-accent/60 focus:ring-accent/20'
        }`}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled className="bg-fond text-texte">
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-fond text-texte">
            {o.label}
          </option>
        ))}
      </select>
      {indice && !erreur && (
        <p id={indiceId} className="mt-1 text-xs text-texte-doux">
          {indice}
        </p>
      )}
      {erreur && (
        <p id={erreurId} className="mt-1 text-xs text-danger">
          {erreur}
        </p>
      )}
    </div>
  )
}
