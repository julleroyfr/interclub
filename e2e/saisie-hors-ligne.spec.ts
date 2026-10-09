import type { Locator, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeCoach } from './helpers/auth'
import { GRIMPEURS, JETON, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import {
  execSql,
  nettoyerSessionsQr,
  poserDate,
  poserPhase,
  reinitialiserEngagement,
} from './helpers/sql'

/**
 * Cahier 29 — saisie hors ligne, lot 2 (spec #17) : file d'attente conservée sur
 * l'appareil (R12), synchronisation au retour du réseau (R15/R16), conservation
 * au rechargement avec confirmation de sortie (R28), rejet d'une saisie plus
 * ancienne qu'une correction (R9/R18/R26), bandeau (R24).
 *
 * Série + un seul worker : mute la phase et les résultats de la rencontre pilote.
 */

const URL_SAISIE = `/coach/rencontres/${RENCONTRE_PILOTE}/resultats`
const VOIE_T1 = '99999999-9999-9999-9999-999999999901'
const VOIE_T2 = '99999999-9999-9999-9999-999999999921'

function purgerResultatsPilote(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');
     delete from interclub.temps_vitesse where epreuve_id in (
       select id from interclub.epreuve where rencontre_id = '${RENCONTRE_PILOTE}');`,
  )
}

const issueEnBase = (voie: string, grimpeur: string) =>
  execSql(
    `select coalesce((select issue from interclub.resultat_voie
       where voie_difficulte_id = '${voie}' and grimpeur_id = '${grimpeur}'), '(aucun)')`,
  )

async function ouvrirBob(page: Page): Promise<void> {
  await page.goto(URL_SAISIE)
  await page.getByRole('button', { name: /^Bob Alpha/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
}

function ligneVoie(page: Page, code: string): Locator {
  return page
    .locator('div.rounded-2xl', {
      has: page.getByRole('heading', { name: 'Voie de difficulté', exact: true }),
    })
    .locator('li')
    .filter({ has: page.locator('span.min-w-9', { hasText: new RegExp(`^${code}$`) }) })
}

const pastille = (l: Locator) => l.locator('span.rounded-full')

test.describe('Cahier 29 — saisie hors ligne, lot 2 (spec #17)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerResultatsPilote()
    nettoyerSessionsQr()
    poserPhase('competition')
    poserDate('today')
  })

  test.afterAll(() => {
    purgerResultatsPilote()
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-07 · hors ligne : saisie conservée, envoyée au retour du réseau (R12, R15, R24)', async ({
    page,
    context,
  }) => {
    purgerResultatsPilote()
    await commeCoach(page)
    await ouvrirBob(page)

    await context.setOffline(true)
    await ligneVoie(page, 'T1').getByRole('button', { name: 'Top' }).click()
    await ligneVoie(page, 'T2').getByRole('button', { name: 'Échec' }).click()

    await expect(pastille(ligneVoie(page, 'T1'))).toHaveText('Top')
    await expect(page.getByText('⏳ En attente')).toHaveCount(2)
    await expect(page.getByRole('status')).toContainText('Hors ligne · 2 saisies en attente')
    expect(issueEnBase(VOIE_T1, GRIMPEURS.bob)).toBe('(aucun)')

    await context.setOffline(false)
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 15_000 })
    expect(issueEnBase(VOIE_T1, GRIMPEURS.bob)).toBe('top')
    expect(issueEnBase(VOIE_T2, GRIMPEURS.bob)).toBe('echec')
    await expect(page.getByText(/saisies? en attente/)).toHaveCount(0)
  })

  test('CT-08 · rechargement : la saisie en attente est conservée et repart (R12, R28)', async ({
    page,
  }) => {
    purgerResultatsPilote()
    await commeCoach(page)
    await ouvrirBob(page)

    // Serveur injoignable pour les envois (échec temporaire, R17).
    await page.route('**/coach/rencontres/**/resultats', (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    )
    await ligneVoie(page, 'T1').getByRole('button', { name: 'Échec' }).click()
    await expect(page.getByText('⏳ En attente')).toHaveCount(1)

    // Quitter avec une saisie en attente : le navigateur demande confirmation (R28).
    let confirmationDemandee = false
    page.on('dialog', (d) => {
      if (d.type() === 'beforeunload') confirmationDemandee = true
      void d.accept()
    })
    await page.reload()
    expect(confirmationDemandee).toBe(true)

    // Après rechargement, la saisie est toujours là (stockage de l'appareil).
    await page.getByRole('button', { name: /^Bob Alpha/ }).click()
    await expect(pastille(ligneVoie(page, 'T1'))).toHaveText('Échec')
    await expect(page.getByText('⏳ En attente')).toHaveCount(1)
    expect(issueEnBase(VOIE_T1, GRIMPEURS.bob)).toBe('(aucun)')

    // Serveur de nouveau joignable : la file repart (retour du réseau, R15).
    await page.unroute('**/coach/rencontres/**/resultats')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 15_000 })
    expect(issueEnBase(VOIE_T1, GRIMPEURS.bob)).toBe('echec')
  })

  test('CT-09 · correction plus récente : la saisie hors ligne est rejetée (R9, R18, R26)', async ({
    page,
    context,
  }) => {
    purgerResultatsPilote()
    await commeCoach(page)
    await ouvrirBob(page)

    await context.setOffline(true)
    await ligneVoie(page, 'T1').getByRole('button', { name: 'Échec' }).click()
    await expect(page.getByText('⏳ En attente')).toHaveCount(1)

    // Pendant la coupure, une correction plus récente est enregistrée (ex. admin).
    await page.waitForTimeout(1_100)
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${VOIE_T1}', '${GRIMPEURS.bob}', 'top');`,
    )

    await context.setOffline(false)
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 15_000 })
    // Refus définitif : la base garde la correction, l'écran signale le rejet.
    expect(issueEnBase(VOIE_T1, GRIMPEURS.bob)).toBe('top')
    await expect(ligneVoie(page, 'T1').getByText('⚠ Rejetée')).toBeVisible()
    await expect(ligneVoie(page, 'T1')).toContainText('Une saisie plus récente existe déjà.')

    // Liste des saisies non envoyées : motif, puis retrait de la liste.
    await page.getByRole('button', { name: 'Voir' }).click()
    const liste = page.getByRole('region', { name: 'Saisies non envoyées' })
    await expect(liste).toContainText('Bob Alpha')
    await expect(liste).toContainText('Voie T1')
    await expect(liste).toContainText('Une saisie plus récente existe déjà.')
    await liste.getByRole('button', { name: 'Retirer de la liste' }).click()
    await expect(liste).toContainText('Aucune saisie.')
  })

  test('CT-15 · en ligne : ni bandeau ni mention pour un envoi court, au-delà de 2 s oui (R23, R24)', async ({
    page,
  }) => {
    purgerResultatsPilote()
    await commeCoach(page)
    await ouvrirBob(page)
    const bandeau = page.getByText(/Envoi en cours/)
    const mentions = page.getByText(/⏳ En attente|✓ Enregistré/)

    // Envoi normal : ni bandeau (R24) ni mention sur la ligne (R23).
    const vus: string[] = []
    const guetter = (l: typeof bandeau, nom: string) =>
      l.first().waitFor({ state: 'visible', timeout: 4_000 }).then(
        () => vus.push(nom),
        () => undefined,
      )
    const guetteurs = Promise.all([guetter(bandeau, 'bandeau'), guetter(mentions, 'mention')])
    await ligneVoie(page, 'T1').getByRole('button', { name: 'Top' }).click()
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
    await guetteurs
    expect(vus).toEqual([])

    // Envoi ralenti (3,5 s) : le bandeau apparaît après 2 s, puis disparaît.
    await page.route('**/coach/rencontres/**/resultats', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 3_500))
      await route.continue()
    })
    const debut = Date.now()
    await ligneVoie(page, 'T2').getByRole('button', { name: 'Échec' }).click()
    await expect(bandeau).toBeVisible({ timeout: 5_000 })
    expect(Date.now() - debut).toBeGreaterThanOrEqual(1_900)
    await expect(ligneVoie(page, 'T2').getByText('⏳ En attente')).toBeVisible()
    await expect(ligneVoie(page, 'T2').getByText('✓ Enregistré')).toBeVisible({ timeout: 10_000 })
    await expect(bandeau).toHaveCount(0)
    await page.unroute('**/coach/rencontres/**/resultats')
  })

  test('CT-10 · juge hors ligne : résultat conservé puis envoyé (R12, R15, spec #10 R14bis)', async ({
    page,
    context,
  }) => {
    purgerResultatsPilote()
    nettoyerSessionsQr()
    await page.goto(`/scan?jeton=${JETON.juge}`)
    await expect(page).toHaveURL(/\/juge/)

    await context.setOffline(true)
    const ligne = page.locator('li', { hasText: 'Alpha Bob' })
    await page.getByLabel('Temps de Alpha Bob').fill('8,5')
    await page.getByLabel('Temps de Alpha Bob').press('Enter')
    await expect(ligne.locator('span.rounded-full')).toHaveText('8,500 s')
    await expect(ligne.getByText('⏳ En attente')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Hors ligne · 1 saisie en attente')

    await context.setOffline(false)
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 15_000 })
    expect(
      execSql(
        `select issue || '|' || temps from interclub.temps_vitesse where grimpeur_id = '${GRIMPEURS.bob}'`,
      ),
    ).toBe('temps|8.500')
  })
})
