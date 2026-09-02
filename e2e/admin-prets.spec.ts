import { expect, test, type Page } from '@playwright/test'

import { commeAdmin, commeCoach } from './helpers/auth'
import { RENCONTRE_PILOTE } from './helpers/donnees'
import { poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Écran admin de gestion des prêts (spec #1 R35). Vérifie le parcours complet :
 * l'admin crée un prêt via l'IHM → le coach d'accueil voit le grimpeur dans son
 * roster (spec #5 R12/R13) → révocation.
 *
 * Série + un seul worker (mute la même rencontre en base).
 */
test.describe('Écran admin — prêts de grimpeurs (R35)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(() => {
    reinitialiserEngagement() // nettoie prêts + compositions surnuméraires
    poserPhase('pre_competition')
  })

  const rosterContient = async (page: Page, texte: string) => {
    await page.goto(`/coach/rencontres/${RENCONTRE_PILOTE}`)
    const options = await page
      .locator('select[name="grimpeurId"] option')
      .allInnerTexts()
    return options.some((o) => o.includes(texte))
  }

  test('admin crée un prêt → le coach voit le prêté au roster → révocation', async ({
    page,
    browser,
  }) => {
    await commeAdmin(page)
    await page.goto('/admin/prets')

    // Créer le prêt : Devi (Club B) → Club A, pour la rencontre pilote.
    await page.getByLabel('Rencontre').selectOption({ label: '19/09/2026 — Club A (Enfant)' })
    await page.getByLabel('Grimpeur à prêter').selectOption({ label: 'Devi Bravo — Club B' })
    await page.getByLabel("Club d'accueil").selectOption({ label: 'Club A' })
    await page.getByRole('button', { name: /Créer le prêt/ }).click()

    await expect(page.getByRole('status')).toHaveText(/Prêt créé/)
    const ligne = page.locator('tr', { hasText: 'Devi Bravo' })
    await expect(ligne).toBeVisible()

    // Côté coach (autre contexte) : Devi apparaît au roster (badge prêté).
    const ctxCoach = await browser.newContext()
    const pageCoach = await ctxCoach.newPage()
    await commeCoach(pageCoach)
    expect(await rosterContient(pageCoach, 'Devi Bravo (prêté · Club B)')).toBe(true)
    await ctxCoach.close()

    // Révoquer le prêt → la ligne disparaît.
    await ligne.getByRole('button', { name: /Révoquer/ }).click()
    await expect(page.locator('tr', { hasText: 'Devi Bravo' })).toHaveCount(0)
  })

  test('refus : prêt vers le club d’origine du grimpeur (règle domaine)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto('/admin/prets')
    await page.getByLabel('Rencontre').selectOption({ label: '19/09/2026 — Club A (Enfant)' })
    // Devi (Club B) prêté à… Club B : refusé.
    await page.getByLabel('Grimpeur à prêter').selectOption({ label: 'Devi Bravo — Club B' })
    await page.getByLabel("Club d'accueil").selectOption({ label: 'Club B' })
    await page.getByRole('button', { name: /Créer le prêt/ }).click()

    await expect(page.getByText(/son propre club/)).toBeVisible()
  })
})
