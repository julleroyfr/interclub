'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { declencheNavigation } from './navigation-en-cours'

/** Délai avant affichage : évite le clignotement des navigations instantanées. */
const DELAI_AFFICHAGE_MS = 150
/** Filet de sécurité si la navigation n'aboutit jamais (échec réseau). */
const DELAI_ABANDON_MS = 20_000

/** Vide la liste en place (le tableau est partagé via une ref). */
function annulerMinuteries(minuteries: ReturnType<typeof setTimeout>[]) {
  minuteries.forEach(clearTimeout)
  minuteries.length = 0
}

/**
 * Indicateur de chargement global (spec #12 R26) : après un clic sur un lien
 * interne, un spinner apparaît si la page cible tarde, et disparaît quand l'URL
 * change. Monté une fois dans la mise en page racine.
 */
export function IndicateurNavigation() {
  const pathname = usePathname()
  const recherche = useSearchParams().toString()
  const cle = `${pathname}?${recherche}`
  const [visible, setVisible] = useState(false)
  const [cleAffichee, setCleAffichee] = useState(cle)
  const minuteries = useRef<ReturnType<typeof setTimeout>[]>([])

  // Nouvelle page affichée (ou retour arrière) → on masque, pendant le rendu
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  if (cle !== cleAffichee) {
    setCleAffichee(cle)
    setVisible(false)
  }
  // …et on annule un affichage différé encore en attente.
  useEffect(() => () => annulerMinuteries(minuteries.current), [cle])

  useEffect(() => {
    const enCours = minuteries.current
    function arreter() {
      annulerMinuteries(enCours)
      setVisible(false)
    }
    function surClic(e: MouseEvent) {
      const lien = (e.target as Element | null)?.closest?.('a[href]')
      if (!(lien instanceof HTMLAnchorElement)) return
      const navigue = declencheNavigation(
        {
          href: lien.href,
          target: lien.target,
          telechargement: lien.hasAttribute('download'),
          bouton: e.button,
          modificateur: e.ctrlKey || e.metaKey || e.shiftKey || e.altKey,
          dejaGere: e.defaultPrevented,
        },
        window.location.href,
      )
      if (!navigue) return
      arreter()
      enCours.push(
        setTimeout(() => setVisible(true), DELAI_AFFICHAGE_MS),
        setTimeout(arreter, DELAI_ABANDON_MS),
      )
    }
    // Phase de capture : `next/link` appelle preventDefault() en bulle.
    window.addEventListener('click', surClic, true)
    window.addEventListener('popstate', arreter)
    return () => {
      window.removeEventListener('click', surClic, true)
      window.removeEventListener('popstate', arreter)
      annulerMinuteries(enCours)
    }
  }, [])

  // La région `status` reste montée : un lecteur d'écran n'annonce de façon
  // fiable que les changements de contenu d'une région déjà présente.
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50">
      {visible && (
        <>
          <div aria-hidden="true" className="h-0.5 overflow-hidden bg-accent/20">
            <div className="barre-navigation h-full w-1/3 bg-accent" />
          </div>
          {/* Sous le bandeau collant de la coquille, pour ne pas masquer ses onglets. */}
          <div className="flex justify-center pt-20">
            <span className="flex items-center gap-2 rounded-full border border-bordure bg-fond/90 px-3 py-1.5 text-sm text-texte shadow-lg backdrop-blur">
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
              />
              Chargement…
            </span>
          </div>
        </>
      )}
    </div>
  )
}
