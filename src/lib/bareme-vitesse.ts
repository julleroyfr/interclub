import 'server-only'

import {
  BaremeVitesseInvalideError,
  validerEchelonsBareme,
  type EchelonBareme,
} from '@/domaine/vitesse'

// Lecture du jeu d'échelons soumis par les éditeurs de barème (rencontre & gabarit),
// partagée par les Server Actions. La validation fine (invariant R46, conditions
// R48) est déléguée au domaine pur `validerEchelonsBareme`.

/** Coerce une valeur soumise en nombre ; chaîne vide/absente → `NaN` (rejeté par R48). */
function nombreSoumis(v: unknown): number {
  const s = String(v ?? '').trim()
  return s === '' ? Number.NaN : Number(s)
}

/**
 * Lit et valide le jeu d'échelons soumis (champ `echelons` = JSON) selon R48
 * (fonction pure du domaine). Lève `BaremeVitesseInvalideError` si l'invariant est
 * violé ; renvoie les échelons **triés** (l'ordre d'insertion suit l'index).
 */
export function lireEchelonsSoumis(formData: FormData): EchelonBareme[] {
  let brut: unknown
  try {
    brut = JSON.parse(String(formData.get('echelons') ?? '[]'))
  } catch {
    throw new BaremeVitesseInvalideError('Barème illisible. Réessayez.')
  }
  if (!Array.isArray(brut)) {
    throw new BaremeVitesseInvalideError('Barème illisible. Réessayez.')
  }
  return validerEchelonsBareme(
    brut.map((e) => {
      const o = (e ?? {}) as Record<string, unknown>
      const rangMaxBrut = String(o.rangMax ?? '').trim()
      return {
        rangMin: nombreSoumis(o.rangMin),
        rangMax: rangMaxBrut === '' ? null : Number(rangMaxBrut),
        points: nombreSoumis(o.points),
        decrement: nombreSoumis(o.decrement),
      }
    }),
  )
}
