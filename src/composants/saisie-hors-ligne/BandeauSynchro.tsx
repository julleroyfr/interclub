'use client'

import { type ReactNode, useEffect, useState } from 'react'

import { DELAI_ENVOI_LONG_MS, etatBandeau } from './etat-bandeau'

/**
 * Bandeau d'état de la file des saisies (spec #17 R24/R25/R26) : immédiat hors
 * ligne, en cas de session absente ou de saisie rejetée ; en ligne, l'envoi en
 * cours n'est signalé qu'au-delà de 2 secondes (R24, rév. 2026-10-09). Icône ET
 * texte (pas seulement une couleur, R23). FLOTTANT en bas de l'écran : il ne
 * décale jamais le contenu ni les boutons de saisie.
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

  // Envoi « long » : des saisies attendent depuis plus de 2 s sans interruption.
  const [envoiLong, setEnvoiLong] = useState(false)
  const attente = nbEnAttente > 0
  if (!attente && envoiLong) setEnvoiLong(false)
  useEffect(() => {
    if (!attente) return
    const minuteur = setTimeout(() => setEnvoiLong(true), DELAI_ENVOI_LONG_MS)
    return () => clearTimeout(minuteur)
  }, [attente])

  const etat = etatBandeau({ enLigne, nbEnAttente, nbRejetees, sessionAbsente, envoiLong })

  let style: string
  let icone: string
  let texte: string
  let detail: string | null = null
  let role: 'status' | 'alert' = 'status'
  if (etat === 'session') {
    style = 'border-attention/40 bg-attention/10 text-attention'
    icone = '⚠'
    texte = `Session expirée · ${saisies(nbEnAttente)}`
    detail = 'Elles seront envoyées dès que la session sera rétablie.'
    role = 'alert'
  } else if (etat === 'hors_ligne') {
    style = 'border-bordure bg-white/10 text-texte-fort'
    icone = '⦸'
    texte = nbEnAttente ? `Hors ligne · ${saisies(nbEnAttente)}` : 'Hors ligne'
    detail = 'Les saisies sont conservées et seront envoyées dès le retour du réseau.'
  } else if (etat === 'envoi') {
    style = 'border-accent/30 bg-accent/10 text-accent-doux'
    icone = '↻'
    texte = `Envoi en cours · ${saisies(nbEnAttente)}`
  } else if (etat === 'rejet') {
    style = 'border-danger/40 bg-danger/10 text-danger'
    icone = '⚠'
    texte = `${nbRejetees} saisie${nbRejetees > 1 ? 's' : ''} rejetée${nbRejetees > 1 ? 's' : ''}`
    role = 'alert'
  } else {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4">
    <div className="pointer-events-auto w-full max-w-xl rounded-xl bg-fond shadow-lg shadow-black/60">
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
    </div>
    </div>
  )
}
