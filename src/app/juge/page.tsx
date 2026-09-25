import type { Metadata } from 'next'

import { TempsReel } from '@/composants'
import { terminerSession } from '@/lib/auth/actions'
import { exigerContexteJuge } from '@/lib/auth/session'
import { getSaisieVitesse } from '@/lib/juge/vitesse'

import { PanneauVitesse } from './panneau-vitesse'

export const metadata: Metadata = {
  title: 'Saisie de la vitesse — Interclub',
}

function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Écran de saisie de la vitesse par le juge (spec #10). Réservé à une session QR
 * juge active en ③ compétition (R1) : hors de ce cadre, `getContexteJuge` renvoie
 * `null` et l'espace est masqué (404). Plein écran, responsive (R14c). La RLS est
 * la frontière ultime.
 */
export default async function PageJuge() {
  const contexte = await exigerContexteJuge()

  const saisie = await getSaisieVitesse(contexte.epreuveVitesseId)

  return (
    <div className="min-h-screen bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] text-texte">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-bordure bg-surface px-4 py-4 sm:px-5">
          <div>
            <h1 className="text-lg font-extrabold text-texte-fort sm:text-xl">
              <span className="text-accent-doux">⚡</span> Vitesse — {contexte.clubPorteurNom} ·{' '}
              {formaterDate(contexte.dateRencontre)}
            </h1>
            <p className="mt-0.5 text-sm text-texte-attenue">
              Épreuve de vitesse
              {contexte.couloirNumero != null && ` · couloir ${contexte.couloirNumero}`} · juge
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/12 px-3 py-1 text-xs font-semibold text-accent-doux">
            ● ③ Compétition
          </span>
          {/* Live : synchronise les temps entre écrans juge (spec #11 R1/R3). L'écran
              n'existe qu'en ③ (getContexteJuge) → actif par défaut. */}
          <TempsReel tables={['temps_vitesse']} />
          {/* Fin de session QR juge (spec #12 R17) : ferme la session → accueil. */}
          <form action={terminerSession} className="ml-auto">
            <button
              type="submit"
              className="rounded-lg border border-bordure px-3 py-1.5 text-sm font-medium text-texte-attenue transition hover:bg-surface-forte hover:text-texte-fort"
            >
              Terminer
            </button>
          </form>
        </header>

        <PanneauVitesse grimpeurs={saisie.grimpeurs} />
      </div>
    </div>
  )
}
