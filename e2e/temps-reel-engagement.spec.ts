import type { Page, Request } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeCoach, seConnecter } from './helpers/auth'
import { CLUB_A, EQUIPES, GRIMPEURS, MDP, POOL_LIBRES, RENCONTRE_PILOTE } from './helpers/donnees'
import { execSql, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 22 — CT-16 à CT-19 : temps réel de l'écran d'engagement du coach
 * (spec #11 R1/R3/R5/R7, rév. 2026-10-09 — TODO D6). Les écritures « admin »
 * sont posées en SQL : seul compte l'évènement diffusé à l'écran du coach.
 *
 * Série + un seul worker : mute l'engagement de la rencontre pilote.
 */

const URL_ENGAGEMENT = `/coach/rencontres/${RENCONTRE_PILOTE}`
const COACH_B = { email: 'coachb@test.local', mdp: MDP }
const EQUIPE_LIVE = 'f0000000-0000-0000-0000-0000000000f1'

/** Ouvre l'écran d'engagement et attend l'abonnement temps réel. */
async function ouvrirEngagement(page: Page): Promise<void> {
  await page.goto(URL_ENGAGEMENT)
  await expect(page.getByText('En direct', { exact: true })).toBeVisible({ timeout: 15_000 })
}

/** Libellés proposés dans les listes « grimpeur à affecter » de l'écran. */
const optionsRoster = (page: Page) =>
  page.locator('select[name="grimpeurId"] option').allInnerTexts()

/** Relecture RSC de l'écran d'engagement (`router.refresh()` = GET `?_rsc=`). */
const estRelectureEngagement = (r: Request) =>
  r.method() === 'GET' && r.url().includes(URL_ENGAGEMENT) && r.url().includes('_rsc=')

test.describe('Cahier 22 — temps réel de l’engagement coach (spec #11 rév. 2026-10-09)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(() => {
    reinitialiserEngagement()
    poserPhase('pre_competition')
  })

  test.afterAll(() => {
    reinitialiserEngagement()
    poserPhase('pre_competition')
  })

  test('CT-16 · prêt créé puis révoqué par l’admin → liste à jour sans rechargement (R1/R3)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirEngagement(page)
    expect((await optionsRoster(page)).some((o) => o.includes('Devi Bravo'))).toBe(false)

    execSql(
      `insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id)
       values ('${RENCONTRE_PILOTE}', '${GRIMPEURS.devi}', '${CLUB_A}');`,
    )
    await expect
      .poll(async () => (await optionsRoster(page)).some((o) => o.includes('Devi Bravo')), {
        timeout: 10_000,
      })
      .toBe(true)

    execSql(
      `delete from interclub.pret
       where rencontre_id = '${RENCONTRE_PILOTE}' and grimpeur_id = '${GRIMPEURS.devi}';`,
    )
    await expect
      .poll(async () => (await optionsRoster(page)).some((o) => o.includes('Devi Bravo')), {
        timeout: 10_000,
      })
      .toBe(false)
  })

  test('CT-17 · équipe et composition modifiées par l’admin → écran à jour (R1/R3)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirEngagement(page)

    execSql(
      `insert into interclub.equipe (id, rencontre_id, club_id, nom)
       values ('${EQUIPE_LIVE}', '${RENCONTRE_PILOTE}', '${CLUB_A}', 'Équipe Live');`,
    )
    await expect(page.getByText('Équipe Live')).toBeVisible({ timeout: 10_000 })

    const emma = POOL_LIBRES[2]
    execSql(
      `insert into interclub.composition (equipe_id, grimpeur_id)
       values ('${EQUIPES.A2}', '${emma.id}');`,
    )
    // Emma, affectée à A2, n'est plus proposée à l'affectation.
    await expect
      .poll(async () => (await optionsRoster(page)).some((o) => o.includes(emma.label)), {
        timeout: 10_000,
      })
      .toBe(false)
  })

  test('CT-18 · un prêt à un autre club ne relit pas l’écran (RLS, R5)', async ({ browser }) => {
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await seConnecter(b, COACH_B)
    await ouvrirEngagement(b)

    const relectures: Request[] = []
    b.on('request', (r) => {
      if (estRelectureEngagement(r)) relectures.push(r)
    })

    // Prêt de Devi (Club B) au Club A : invisible pour le coach B (pret_select).
    execSql(
      `insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id)
       values ('${RENCONTRE_PILOTE}', '${GRIMPEURS.devi}', '${CLUB_A}');`,
    )
    await b.waitForTimeout(2_000)
    expect(relectures).toHaveLength(0)

    await ctxB.close()
  })

  test('CT-19 · composition figée (③) → pas de canal ni d’indicateur (R7)', async ({ page }) => {
    poserPhase('competition')
    await commeCoach(page)
    await page.goto(URL_ENGAGEMENT)
    await expect(page.getByText('Saisir / voir les résultats →')).toBeVisible()
    await expect(page.getByText('En direct', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Connexion…', { exact: true })).toHaveCount(0)
  })
})
