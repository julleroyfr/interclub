// PROVISOIRE — mesure des temps serveur (diagnostic de performance, branche
// feature/perf-tableau-de-bord-admin). Écrit « [perf] <nom> <durée> ms » dans les
// logs de la fonction (Netlify > Logs > Functions). À retirer avant la fusion.

/** Mesure la durée d'une opération asynchrone et la journalise. */
export async function mesurer<T>(nom: string, operation: () => PromiseLike<T>): Promise<T> {
  const debut = performance.now()
  try {
    return await operation()
  } finally {
    console.info(`[perf] ${nom} ${Math.round(performance.now() - debut)} ms`)
  }
}
