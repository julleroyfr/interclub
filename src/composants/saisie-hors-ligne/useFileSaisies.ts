'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  abandonnerSaisie,
  ajouterSaisie,
  appliquerIssueEnvoi,
  clePerimetre,
  ecartHorloge,
  heureSaisie,
  retirerRejet,
  saisiesAEnvoyer,
  type IssueEnvoi,
  type PerimetreFile,
  type SaisieLocale,
} from '@/domaine/hors-ligne'
import { ecrireFile, lireFile } from '@/lib/saisie/stockage-file'

/** Nouvel essai périodique tant que la file n'est pas vide (spec #17 R15). */
const PERIODE_ESSAI_MS = 30_000

/** État du réseau de l'appareil (événements `online` / `offline`). */
function abonnerReseau(rappel: () => void) {
  window.addEventListener('online', rappel)
  window.addEventListener('offline', rappel)
  return () => {
    window.removeEventListener('online', rappel)
    window.removeEventListener('offline', rappel)
  }
}

/** Résultat d'un envoi, tel que le rapporte l'écran. */
export type ResultatEnvoi<R> = {
  issue: IssueEnvoi
  /** Heure du serveur à la réponse : remesure l'écart d'horloge (R6). */
  heureServeur?: number
  /** Données propres à l'écran (score…) en cas d'acceptation. */
  donnees?: R
}

/**
 * File d'attente des saisies sur l'appareil et sa synchronisation (spec #17
 * R12–R19, R28). Toute saisie y entre AVANT d'être envoyée (R12) ; elle est
 * conservée sur l'appareil (stockage local) et envoyée automatiquement — à
 * l'ajout, au retour du réseau, au retour sur l'écran, et toutes les 30 s tant
 * qu'il en reste (R15) — dans l'ordre chronologique (R16). Un échec temporaire
 * ou une session absente interrompt la tournée (R17/R19) ; un refus définitif
 * passe la saisie en « rejetée » (R18).
 */
export function useFileSaisies<C, R = undefined>({
  perimetre,
  heureServeur,
  envoyer,
  surAcceptee,
}: {
  perimetre: PerimetreFile
  /** Heure du serveur au rendu de l'écran (ms) : mesure de l'écart (R6). */
  heureServeur: number
  envoyer: (saisie: SaisieLocale<C>, saisiLeIso: string) => Promise<ResultatEnvoi<R>>
  surAcceptee?: (saisie: SaisieLocale<C>, donnees: R | undefined) => void
}) {
  const cle = clePerimetre(perimetre)
  const [file, setFile] = useState<SaisieLocale<C>[]>([])
  const [chargee, setChargee] = useState(false)
  const enLigne = useSyncExternalStore(
    abonnerReseau,
    () => navigator.onLine,
    () => true,
  )
  const [sessionAbsente, setSessionAbsente] = useState(false)

  const fileRef = useRef<SaisieLocale<C>[]>([])
  const ecart = useRef(0)
  const enCours = useRef(false)
  const relancer = useRef(false)
  const envoyerRef = useRef(envoyer)
  const surAccepteeRef = useRef(surAcceptee)
  useEffect(() => {
    envoyerRef.current = envoyer
    surAccepteeRef.current = surAcceptee
  })

  /** Met à jour la file (référence immédiate + état affiché). */
  const majFile = useCallback((fn: (f: SaisieLocale<C>[]) => SaisieLocale<C>[]) => {
    fileRef.current = fn(fileRef.current)
    setFile(fileRef.current)
  }, [])

  const synchroniser = useCallback(async () => {
    if (!fileRef.current.length) return
    if (enCours.current) {
      relancer.current = true
      return
    }
    enCours.current = true
    try {
      for (;;) {
        const prochaine = saisiesAEnvoyer(fileRef.current)[0]
        if (!prochaine) break
        if (typeof navigator !== 'undefined' && !navigator.onLine) break
        let resultat: ResultatEnvoi<R>
        try {
          resultat = await envoyerRef.current(prochaine, new Date(prochaine.saisiLe).toISOString())
        } catch {
          resultat = { issue: { type: 'temporaire' } } // réseau absent, délai dépassé (R17)
        }
        if (resultat.heureServeur) ecart.current = ecartHorloge(resultat.heureServeur, Date.now())
        majFile((f) => appliquerIssueEnvoi(f, prochaine.id, resultat.issue))
        if (resultat.issue.type === 'acceptee') {
          setSessionAbsente(false)
          surAccepteeRef.current?.(prochaine, resultat.donnees)
        } else if (resultat.issue.type === 'session') {
          setSessionAbsente(true) // R19 : en attente d'un nouveau scan / d'une reconnexion
          break
        } else if (resultat.issue.type === 'temporaire') {
          break
        }
      }
    } finally {
      enCours.current = false
      if (relancer.current) {
        relancer.current = false
        void synchroniser()
      }
    }
  }, [majFile])

  // Chargement de la file du périmètre, puis première synchronisation (R19 :
  // une file laissée par une session précédente du même périmètre est rejouée).
  useEffect(() => {
    let annule = false
    ecart.current = ecartHorloge(heureServeur, Date.now())
    void lireFile<SaisieLocale<C>[]>(cle).then((stockee) => {
      if (annule) return
      fileRef.current = [...(stockee ?? []), ...fileRef.current]
      setFile(fileRef.current)
      setChargee(true)
      void synchroniser()
    })
    return () => {
      annule = true
    }
    // heureServeur : mesure prise une fois, au chargement de l'écran (R6).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, synchroniser])

  // Persistance sur l'appareil à chaque changement (R12), une fois chargée.
  useEffect(() => {
    if (chargee) void ecrireFile(cle, file)
  }, [cle, file, chargee])

  // Déclencheurs : réseau, retour sur l'écran, essai périodique (R15).
  useEffect(() => {
    const surEnLigne = () => void synchroniser()
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') void synchroniser()
    }
    window.addEventListener('online', surEnLigne)
    document.addEventListener('visibilitychange', surVisibilite)
    const minuteur = setInterval(() => void synchroniser(), PERIODE_ESSAI_MS)
    return () => {
      window.removeEventListener('online', surEnLigne)
      document.removeEventListener('visibilitychange', surVisibilite)
      clearInterval(minuteur)
    }
  }, [synchroniser])

  const nbEnAttente = file.filter((s) => s.etat === 'en_attente').length

  // Confirmation avant de quitter tant que des saisies attendent (R28).
  useEffect(() => {
    if (!nbEnAttente) return
    const avantDepart = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avantDepart)
    return () => window.removeEventListener('beforeunload', avantDepart)
  }, [nbEnAttente])

  /** Ajoute une saisie (heure corrigée, R6) puis lance l'envoi (R12/R15). */
  const ajouter = useCallback(
    (cible: string, contenu: C) => {
      majFile((f) =>
        ajouterSaisie(f, {
          id: crypto.randomUUID(),
          cible,
          saisiLe: heureSaisie(Date.now(), ecart.current),
          contenu,
          etat: 'en_attente',
        }),
      )
      void synchroniser()
    },
    [majFile, synchroniser],
  )

  return {
    file,
    nbEnAttente,
    enLigne,
    sessionAbsente,
    ajouter,
    abandonner: (id: string) => majFile((f) => abandonnerSaisie(f, id)),
    retirerRejet: (id: string) => majFile((f) => retirerRejet(f, id)),
  }
}
