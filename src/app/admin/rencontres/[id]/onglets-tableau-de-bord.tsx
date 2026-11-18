'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import type { Onglet } from '@/domaine/tableau-de-bord'

export type DefinitionOnglet = {
  id: Onglet
  libelle: string
  /** Compteur affiché sur l'onglet (R41 : équipes, épreuves, prêts). */
  compteur?: number
  panneau: ReactNode
}

/** Écrit l'onglet dans l'URL sans navigation (R41k) ; `?onglet=` survit au rechargement. */
function memoriserDansUrl(onglet: Onglet, garderAncre: boolean) {
  const url = new URL(window.location.href)
  url.searchParams.set('onglet', onglet)
  if (!garderAncre) url.hash = ''
  window.history.replaceState(null, '', url)
}

/**
 * Onglets du tableau de bord d'une rencontre (spec #3 R41k). Tous les panneaux
 * sont rendus (masqués hors onglet actif) : changer d'onglet est instantané et
 * conserve la saisie en cours d'un formulaire.
 * Une ancre (`#club-…`, R41h) visant un panneau masqué bascule sur son onglet.
 */
export function OngletsTableauDeBord({
  onglets,
  initial,
}: {
  onglets: DefinitionOnglet[]
  initial: Onglet
}) {
  const [actif, setActif] = useState<Onglet>(initial)
  // Navigation vers la même page avec un autre `?onglet=` : le serveur fait foi.
  const [initialPrecedent, setInitialPrecedent] = useState(initial)
  if (initial !== initialPrecedent) {
    setInitialPrecedent(initial)
    setActif(initial)
  }
  const ancreEnAttente = useRef<HTMLElement | null>(null)
  const boutons = useRef<Partial<Record<Onglet, HTMLButtonElement | null>>>({})

  function choisir(onglet: Onglet) {
    setActif(onglet)
    memoriserDansUrl(onglet, false)
  }

  useEffect(() => {
    const suivreAncre = () => {
      if (!window.location.hash) return
      const cible = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
      const panneau = cible?.closest<HTMLElement>('[data-onglet]')?.dataset.onglet as
        | Onglet
        | undefined
      if (!cible || !panneau) return
      ancreEnAttente.current = cible
      setActif(panneau)
      memoriserDansUrl(panneau, true)
    }
    suivreAncre()
    window.addEventListener('hashchange', suivreAncre)
    return () => window.removeEventListener('hashchange', suivreAncre)
  }, [])

  // Défile vers l'ancre une fois son panneau affiché.
  useEffect(() => {
    ancreEnAttente.current?.scrollIntoView({ block: 'start' })
    ancreEnAttente.current = null
  }, [actif])

  // Flèches gauche/droite, Début/Fin : navigation clavier entre onglets (ARIA).
  function auClavier(e: KeyboardEvent<HTMLDivElement>) {
    const i = onglets.findIndex((o) => o.id === actif)
    const cible =
      e.key === 'ArrowRight'
        ? onglets[(i + 1) % onglets.length]
        : e.key === 'ArrowLeft'
          ? onglets[(i - 1 + onglets.length) % onglets.length]
          : e.key === 'Home'
            ? onglets[0]
            : e.key === 'End'
              ? onglets[onglets.length - 1]
              : undefined
    if (!cible) return
    e.preventDefault()
    choisir(cible.id)
    boutons.current[cible.id]?.focus()
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Sections de la rencontre"
        onKeyDown={auClavier}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-bordure px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {onglets.map((o) => {
          const selectionne = o.id === actif
          return (
            <button
              key={o.id}
              ref={(el) => {
                boutons.current[o.id] = el
              }}
              type="button"
              role="tab"
              id={`onglet-${o.id}`}
              aria-controls={`panneau-${o.id}`}
              aria-selected={selectionne}
              tabIndex={selectionne ? 0 : -1}
              onClick={() => choisir(o.id)}
              className={`-mb-px flex min-h-11 flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                selectionne
                  ? 'border-accent text-texte-fort'
                  : 'border-transparent text-texte-attenue hover:text-texte'
              }`}
            >
              {o.libelle}
              {o.compteur !== undefined && (
                <span className="rounded-full bg-surface-forte px-2 py-0.5 text-[11px] text-texte-attenue">
                  {o.compteur}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {onglets.map((o) => (
        <div
          key={o.id}
          role="tabpanel"
          id={`panneau-${o.id}`}
          aria-labelledby={`onglet-${o.id}`}
          data-onglet={o.id}
          hidden={o.id !== actif}
        >
          {o.panneau}
        </div>
      ))}
    </div>
  )
}
