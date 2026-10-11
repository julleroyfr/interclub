import type { ReactNode } from 'react'

/** En-tête de page : titre h1 + sous-titre optionnel. */
export function EnTetePage({
  titre,
  sousTitre,
}: {
  titre: ReactNode
  sousTitre?: ReactNode
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-texte-fort sm:text-3xl">
        {titre}
      </h1>
      {sousTitre && (
        <p className="mt-1 text-sm text-texte-attenue">{sousTitre}</p>
      )}
    </div>
  )
}

/** Titre de section (h2). */
export function TitreSection({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-texte-fort">{children}</h2>
  )
}
