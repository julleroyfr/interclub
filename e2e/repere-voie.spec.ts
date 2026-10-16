import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Cahier 12 CT-18 — repère et libellé d'une voie de difficulté (spec #3
 * R49/R50, spec #6 R21). Rencontre ADO du seed (③ compétition) : deux voies T5
 * (ordres 5 et 15). L'admin pose un repère sur la seconde ; le coach voit les
 * deux T5 distinguées dans le choix de la voie. Unicité par niveau (R49c) et
 * gel à la clôture (R49d) vérifiés au passage.
 *
 * Série : mute les repères et la phase de la rencontre ado.
 */

const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const URL_ADMIN = `/admin/rencontres/${ADO}`
const URL_COACH = `/coach/rencontres/${ADO}/resultats`

/** Libellé d'une voie dans la liste de la structure (onglet Voies). */
const libelle = (page: Page, texte: string) =>
  page.locator('li > span.min-w-10', { hasText: new RegExp(`^${texte}$`) })

function effacerReperes(): void {
  execSql(
    `update interclub.voie_difficulte set repere = null
      where epreuve_id in (select id from interclub.epreuve where rencontre_id = '${ADO}');`,
  )
}

function poserPhaseAdo(phase: 'competition' | 'cloture'): void {
  execSql(`update interclub.rencontre set phase = '${phase}' where id = '${ADO}';`)
}

test.describe('Repère et libellé des voies (spec #3 R49/R50)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    effacerReperes()
    poserPhaseAdo('competition')
  })

  test.afterAll(() => {
    effacerReperes()
    poserPhaseAdo('competition')
  })

  test('sans repère, les deux T5 portent une lettre selon l’ordre (R50b)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await expect(libelle(page, 'T5 a')).toBeVisible()
    await expect(libelle(page, 'T5 b')).toBeVisible()
    // Niveau unique → niveau seul (R50c).
    await expect(libelle(page, 'T6')).toBeVisible()
  })

  test('en compétition, l’admin pose un repère ; la lettre de l’autre T5 ne bouge pas (R49d, R50a/b)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    const champ = page.getByLabel('Repère de la voie T5 b')
    await champ.fill('  Jaune ')
    await champ.locator('xpath=ancestor::form').getByRole('button', { name: 'OK' }).click()
    await expect(libelle(page, 'T5 Jaune')).toBeVisible()
    await expect(libelle(page, 'T5 a')).toBeVisible()
    expect(
      execSql(
        `select repere from interclub.voie_difficulte where id = 'adadadad-0000-0000-0000-000000000015';`,
      ),
    ).toBe('Jaune')
  })

  test('même repère sur l’autre T5, à la casse près → refusé (R49c)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    const form = page.getByLabel('Repère de la voie T5 a').locator('xpath=ancestor::form')
    await page.getByLabel('Repère de la voie T5 a').fill('jaune')
    await form.getByRole('button', { name: 'OK' }).click()
    await expect(form.getByRole('alert')).toContainText('porte déjà le repère')
  })

  test('le coach distingue les deux T5 dans le choix de la voie (spec #6 R21)', async ({ page }) => {
    await commeCoach(page)
    await page.goto(URL_COACH)
    await page.getByRole('button', { name: /^Nora Delta/ }).click()
    const options = await page.locator('select[name="voieDifficulteId"] option').allInnerTexts()
    expect(options.some((o) => o.startsWith('T5 a ('))).toBe(true)
    expect(options.some((o) => o.startsWith('T5 Jaune ('))).toBe(true)
  })

  test('à la clôture, le repère est figé (R49d)', async ({ page }) => {
    poserPhaseAdo('cloture')
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await expect(libelle(page, 'T5 Jaune')).toBeVisible()
    await expect(page.getByLabel('Repère de la voie T5 Jaune')).toHaveCount(0)
  })
})
