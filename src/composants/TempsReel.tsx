'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'

import { Pastille, type VariantePastille } from './Pastille'

/**
 * Indicateur + abonnement **temps réel** (spec #11). Monté sur un écran
 * authentifié, il s'abonne aux écritures des `tables` sources via Supabase
 * *Postgres Changes* et **relit l'écran** (`router.refresh()`) à chaque
 * changement — le canal ne porte qu'un **signal**, jamais de données : le calcul
 * reste côté serveur/domaine (R4). Anti-rebond (R9), indicateur d'état (R10),
 * rattrapage à la reconnexion (R11), désabonnement au démontage (R7). La **RLS**
 * (« authentifié dès ③ ») est la frontière : un rôle ne reçoit que ce qu'il peut
 * lire (R5) — `anon` ne reçoit rien (spec #8 préservée).
 */

/** Tables sources du live (spec #11 R3). */
export type TableTempsReel =
  | 'resultat_voie'
  | 'resultat_bloc'
  | 'points_vitesse'
  | 'temps_vitesse'

type EtatConnexion = 'connexion' | 'connecte' | 'interrompu'

/** Regroupe les évènements rapprochés en une seule relecture (R9). */
const ANTI_REBOND_MS = 400

export function TempsReel({
  tables,
  actif = true,
}: {
  tables: TableTempsReel[]
  /** Faux hors phase de live (R7) : ni abonnement ni indicateur. */
  actif?: boolean
}) {
  const router = useRouter()
  const [etat, setEtat] = useState<EtatConnexion>('connexion')

  // Clé stable (ordre indifférent) : évite de relancer l'effet à chaque rendu,
  // le tableau `tables` changeant d'identité.
  const cleTables = [...tables].sort().join(',')

  useEffect(() => {
    if (!actif || cleTables === '') return

    const supabase = createClient()
    const listeTables = cleTables.split(',') as TableTempsReel[]

    let rebond: ReturnType<typeof setTimeout> | undefined
    // Vrai dès la 1re souscription : un retour ultérieur à SUBSCRIBED = reconnexion
    // → relecture de rattrapage des évènements manqués (R11).
    let dejaConnecte = false

    const rafraichir = () => {
      if (rebond) clearTimeout(rebond)
      rebond = setTimeout(() => router.refresh(), ANTI_REBOND_MS) // R4 + R9
    }

    const canal: RealtimeChannel = supabase.channel(`temps-reel:${cleTables}`)
    for (const table of listeTables) {
      canal.on(
        'postgres_changes',
        { event: '*', schema: 'interclub', table },
        rafraichir, // charge utile ignorée : signal seul (R4)
      )
    }

    canal.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        if (dejaConnecte) router.refresh() // rattrapage à la reconnexion (R11)
        dejaConnecte = true
        setEtat('connecte')
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        setEtat('interrompu')
      }
    })

    // Réagir sans attendre le socket : couper l'indicateur hors ligne, forcer un
    // rattrapage au retour (R11). Le socket se ré-abonne de lui-même en parallèle.
    const surHorsLigne = () => setEtat('interrompu')
    const surEnLigne = () => rafraichir()
    window.addEventListener('offline', surHorsLigne)
    window.addEventListener('online', surEnLigne)

    return () => {
      if (rebond) clearTimeout(rebond)
      window.removeEventListener('offline', surHorsLigne)
      window.removeEventListener('online', surEnLigne)
      void supabase.removeChannel(canal) // désabonnement au démontage (R7)
    }
  }, [actif, cleTables, router])

  if (!actif) return null

  const libelle: Record<EtatConnexion, string> = {
    connexion: 'Connexion…',
    connecte: 'En direct',
    interrompu: 'Hors ligne',
  }
  const variante: Record<EtatConnexion, VariantePastille> = {
    connexion: 'neutre',
    connecte: 'succes',
    interrompu: 'attention',
  }

  return (
    <span
      aria-live="polite"
      title="Les résultats se mettent à jour automatiquement"
      className="inline-flex items-center gap-1.5 rounded-full border border-bordure bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-texte-attenue"
    >
      <Pastille variante={variante[etat]} />
      {libelle[etat]}
    </span>
  )
}
