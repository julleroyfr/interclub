import { devices, expect, test, type Page } from '@playwright/test'

import { JETON, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from '../../e2e/helpers/donnees'
import {
  execSql,
  nettoyerSessionsQr,
  poserDate,
  poserPhase,
  reinitialiserEngagement,
} from '../../e2e/helpers/sql'

import {
  ORDINATEUR,
  capturer as capturerVers,
  capturerBloc,
  masquerOutilsDev,
  numeroter,
} from './outils'

/**
 * Captures d'écran du guide juge de vitesse (docs/guides/juge/). La rencontre
 * pilote est passée en ③ compétition « aujourd'hui » le temps du parcours, puis
 * remise à l'état seed (phase, date, sessions QR, temps de vitesse effacés).
 *
 * Lancer : `npm run doc:captures`.
 */

const DOSSIER = 'docs/guides/juge/captures'
const capturer = (page: Page, nom: string, options?: { pleinePage?: boolean }) =>
  capturerVers(page, `${DOSSIER}/${nom}.png`, options)

function purgerTempsVitesse(): void {
  execSql(
    `delete from interclub.temps_vitesse where epreuve_id in (
       select id from interclub.epreuve where rencontre_id = '${RENCONTRE_PILOTE}');`,
  )
}

function etatSeed(): void {
  purgerTempsVitesse()
  reinitialiserEngagement()
  poserPhase('pre_competition')
  poserDate(RENCONTRE_PILOTE_DATE)
  nettoyerSessionsQr()
}

function ouvrirCompetition(): void {
  reinitialiserEngagement()
  purgerTempsVitesse()
  poserPhase('competition')
  poserDate('today')
  nettoyerSessionsQr()
}

async function scannerJuge(page: Page): Promise<void> {
  await page.goto(`/scan?jeton=${JETON.juge}`)
  await page.waitForURL('**/juge**')
  await expect(page.getByPlaceholder(/Rechercher un grimpeur/)).toBeVisible()
}

const ligne = (page: Page, nom: string) => page.locator('li').filter({ hasText: nom })

test.describe.configure({ mode: 'serial' })
// Fenêtre basse : la capture pleine page s'arrête au contenu (peu de grimpeurs au seed).
test.use({ ...ORDINATEUR, viewport: { width: 1280, height: 440 } })
test.beforeAll(etatSeed)
test.afterAll(etatSeed)
test.beforeEach(({ page }) => masquerOutilsDev(page))

test('01 — QR scanné hors compétition', async ({ page }) => {
  etatSeed()
  await page.goto(`/scan?jeton=${JETON.juge}`)
  await expect(page.getByText(/pas encore ouvert/)).toBeVisible()
  const carte = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Ouverture de session' }) })
    .filter({ hasText: 'Scannez à nouveau' })
    .last()
  await capturerBloc(page, carte, `${DOSSIER}/01-scan-refuse.png`)
})

test('02 — écran de saisie', async ({ page }) => {
  ouvrirCompetition()
  await scannerJuge(page)
  const ana = ligne(page, 'Alpha Ana')
  await numeroter(page, [
    page.getByPlaceholder(/Rechercher un grimpeur/),
    page.getByRole('button', { name: /À saisir/ }),
    page.getByRole('button', { name: 'Tous' }),
    ana.getByRole('textbox'),
    ana.getByRole('button', { name: 'OK' }),
    ana.getByRole('button', { name: 'Chute' }),
    ana.getByRole('button', { name: 'Abs.' }),
    page.getByRole('button', { name: 'Terminer' }),
  ])
  await capturer(page, '02-saisie')
})

test('03 — résultats saisis', async ({ page }) => {
  ouvrirCompetition()
  await scannerJuge(page)
  await ligne(page, 'Alpha Ana').getByRole('textbox').fill('8,123')
  await ligne(page, 'Alpha Ana').getByRole('textbox').press('Enter')
  await ligne(page, 'Bravo Cléo').getByRole('button', { name: 'Chute' }).click()
  await ligne(page, 'Alpha Bob').getByRole('button', { name: 'Abs.' }).click()
  await expect(ligne(page, 'Alpha Ana')).toContainText('8,123')
  await expect(page.getByRole('button', { name: /À saisir \(0\)/ })).toBeVisible()
  await capturer(page, '03-resultats-saisis')
})

test.describe('sur téléphone', () => {
  // Sans defaultBrowserType : il imposerait un nouveau worker.
  const { defaultBrowserType, ...telephone } = devices['Pixel 7']
  void defaultBrowserType
  test.use(telephone)

  test('04 — écran de saisie sur téléphone', async ({ page }) => {
    ouvrirCompetition()
    await scannerJuge(page)
    await capturer(page, '04-telephone', { pleinePage: false })
  })
})
