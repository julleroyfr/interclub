// Traçage optionnel des appels Supabase côté serveur — lot 0 du plan « appels
// Supabase » (docs/revues/2026-10-09-plan-action-appels-supabase.md). Rend
// observables le nombre d'appels et de VAGUES d'un chargement de page ou d'une
// action : la latence Ohio ↔ Dublin se paie par vague séquentielle, pas par
// requête. Inactif par défaut, jamais en production (`estTraceActive`).
//
// Une vague = des appels lancés pendant que d'autres sont encore en vol (un même
// `Promise.all`). Un appel lancé quand plus rien n'est en vol ouvre une nouvelle
// vague ; après une pause plus longue que `PAUSE_SEQUENCE_MS`, une nouvelle
// SÉQUENCE (requête suivante). Heuristique : mesurer une page à la fois, sans
// autre onglet ni prefetch en parallèle.

/** Au-delà de cette pause sans appel, la requête suivante ouvre une séquence. */
export const PAUSE_SEQUENCE_MS = 1000

/** Un appel en cours de traçage. */
export type AppelTrace = {
  sequence: number
  vague: number
  numero: number
  description: string
  debut: number
}

type DependancesTraceur = {
  maintenant: () => number
  journaliser: (ligne: string) => void
  /** Planifie `fn` après `ms` ; renvoie de quoi l'annuler. */
  planifier: (fn: () => void, ms: number) => () => void
}

/** Variables d'environnement lues pour activer le traçage. */
type Environnement = Partial<Record<'SUPABASE_TRACE' | 'NODE_ENV', string>>

/** Traçage demandé (`SUPABASE_TRACE=1`) et hors production. */
export function estTraceActive(env: Environnement): boolean {
  return env.SUPABASE_TRACE === '1' && env.NODE_ENV !== 'production'
}

/** « GET rencontre », « RPC nom », « AUTH GET /admin/users »… */
export function decrireAppel(url: string, methode: string): string {
  const { pathname } = new URL(url)
  const rpc = pathname.match(/^\/rest\/v1\/rpc\/([^/]+)/)
  if (rpc) return `RPC ${rpc[1]}`
  const table = pathname.match(/^\/rest\/v1\/([^/]+)/)
  if (table) return `${methode} ${table[1]}`
  const auth = pathname.match(/^\/auth\/v1(\/.*)$/)
  if (auth) return `AUTH ${methode} ${auth[1]}`
  return `${methode} ${pathname}`
}

/** Compteur de séquences, vagues et appels ; journalise chaque appel. */
export function creerTraceur({ maintenant, journaliser, planifier }: DependancesTraceur) {
  let sequence = 0
  let vague = 0
  let numero = 0
  let enVol = 0
  let debutSequence = 0
  let derniereFin = -Infinity
  let annulerResume: (() => void) | undefined

  function resumer(seq: number, vagues: number, appels: number, duree: number) {
    journaliser(`[supabase] #${seq} terminée : ${vagues} vagues, ${appels} appels, ${duree} ms`)
  }

  function debut(description: string): AppelTrace {
    const t = maintenant()
    annulerResume?.()
    annulerResume = undefined
    if (enVol === 0) {
      if (t - derniereFin > PAUSE_SEQUENCE_MS) {
        sequence += 1
        vague = 0
        numero = 0
        debutSequence = t
      }
      vague += 1
    }
    enVol += 1
    numero += 1
    return { sequence, vague, numero, description, debut: t }
  }

  function fin(appel: AppelTrace, statut: number | 'échec') {
    const t = maintenant()
    enVol -= 1
    derniereFin = t
    journaliser(
      `[supabase] #${appel.sequence} v${appel.vague} a${appel.numero} ` +
        `+${appel.debut - debutSequence}ms ${t - appel.debut}ms ${statut} ${appel.description}`,
    )
    if (enVol === 0) {
      const [seq, vagues, appels, duree] = [sequence, vague, numero, t - debutSequence]
      annulerResume = planifier(() => resumer(seq, vagues, appels, duree), PAUSE_SEQUENCE_MS)
    }
  }

  return { debut, fin }
}

/** Partagé via `globalThis` : Next peut charger ce module dans plusieurs couches. */
const partage = globalThis as { traceurSupabase?: ReturnType<typeof creerTraceur> }

/**
 * `fetch` à passer en `global.fetch` aux clients Supabase serveur : tracé si
 * `estTraceActive`, sinon `undefined` (le client garde son `fetch` par défaut).
 * Un seul traceur pour tous les clients : les vagues d'une requête se comptent
 * quel que soit le client (session ou `service_role`) qui les lance.
 */
export function fetchSupabase(): typeof fetch | undefined {
  if (!estTraceActive(process.env)) return undefined
  partage.traceurSupabase ??= creerTraceur({
    maintenant: () => Math.round(performance.now()),
    journaliser: (ligne) => console.log(ligne),
    planifier: (fn, ms) => {
      const minuterie = setTimeout(fn, ms)
      return () => clearTimeout(minuterie)
    },
  })
  const traceur = partage.traceurSupabase
  return async (entree, init) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url
    const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET')
    const appel = traceur.debut(decrireAppel(url, methode.toUpperCase()))
    try {
      const reponse = await fetch(entree, init)
      traceur.fin(appel, reponse.status)
      return reponse
    } catch (erreur) {
      traceur.fin(appel, 'échec')
      throw erreur
    }
  }
}
