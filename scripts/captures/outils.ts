import type { Locator, Page } from '@playwright/test'

// Outils partagés des scripts de captures des guides utilisateur (docs/guides/).

/** Format « ordinateur » des captures (admin, juge). */
export const ORDINATEUR = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1.5,
  isMobile: false,
  hasTouch: false,
} as const

/** Masque l'indicateur de dev Next.js (bouton « N ») sur toutes les pages. */
export async function masquerOutilsDev(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.head.appendChild(style)
    })
  })
}

/**
 * Entoure chaque cible et lui accole un numéro (1, 2, …) repris dans le guide.
 * Les repères sont posés en coordonnées de document : ils restent en place sur
 * une capture pleine page.
 */
export async function numeroter(page: Page, cibles: Locator[]): Promise<void> {
  await effacerReperes(page)
  for (const [i, cible] of cibles.entries()) {
    await cible.evaluate((el, numero) => {
      const r = el.getBoundingClientRect()
      const x = r.left + window.scrollX
      const y = r.top + window.scrollY
      const cadre = document.createElement('div')
      cadre.dataset.repere = ''
      Object.assign(cadre.style, {
        position: 'absolute', left: `${x - 4}px`, top: `${y - 4}px`,
        width: `${r.width + 8}px`, height: `${r.height + 8}px`,
        border: '3px solid #ff3d7f', borderRadius: '12px',
        pointerEvents: 'none', zIndex: '9998',
      })
      const pastille = document.createElement('div')
      pastille.dataset.repere = ''
      pastille.textContent = String(numero)
      Object.assign(pastille.style, {
        position: 'absolute', left: `${Math.max(2, x - 14)}px`, top: `${Math.max(2, y - 14)}px`,
        width: '24px', height: '24px', borderRadius: '50%',
        background: '#ff3d7f', color: '#fff', font: 'bold 14px/24px sans-serif',
        textAlign: 'center', boxShadow: '0 0 0 2px #fff',
        pointerEvents: 'none', zIndex: '9999',
      })
      document.body.append(cadre, pastille)
    }, i + 1)
  }
}

export async function effacerReperes(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('[data-repere]').forEach((n) => n.remove()))
}

/** Capture pleine page (par défaut) ou de la seule fenêtre visible. */
export async function capturer(
  page: Page,
  chemin: string,
  options: { pleinePage?: boolean } = {},
): Promise<void> {
  await page.screenshot({ path: chemin, fullPage: options.pleinePage ?? true })
}

/** Capture recadrée sur un bloc de la page (repères compris, marge de 16 px). */
export async function capturerBloc(page: Page, bloc: Locator, chemin: string): Promise<void> {
  const b = await bloc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
  })
  const marge = 16
  const largeur = page.viewportSize()!.width
  const x = Math.max(0, b.x - marge)
  await page.screenshot({
    path: chemin,
    fullPage: true,
    clip: { x, y: Math.max(0, b.y - marge), width: Math.min(largeur - x, b.width + 2 * marge), height: b.height + 2 * marge },
  })
}
