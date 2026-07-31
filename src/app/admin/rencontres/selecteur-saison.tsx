'use client'

import { labelSaison } from '@/domaine/rencontre'

/**
 * Sélecteur de saison pour la liste des rencontres (R28 spec #3).
 * Soumet un formulaire GET vers la même page avec ?saison=AAAA.
 * Affiche les 4 saisons autour de la saison courante.
 */
export function SelecteurSaison({
  saison,
  saisonCourante,
}: {
  saison: number
  saisonCourante: number
}) {
  const annees = Array.from({ length: 4 }, (_, i) => saisonCourante - 1 + i)

  return (
    <form method="get" className="flex items-center gap-2">
      <label
        htmlFor="saison-select"
        className="text-xs text-texte-attenue"
      >
        Saison
      </label>
      <select
        id="saison-select"
        name="saison"
        defaultValue={saison}
        onChange={(e) => e.currentTarget.form?.submit()}
        className="rounded-lg border border-bordure bg-black/30 px-2 py-1 text-xs text-texte-fort [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-accent/60"
      >
        {annees.map((a) => (
          <option key={a} value={a} className="bg-fond text-texte">
            {labelSaison(a)}
          </option>
        ))}
      </select>
    </form>
  )
}
