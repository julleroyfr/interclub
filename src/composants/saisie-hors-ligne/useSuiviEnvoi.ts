'use client'

import { useEffect, useState } from 'react'

import { DELAI_ENVOI_LONG_MS } from './etat-bandeau'

/** Durée d'affichage de « enregistré » après une attente longue (R23). */
const DUREE_ENREGISTRE_MS = 2_500

/**
 * Suivi temporel de l'envoi d'une cible (spec #17 R23, rév. 2026-10-09) :
 * `attenteLongue` devient vrai après 2 s d'attente ininterrompue ;
 * `enregistreApresAttente` reste vrai 2,5 s après la fin d'une attente longue.
 */
export function useSuiviEnvoi(enAttente: boolean): {
  attenteLongue: boolean
  enregistreApresAttente: boolean
} {
  const [attenteLongue, setAttenteLongue] = useState(false)
  const [enregistreApresAttente, setEnregistreApresAttente] = useState(false)
  const [precedent, setPrecedent] = useState(enAttente)

  // Transition d'état, ajustée pendant le rendu (pas dans un effet).
  if (precedent !== enAttente) {
    setPrecedent(enAttente)
    if (enAttente) {
      setEnregistreApresAttente(false)
    } else {
      if (attenteLongue) setEnregistreApresAttente(true)
      setAttenteLongue(false)
    }
  }

  useEffect(() => {
    if (!enAttente) return
    const minuteur = setTimeout(() => setAttenteLongue(true), DELAI_ENVOI_LONG_MS)
    return () => clearTimeout(minuteur)
  }, [enAttente])

  useEffect(() => {
    if (!enregistreApresAttente) return
    const minuteur = setTimeout(() => setEnregistreApresAttente(false), DUREE_ENREGISTRE_MS)
    return () => clearTimeout(minuteur)
  }, [enregistreApresAttente])

  return { attenteLongue, enregistreApresAttente }
}
