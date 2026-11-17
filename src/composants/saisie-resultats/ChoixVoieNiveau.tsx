'use client'

import { useState } from 'react'

import { libelleVariante } from '@/domaine/resultat'

// Choix de la voie grimpée sur un niveau doublé d'un enfant (spec #6 R9bis,
// spec #9 R7) — partagé par la saisie coach et la saisie admin. Changer de voie
// n'écrit rien (R21) : seule la saisie d'une issue enregistre, sur la voie
// choisie, et remplace alors le résultat de l'autre voie du niveau (R9bis d).

/** Voie candidate d'un niveau (libellé spec #3 R50). */
export type VoieCandidate = {
  voieDifficulteId: string
  libelle: string
  cotation: string
  typeVoie: 'moulinette' | 'tete'
}

/**
 * Voie choisie pour une ligne de niveau : la voie de la ligne (celle qui porte
 * le résultat, sinon de plus petit ordre — R9bis b) tant que l'utilisateur n'en
 * a pas choisi une autre parmi `variantes`. `remplace` vaut vrai quand la voie
 * choisie n'est pas celle qui porte l'issue courante (avertissement R9bis d).
 */
export function useVoieChoisie<I extends string>(
  voie: VoieCandidate & { issue: I | null },
  variantes: readonly VoieCandidate[] | undefined,
) {
  const [choisieId, setChoisieId] = useState(voie.voieDifficulteId)
  const choisie: VoieCandidate =
    variantes?.find((v) => v.voieDifficulteId === choisieId) ?? voie
  const surVoieCourante = choisie.voieDifficulteId === voie.voieDifficulteId
  return {
    choisie,
    setChoisieId,
    /** Issue affichée : celle de la voie courante, rien sur une autre voie. */
    issue: surVoieCourante ? voie.issue : null,
    remplace: !surVoieCourante && voie.issue != null,
  }
}

/** Sélecteur compact de la voie d'un niveau doublé (thème sombre, ≥ 44 px). */
export function SelecteurVoieNiveau({
  niveau,
  variantes,
  valeur,
  onChange,
}: {
  niveau: string
  variantes: readonly VoieCandidate[]
  valeur: string
  onChange: (voieDifficulteId: string) => void
}) {
  return (
    <select
      aria-label={`Voie grimpée au niveau ${niveau}`}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 rounded-lg border border-bordure bg-black/30 px-2 text-base font-bold text-texte-fort [color-scheme:dark] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 lg:min-h-9 lg:text-sm"
    >
      {variantes.map((v) => (
        <option key={v.voieDifficulteId} value={v.voieDifficulteId} className="bg-fond text-texte">
          {libelleVariante({ niveau, libelle: v.libelle })}
        </option>
      ))}
    </select>
  )
}

/** Avertissement : une issue saisie ici remplacera le résultat de l'autre voie (R9bis d). */
export function AvisRemplacement({ libelle, issue }: { libelle: string; issue: string }) {
  return (
    <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] text-amber-300">
      ⚠ Remplacera le résultat de <strong>{libelle}</strong> ({issue}).
    </p>
  )
}
