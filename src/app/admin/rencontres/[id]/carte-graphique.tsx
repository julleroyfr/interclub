'use client'

import { useState, type ReactNode } from 'react'

import { BoutonIcone, Carte } from '@/composants'
import type { partsGraphique } from '@/domaine/statistiques-rencontre'

// Carte de statistiques basculant entre sa liste et un graphique en anneau
// (spec #3 R41gter). Toujours ouverte en liste ; sans part, pas de bouton.

type Parts = ReturnType<typeof partsGraphique>

const R = 86
const R_INTERNE = 54
const CENTRE = 90

/** Dégradé d'une seule teinte (cyan), du clair (0) au foncé (1) ; ambre pour l'alerte. */
function couleur(teinte: number | null): string {
  return teinte === null ? 'var(--color-attention)' : `oklch(${0.92 - 0.4 * teinte} 0.13 210)`
}

/** Secteur d'anneau entre deux fractions de tour, depuis midi dans le sens horaire. */
function secteur(debut: number, fin: number): string {
  const a0 = debut * 2 * Math.PI
  // Un secteur plein (une seule part) ne se dessine pas en arc fermé : on s'arrête juste avant.
  const a1 = Math.min(fin * 2 * Math.PI, a0 + 2 * Math.PI - 1e-4)
  const point = (r: number, a: number) =>
    `${(CENTRE + r * Math.sin(a)).toFixed(2)} ${(CENTRE - r * Math.cos(a)).toFixed(2)}`
  const grand = a1 - a0 > Math.PI ? 1 : 0
  return (
    `M${point(R, a0)}A${R} ${R} 0 ${grand} 1 ${point(R, a1)}` +
    `L${point(R_INTERNE, a1)}A${R_INTERNE} ${R_INTERNE} 0 ${grand} 0 ${point(R_INTERNE, a0)}Z`
  )
}

export function CarteGraphique({
  titre,
  donnees,
  legendeCentre,
  pied,
  children,
}: {
  titre: string
  donnees: Parts
  /** Texte sous le total, au centre de l'anneau. */
  legendeCentre: string
  /** Affiché sous la liste comme sous le graphique. */
  pied?: ReactNode
  /** La liste des chiffres (vue par défaut). */
  children: ReactNode
}) {
  const [graphique, setGraphique] = useState(false)
  const avecParts = donnees.parts.length > 0
  const enGraphique = graphique && avecParts

  return (
    <Carte className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-texte-fort">{titre}</h3>
        {avecParts && (
          <BoutonIcone
            icone={enGraphique ? 'liste' : 'camembert'}
            libelle={enGraphique ? 'Afficher en liste' : 'Afficher en graphique'}
            aria-pressed={enGraphique}
            onClick={() => setGraphique(!enGraphique)}
          />
        )}
      </div>
      {enGraphique ? (
        <div className="flex flex-wrap items-center gap-4">
          <svg
            viewBox="0 0 180 180"
            className="h-44 w-44 shrink-0"
            role="img"
            aria-label={`${titre} : ${donnees.parts.map((p) => `${p.libelle} ${p.nombre}`).join(', ')}`}
          >
            {donnees.parts.map((p) => (
              <path
                key={p.cle}
                d={secteur(p.debut, p.fin)}
                fill={couleur(p.teinte)}
                stroke="var(--color-fond)"
                strokeWidth={2}
              >
                <title>{`${p.libelle} : ${p.nombre} (${p.pourcentage} %)`}</title>
              </path>
            ))}
            <text x={CENTRE} y={88} textAnchor="middle" className="fill-texte-fort text-[26px] font-bold">
              {donnees.total}
            </text>
            <text x={CENTRE} y={108} textAnchor="middle" className="fill-texte-attenue text-[11px]">
              {legendeCentre}
            </text>
          </svg>
          <ul className="min-w-40 max-w-xs flex-1 text-sm">
            {donnees.parts.map((p) => (
              <li key={p.cle} className="flex items-center gap-2 py-0.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: couleur(p.teinte) }}
                  aria-hidden
                />
                <span className={p.teinte === null ? 'font-semibold text-attention' : ''}>
                  {p.libelle}
                </span>
                <span className="ml-auto font-bold tabular-nums text-texte-fort">{p.nombre}</span>
                <span className="w-12 text-right tabular-nums text-texte-doux">{p.pourcentage} %</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        children
      )}
      {pied}
    </Carte>
  )
}
