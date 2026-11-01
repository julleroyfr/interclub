import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { execSql } from '../../e2e/helpers/sql'

import { capturer as capturerVers, masquerOutilsDev, numeroter } from './outils'

/**
 * Captures d'écran du guide capitaine (docs/guides/capitaine/), au format
 * téléphone. La rencontre adulte de démonstration (seed opt-in 05, portée par le
 * Club B, datée du jour, en ③) est chargée au début et supprimée à la fin.
 *
 * Lancer : `npm run doc:captures`.
 */

const DOSSIER = 'docs/guides/capitaine/captures'
const capturer = (page: Page, nom: string, options?: { pleinePage?: boolean }) =>
  capturerVers(page, `${DOSSIER}/${nom}.png`, options)

const DEMO = `categorie = 'adulte' and club_porteur_id = '22222222-2222-2222-2222-222222222222'`

function chargerDemo(): void {
  execSql(readFileSync('supabase/seed/05-demo-adulte.sql', 'utf8'))
}

function supprimerDemo(): void {
  execSql(`delete from interclub.rencontre where ${DEMO};`)
}

const idDemo = () => execSql(`select id from interclub.rencontre where ${DEMO};`)

const jetonEquipe1 = () =>
  execSql(
    `select j.valeur from interclub.jeton_qr j join interclub.equipe e on e.id = j.equipe_id
     where j.rencontre_id = '${idDemo()}' and e.nom = 'Équipe 1' and j.actif;`,
  )

function phaseDemo(phase: string): void {
  execSql(`update interclub.rencontre set phase = '${phase}' where id = '${idDemo()}';`)
}

async function scanner(page: Page): Promise<void> {
  await page.goto(`/scan?jeton=${jetonEquipe1()}`)
  await page.waitForURL('**/capitaine')
  await expect(page.getByText(/capitaine de « Équipe 1 »/)).toBeVisible()
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(chargerDemo)
test.afterAll(supprimerDemo)
test.beforeEach(({ page }) => masquerOutilsDev(page))

test('01 — QR scanné avant la compétition', async ({ page }) => {
  phaseDemo('preparation')
  await page.goto(`/scan?jeton=${jetonEquipe1()}`)
  await expect(page.getByText(/pas encore ouvert/)).toBeVisible()
  await capturer(page, '01-scan-refuse', { pleinePage: false })
  phaseDemo('competition')
})

test('02 — son équipe', async ({ page }) => {
  await scanner(page)
  await numeroter(page, [
    page.getByRole('link', { name: 'Voir le classement →' }),
    page.getByRole('button', { name: /^Echo Lucie/ }),
    page.getByRole('button', { name: /Menu/ }),
    page.getByRole('button', { name: /Terminer/ }),
  ])
  await capturer(page, '02-equipe')
})

test('03 — saisie d’un grimpeur', async ({ page }) => {
  await scanner(page)
  await page.getByRole('button', { name: /^Echo Lucie/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
  const t4 = page.locator('li').filter({ hasText: 'T4' }).first()
  await numeroter(page, [
    page.getByRole('button', { name: '← Liste des grimpeurs' }),
    page.getByRole('button', { name: 'Grimpeur précédent' }),
    page.getByRole('button', { name: 'Grimpeur suivant' }),
    t4.getByRole('button', { name: 'Top en moulinette' }),
    page.getByRole('combobox').first(),
    page.getByRole('button', { name: 'Bloc complet' }).first(),
  ])
  await capturer(page, '03-grimpeur')
})

test('04 — classement', async ({ page }) => {
  await scanner(page)
  await page.getByRole('link', { name: 'Voir le classement →' }).click()
  await expect(page.getByRole('heading', { name: 'Classement' })).toBeVisible()
  await numeroter(page, [
    page.getByRole('button', { name: 'Individuel' }),
    page.getByRole('button', { name: 'Par équipe' }),
    page.getByRole('button', { name: 'Femmes' }),
  ])
  await capturer(page, '04-classement', { pleinePage: false })
})
