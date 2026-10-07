import type { Locator, Page, Request } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeCoach, seConnecter } from './helpers/auth'
import { MDP, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 22 — CT-14 : écho de ses propres saisies ignoré sur les écrans de
 * saisie (spec #11 R6bis). L'écrivain ne relance pas de relecture à la
 * réception de son propre évènement ; un autre compte du même club, si.
 *
 * Série + un seul worker : mute la phase et les résultats de la rencontre pilote.
 */

const URL_SAISIE = `/coach/rencontres/${RENCONTRE_PILOTE}/resultats`
const COACH_A2 = { email: 'coach2@test.local', mdp: MDP }

function purgerResultatsPilote(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');`,
  )
}

async function ouvrirBob(page: Page): Promise<void> {
  await page.goto(URL_SAISIE)
  await page.getByRole('button', { name: /^Bob Alpha/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
  await expect(page.getByText('En direct', { exact: true })).toBeVisible({ timeout: 15_000 })
}

function ligneVoie(page: Page, code: string): Locator {
  return page
    .locator('div.rounded-2xl', {
      has: page.getByRole('heading', { name: 'Voie de difficulté', exact: true }),
    })
    .locator('li')
    .filter({ has: page.locator('span.min-w-9', { hasText: new RegExp(`^${code}$`) }) })
}

/** Relecture RSC de l'écran de saisie (`router.refresh()` = GET `?_rsc=`). */
const estRelectureSaisie = (r: Request) =>
  r.method() === 'GET' && r.url().includes('/resultats') && r.url().includes('_rsc=')

test.describe('Cahier 22 — écho de ses propres saisies (spec #11 R6bis)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerResultatsPilote()
    poserPhase('competition')
    poserDate('today')
  })

  test.afterAll(() => {
    purgerResultatsPilote()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-14 · l’écrivain ne se relit pas sur son écho ; l’autre compte, si', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext()
    const ctxA2 = await browser.newContext()
    const a = await ctxA.newPage()
    const a2 = await ctxA2.newPage()
    await commeCoach(a)
    await seConnecter(a2, COACH_A2)
    await ouvrirBob(a)
    await ouvrirBob(a2)

    const relecturesA: Request[] = []
    a.on('request', (r) => {
      if (estRelectureSaisie(r)) relecturesA.push(r)
    })

    await ligneVoie(a, 'T1').getByRole('button', { name: 'Échec' }).click()
    await expect(ligneVoie(a, 'T1').locator('span.rounded-full')).toHaveText('Échec')

    // L'autre compte reçoit le live (R2)…
    await expect(ligneVoie(a2, 'T1').locator('span.rounded-full')).toHaveText('Échec', {
      timeout: 10_000,
    })
    // …l'écrivain, lui, n'a relancé aucune relecture sur son propre écho (R6bis).
    await a.waitForTimeout(1_500)
    expect(relecturesA).toHaveLength(0)

    await ctxA.close()
    await ctxA2.close()
  })
})
