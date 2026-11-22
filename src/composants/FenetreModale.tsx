'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Fenêtre modale du design system (première utilisation : confirmation de la
 * clôture, spec #3 R17bis). `<dialog>` natif ouvert en `showModal()` : focus
 * piégé, Échap ferme ; un clic sur le voile (hors du contenu) ferme aussi.
 * L'appelant pilote `ouverte` et reçoit `onFermer` pour toute fermeture.
 */
export function FenetreModale({
  ouverte,
  titre,
  onFermer,
  children,
}: {
  ouverte: boolean
  titre: string
  onFermer: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitre = useId()

  useEffect(() => {
    const dialogue = ref.current
    if (!dialogue) return
    if (ouverte && !dialogue.open) dialogue.showModal()
    if (!ouverte && dialogue.open) dialogue.close()
  }, [ouverte])

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitre}
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer()
      }}
      className="m-auto max-h-[calc(100dvh-24px)] w-[min(560px,calc(100vw-24px))] rounded-2xl border border-bordure bg-[#0b1222] p-0 text-texte backdrop:bg-fond/75"
    >
      {/* Contenu monté seulement à l'ouverture : rien de caché ne double l'écran. */}
      {ouverte && (
        <div className="flex flex-col gap-3 p-5">
          <h2 id={idTitre} className="text-lg font-bold text-texte-fort">
            {titre}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  )
}
