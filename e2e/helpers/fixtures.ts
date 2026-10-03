import { test as base, type BrowserContext, type Page } from '@playwright/test'

export { expect } from '@playwright/test'

// Filet transverse : TOUT test E2E échoue si une page lève une erreur non
// interceptée (`pageerror`). Une page d'erreur Next (ex. RPC Supabase en échec,
// PGRST203 du 2026-10-03) ne fait sinon échouer que les tests qui regardent
// précisément ce qui manque — un test « pas de débordement horizontal » passait
// sur une page plantée.
//
// Couvre le contexte par défaut ET ceux ouverts via `browser.newContext()`
// (multi-acteurs, téléphone), nombreux dans la suite.

function surveiller(context: BrowserContext, erreurs: string[]): void {
  const brancher = (page: Page) =>
    page.on('pageerror', (e) => erreurs.push(`${page.url()} — ${e.message}`))
  context.pages().forEach(brancher)
  context.on('page', brancher)
}

export const test = base.extend<{ sansErreurDePage: void }>({
  sansErreurDePage: [
    async ({ context, browser }, utiliser) => {
      const erreurs: string[] = []
      surveiller(context, erreurs)

      const newContextOrigine = browser.newContext.bind(browser)
      browser.newContext = async (...args) => {
        const ctx = await newContextOrigine(...args)
        surveiller(ctx, erreurs)
        return ctx
      }

      try {
        await utiliser()
      } finally {
        browser.newContext = newContextOrigine
      }

      if (erreurs.length > 0) {
        throw new Error(`Erreur(s) non interceptée(s) dans la page :\n${erreurs.join('\n')}`)
      }
    },
    { auto: true },
  ],
})
