import { useId } from 'react'

/**
 * Logo de l'application : deux anneaux entrelacés (cyan / lime), deux clubs qui
 * se rencontrent, sur une tuile « Nuit ». Même dessin que `src/app/icon.svg`
 * (favicon) — garder les deux synchronisés. Décoratif par défaut (le nom
 * « Interclub » est écrit à côté) ; passer `libelle` s'il est affiché seul.
 * Identifiants de dégradé / masques uniques si le logo apparaît plusieurs
 * fois dans la page.
 */
export function LogoInterclub({
  className = 'size-8',
  libelle,
}: {
  className?: string
  libelle?: string
}) {
  // `useId` peut contenir `:` ou `«»`, invalides dans `url(#…)`.
  const id = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const fond = `${id}-fond`
  const surLime = `${id}-sur-lime`
  const surCyan = `${id}-sur-cyan`
  return (
    <svg
      viewBox="0 0 32 32"
      className={`shrink-0 ${className}`}
      role={libelle ? 'img' : undefined}
      aria-label={libelle}
      aria-hidden={libelle ? undefined : true}
    >
      <defs>
        <linearGradient id={fond} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e2a3b" />
          <stop offset="1" stopColor="var(--color-fond)" />
        </linearGradient>
        <mask id={surLime} maskUnits="userSpaceOnUse" x="-10" y="-10" width="52" height="52">
          <circle cx="12" cy="16" r="6.6" fill="none" stroke="#fff" strokeWidth="3.6" />
        </mask>
        <mask id={surCyan} maskUnits="userSpaceOnUse" x="-10" y="-10" width="52" height="52">
          <circle cx="20" cy="16" r="6.6" fill="none" stroke="#fff" strokeWidth="3.6" />
        </mask>
      </defs>
      <rect width="32" height="32" rx="7" fill={`url(#${fond})`} />
      <rect
        x=".75"
        y=".75"
        width="30.5"
        height="30.5"
        rx="6.25"
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity=".45"
        strokeWidth="1.5"
      />
      <g transform="rotate(-30 16 16)" fill="none" strokeWidth="3.2">
        <circle cx="12" cy="16" r="6.6" stroke="var(--color-secondaire)" />
        <circle cx="20" cy="16" r="6.6" stroke="var(--color-accent)" />
        {/* Croisement haut : le cyan passe sur le lime (entaille sombre + arc). */}
        <path
          d="M13.63 14.29A6.6 6.6 0 0 1 20 9.4"
          stroke="#0b1d2b"
          strokeWidth="6"
          mask={`url(#${surLime})`}
        />
        <path d="M13.63 14.29A6.6 6.6 0 0 1 20 9.4" stroke="var(--color-accent)" />
        {/* Croisement bas : le lime passe sur le cyan. */}
        <path
          d="M18.37 17.71A6.6 6.6 0 0 1 12 22.6"
          stroke="#0b1d2b"
          strokeWidth="6"
          mask={`url(#${surCyan})`}
        />
        <path d="M18.37 17.71A6.6 6.6 0 0 1 12 22.6" stroke="var(--color-secondaire)" />
      </g>
    </svg>
  )
}
