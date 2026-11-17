import type { Locator, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { GRIMPEURS, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 17 CT-20…CT-23 et cahier 19 CT-11 — niveau doublé en enfant (spec #6
 * R9bis, R21 ; spec #9 R7). Rencontre pilote (enfant, ③) : le niveau T2 est
 * doublé (« T2 Rouge », ordre 6 ; « T2 Noire », ordre 15). Bob (groupe T1 →
 * T1·T2·T3) : choix de la voie, saisie sur la variante, présélection, remplacement
 * annoncé puis effectif, même sélecteur côté admin. La garde en base (hors groupe,
 * saisie plus récente, écriture directe) est couverte par `npm run test:voies-doublees`.
 *
 * Série + un seul worker : mute la structure et les résultats de la rencontre pilote.
 */

const URL_COACH = `/coach/rencontres/${RENCONTRE_PILOTE}/resultats`
const URL_ADMIN = `/admin/rencontres/${RENCONTRE_PILOTE}/resultats`
const EPREUVE_VOIE = '88888888-8888-8888-8888-888888888801'
const T2_ROUGE = '99999999-9999-9999-9999-999999999921'
const T2_NOIRE = '99999999-9999-9999-9999-99999999992b'

function purgerResultats(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');`,
  )
}

/** Voies de Bob au niveau T2 : « repère:issue » triés, '' si aucune. */
function resultatsT2Bob(): string {
  return execSql(
    `select coalesce(string_agg(v.repere || ':' || r.issue, ',' order by v.ordre), '')
       from interclub.resultat_voie r join interclub.voie_difficulte v on v.id = r.voie_difficulte_id
      where r.grimpeur_id = '${GRIMPEURS.bob}' and v.niveau = 'T2';`,
  )
}

/** Ligne de voie repérée par le niveau ou le libellé affiché en tête. */
function ligne(page: Page, code: string): Locator {
  return page
    .locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Voie de difficulté', exact: true }) })
    .locator('li')
    .filter({ has: page.locator('span.min-w-9', { hasText: new RegExp(`^${code}$`) }) })
}

const selecteur = (l: Locator) => l.getByRole('combobox', { name: 'Voie grimpée au niveau T2' })

async function ouvrirBob(page: Page): Promise<void> {
  await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
  await page.goto(URL_COACH)
  await page.getByRole('button', { name: /^Bob Alpha/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
}

test.describe('Niveau doublé en enfant — choix de la voie (spec #6 R9bis)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerResultats()
    nettoyerSessionsQr()
    poserPhase('competition')
    poserDate('today')
    execSql(
      `update interclub.voie_difficulte set repere = 'Rouge' where id = '${T2_ROUGE}';
       insert into interclub.voie_difficulte
         (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_prise_valorisee, repere)
       values ('${T2_NOIRE}', '${EPREUVE_VOIE}', 'T2', 'tete', '5b', 15, 9, 5, 'Noire')
       on conflict (id) do nothing;`,
    )
  })

  test.afterEach(async ({ page }) => {
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
  })

  test.afterAll(() => {
    purgerResultats()
    execSql(
      `delete from interclub.voie_difficulte where id = '${T2_NOIRE}';
       update interclub.voie_difficulte set repere = null where id = '${T2_ROUGE}';`,
    )
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-20 · une ligne par niveau, choix sur le niveau doublé, plus petit ordre présélectionné (R9bis a/b)', async ({
    page,
  }) => {
    await commeCoach(page)
    await ouvrirBob(page)
    const t2 = ligne(page, 'T2')
    await expect(selecteur(t2)).toHaveValue(T2_ROUGE)
    await expect(selecteur(t2).locator('option')).toHaveText(['Rouge', 'Noire'])
    // Niveaux simples : pas de sélecteur.
    await expect(ligne(page, 'T1').getByRole('combobox')).toHaveCount(0)
    await expect(ligne(page, 'T3').getByRole('combobox')).toHaveCount(0)
  })

  test('CT-21 · Top sur la voie choisie : enregistré sur T2 Noire, présélectionnée ensuite (R9bis b/c, R21)', async ({
    page,
  }) => {
    await commeCoach(page)
    await ouvrirBob(page)
    const t2 = ligne(page, 'T2')
    await selecteur(t2).selectOption(T2_NOIRE)
    // Changer de voie n'écrit rien (R21).
    expect(resultatsT2Bob()).toBe('')
    await t2.getByRole('button', { name: 'Top', exact: true }).click()
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
    expect(resultatsT2Bob()).toBe('Noire:top')

    await ouvrirBob(page)
    await expect(selecteur(ligne(page, 'T2'))).toHaveValue(T2_NOIRE)
    await expect(ligne(page, 'T2').locator('span.rounded-full')).toHaveText('Top')
  })

  test('CT-22 · autre voie du niveau : remplacement annoncé puis effectif (R9bis d)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirBob(page)
    const t2 = ligne(page, 'T2')
    await selecteur(t2).selectOption(T2_ROUGE)
    await expect(t2.getByText('Remplacera le résultat de T2 Noire (Top).')).toBeVisible()
    await t2.getByRole('button', { name: 'Échec', exact: true }).click()
    await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
    expect(resultatsT2Bob()).toBe('Rouge:echec')
    await expect(ligne(page, 'T2').getByText(/Remplacera/)).toHaveCount(0)
  })

  test('CT-23 · revenir sur la voie courante sans saisir : rien ne change (R21)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirBob(page)
    const t2 = ligne(page, 'T2')
    await selecteur(t2).selectOption(T2_NOIRE)
    await expect(t2.getByText(/Remplacera le résultat de T2 Rouge/)).toBeVisible()
    await selecteur(t2).selectOption(T2_ROUGE)
    await expect(t2.getByText(/Remplacera/)).toHaveCount(0)
    expect(resultatsT2Bob()).toBe('Rouge:echec')
  })

  test('cahier 19 CT-11 · admin : même sélecteur, remplacement (spec #9 R7)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await page.locator('li > button').filter({ hasText: 'Bob Alpha' }).click()
    const t2 = ligne(page, 'T2')
    await expect(selecteur(t2)).toHaveValue(T2_ROUGE)
    await selecteur(t2).selectOption(T2_NOIRE)
    await expect(t2.getByText('Remplacera le résultat de T2 Rouge (Échec).')).toBeVisible()
    await t2.getByRole('button', { name: 'Top', exact: true }).click()
    await expect.poll(resultatsT2Bob).toBe('Noire:top')
  })
})
