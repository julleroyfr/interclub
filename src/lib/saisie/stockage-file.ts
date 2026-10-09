// Stockage de la file d'attente sur l'appareil (spec #17 R12) : survit au
// rechargement, à la mise en veille et à la fermeture du navigateur. IndexedDB,
// une entrée par périmètre de file (R4). Repli en mémoire si le navigateur le
// refuse (navigation privée stricte…) : la file vit alors le temps de la page.

const BASE = 'interclub-saisie-hors-ligne'
const MAGASIN = 'files'

const memoire = new Map<string, unknown>()

function ouvrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const requete = indexedDB.open(BASE, 1)
      requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN)
      requete.onsuccess = () => resolve(requete.result)
      requete.onerror = () => resolve(null)
      requete.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

let base: Promise<IDBDatabase | null> | null = null
const obtenirBase = () => (base ??= ouvrir())

/** Lit la file d'un périmètre ; `null` si aucune. */
export async function lireFile<T>(cle: string): Promise<T | null> {
  const db = await obtenirBase()
  if (!db) return (memoire.get(cle) as T | undefined) ?? null
  return new Promise((resolve) => {
    try {
      const requete = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(cle)
      requete.onsuccess = () => resolve((requete.result as T | undefined) ?? null)
      requete.onerror = () => resolve((memoire.get(cle) as T | undefined) ?? null)
    } catch {
      resolve((memoire.get(cle) as T | undefined) ?? null)
    }
  })
}

/** Écrit (remplace) la file d'un périmètre. */
export async function ecrireFile<T>(cle: string, file: T): Promise<void> {
  memoire.set(cle, file)
  const db = await obtenirBase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(MAGASIN, 'readwrite')
      tx.objectStore(MAGASIN).put(file, cle)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
