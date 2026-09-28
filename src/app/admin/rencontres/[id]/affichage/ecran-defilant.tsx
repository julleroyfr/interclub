'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'

import type { Sexe } from '@/domaine/grimpeur'

/** Une ligne du classement mixte affiché (R4/R5/R6). */
export type LigneAffichage = {
  grimpeurId: string
  rang: number
  sexe: Sexe
  nom: string
  prenom: string
  club: string
  score: number
}

const SECONDES_PAR_LIGNE = 2.2
const DUREE_MIN_S = 10
const DUREE_MAX_S = 90

const CLASSE_SEXE: Record<Sexe, string> = {
  F: 'bg-secondaire/12 text-secondaire border-secondaire/30',
  H: 'bg-accent/12 text-accent-doux border-accent/30',
}

/** Préférence système « mouvement réduit » (a11y, conv. 08 §6), sans effet + setState. */
function useReduireMouvement(): boolean {
  return useSyncExternalStore(
    (notifier) => {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)')
      media.addEventListener('change', notifier)
      return () => media.removeEventListener('change', notifier)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

/** Couleur du rang podium (1 = or, 2 = argent, 3 = bronze), R6/podium visuel. */
function classeRang(rang: number): string {
  if (rang === 1) return 'text-attention'
  if (rang === 2) return 'text-texte'
  if (rang === 3) return 'text-prepa'
  return 'text-texte-doux'
}

/**
 * Écran d'affichage secondaire (spec #14) : défilement automatique en boucle du
 * classement individuel mixte (R9), rechargement des données à chaque fin de
 * boucle (R10), sans abonnement temps réel (R11) ni interaction utilisateur
 * (R12). Distinct de l'écran de consultation (spec #7) : pas de coquille de
 * navigation, plein écran, pensé pour un second afficheur.
 */
export function EcranDefilant({
  dateRencontre,
  categorie,
  visible,
  officiel,
  lignes,
}: {
  dateRencontre: string
  categorie: string
  visible: boolean
  officiel: boolean
  lignes: LigneAffichage[]
}) {
  const router = useRouter()
  const fenetreRef = useRef<HTMLDivElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState(0)
  const reduireMouvement = useReduireMouvement()

  useEffect(() => {
    const fenetre = fenetreRef.current
    const liste = listeRef.current
    if (!fenetre || !liste) return
    setDistance(Math.max(0, liste.scrollHeight - fenetre.clientHeight))
  }, [lignes])

  const duree = useMemo(() => {
    const brute = lignes.length * SECONDES_PAR_LIGNE
    return Math.min(DUREE_MAX_S, Math.max(DUREE_MIN_S, brute))
  }, [lignes.length])

  // Confort visuel réduit (R12 §6 a11y) : pas d'animation, mais la boucle de
  // rechargement (R10) continue quand même, au même rythme.
  useEffect(() => {
    if (!reduireMouvement || !visible || lignes.length === 0) return
    const minuteur = setInterval(() => router.refresh(), duree * 1000)
    return () => clearInterval(minuteur)
  }, [reduireMouvement, visible, lignes.length, duree, router])

  // Fin de boucle (R10) : chaque itération de l'animation infinie relit les
  // données (le bouclage visuel « retour en haut » est géré par le keyframe).
  const surIteration = () => router.refresh()

  return (
    <div className="min-h-screen bg-fond px-6 py-6 text-texte sm:px-10">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-texte-fort sm:text-3xl">{dateRencontre}</h1>
          <p className="text-sm text-texte-attenue">
            Catégorie {categorie} · Classement individuel · toutes catégories confondues
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold ${
            officiel
              ? 'border-secondaire/30 bg-secondaire/10 text-secondaire'
              : 'border-bordure bg-white/5 text-texte-attenue'
          }`}
        >
          {officiel ? '✓ Officiel' : '● Non officiel'}
        </span>
      </header>

      {!visible ? (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-center">
          <span className="text-4xl" aria-hidden>
            ⏳
          </span>
          <p className="max-w-md text-sm text-texte-attenue">
            Le classement s&apos;affichera dès le début de la compétition.
          </p>
        </div>
      ) : lignes.length === 0 ? (
        <div className="flex h-[70vh] items-center justify-center text-texte-attenue">
          Aucun résultat pour le moment.
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl">
          <div className="grid grid-cols-[56px_1fr_140px] gap-3 border-b border-bordure px-2 pb-2 text-xs font-bold tracking-wide text-texte-doux uppercase sm:grid-cols-[64px_1fr_160px_110px]">
            <span>#</span>
            <span>Grimpeur</span>
            <span className="hidden sm:block">Club</span>
            <span className="text-right">Score</span>
          </div>

          <div
            ref={fenetreRef}
            className={`relative h-[72vh] ${reduireMouvement ? 'overflow-y-auto' : 'overflow-hidden'}`}
          >
            <div
              ref={listeRef}
              onAnimationIteration={surIteration}
              className={reduireMouvement ? undefined : 'defilement-auto'}
              style={
                reduireMouvement
                  ? undefined
                  : {
                      animationDuration: `${duree}s`,
                      ['--distance-defilement' as string]: `${distance}px`,
                    }
              }
            >
              {lignes.map((ligne) => (
                <div
                  key={ligne.grimpeurId}
                  className="grid grid-cols-[56px_1fr_140px] items-center gap-3 border-b border-white/5 px-2 py-3 sm:grid-cols-[64px_1fr_160px_110px]"
                >
                  <span className={`text-xl font-black ${classeRang(ligne.rang)}`}>{ligne.rang}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-extrabold ${CLASSE_SEXE[ligne.sexe]}`}
                    >
                      {ligne.sexe}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-texte-fort">
                        {ligne.nom} {ligne.prenom}
                      </div>
                      <div className="truncate text-xs text-texte-doux sm:hidden">{ligne.club}</div>
                    </div>
                  </div>
                  <span className="hidden truncate text-sm text-texte-doux sm:block">{ligne.club}</span>
                  <span className="text-right text-lg font-black text-secondaire">
                    {ligne.score}
                    <span className="ml-1 text-[10px] font-bold text-texte-doux">pts</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
