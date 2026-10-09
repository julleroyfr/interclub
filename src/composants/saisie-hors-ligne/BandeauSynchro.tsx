'use client'

import type { ReactNode } from 'react'

/**
 * Bandeau d'état de la file des saisies (spec #17 R24/R25) : affiché dès que
 * l'appareil est hors ligne, qu'une saisie attend, qu'une session manque ou
 * qu'une saisie a été rejetée. Icône ET texte (pas seulement une couleur, R23).
 */
export function BandeauSynchro({
  enLigne,
  nbEnAttente,
  nbRejetees,
  sessionAbsente,
  actionSession,
  onVoirListe,
}: {
  enLigne: boolean
  nbEnAttente: number
  nbRejetees: number
  sessionAbsente: boolean
  /** Action proposée quand la session manque : rescanner le QR, se reconnecter (R25). */
  actionSession: ReactNode
  onVoirListe: () => void
}) {
  const saisies = (n: number) => `${n} saisie${n > 1 ? 's' : ''} en attente`

  let style: string
  let icone: string
  let texte: string
  let detail: string | null = null
  let role: 'status' | 'alert' = 'status'
  if (sessionAbsente && nbEnAttente) {
    style = 'border-attention/40 bg-attention/10 text-attention'
    icone = '⚠'
    texte = `Session expirée · ${saisies(nbEnAttente)}`
    detail = 'Elles seront envoyées dès que la session sera rétablie.'
    role = 'alert'
  } else if (!enLigne) {
    style = 'border-bordure bg-white/10 text-texte-fort'
    icone = '⦸'
    texte = nbEnAttente ? `Hors ligne · ${saisies(nbEnAttente)}` : 'Hors ligne'
    detail = 'Les saisies sont conservées et seront envoyées dès le retour du réseau.'
  } else if (nbEnAttente) {
    style = 'border-accent/30 bg-accent/10 text-accent-doux'
    icone = '↻'
    texte = `Envoi en cours · ${saisies(nbEnAttente)}`
  } else if (nbRejetees) {
    style = 'border-danger/40 bg-danger/10 text-danger'
    icone = '⚠'
    texte = `${nbRejetees} saisie${nbRejetees > 1 ? 's' : ''} rejetée${nbRejetees > 1 ? 's' : ''}`
    role = 'alert'
  } else {
    return null
  }

  return (
    <div
      role={role}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${style}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        {texte}
        {detail && <span className="block text-xs font-medium opacity-85">{detail}</span>}
      </span>
      {sessionAbsente && nbEnAttente > 0 && actionSession}
      {(nbEnAttente > 0 || nbRejetees > 0) && (
        <button
          type="button"
          onClick={onVoirListe}
          className="min-h-9 rounded-lg border border-current bg-black/30 px-3 text-xs font-bold"
        >
          Voir
        </button>
      )}
    </div>
  )
}
