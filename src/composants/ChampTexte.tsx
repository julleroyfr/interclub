import type { InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  /** Requis pour associer le <label> (accessibilité). */
  id: string
  label: string
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
 * Champ de saisie labellisé. `text-base` (16px) pour éviter le zoom iOS,
 * hauteur 48px pour le tactile, focus visible et messages d'erreur reliés.
 */
export function ChampTexte({
  id,
  label,
  indice,
  erreur,
  tonLabel = 'neutre',
  className = '',
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
      <input
        id={id}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={[indiceId, erreurId].filter(Boolean).join(' ') || undefined}
        className={`mt-1 h-12 w-full rounded-xl border bg-black/30 px-4 text-base text-texte-fort placeholder:text-texte-doux focus:outline-none focus:ring-2 ${
          erreur
            ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
            : 'border-bordure focus:border-accent/60 focus:ring-accent/20'
        }`}
        {...props}
      />
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
