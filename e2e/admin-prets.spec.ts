import { expect, test, type Page } from '@playwright/test'

import { commeAdmin, commeCoach } from './helpers/auth'
import { RENCONTRE_PILOTE } from './helpers/donnees'
import { execSql, poserPhase, reinitialiserEngagement } from './helpers/sql'

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
    // Point d'entrée : la page de la rencontre (rencontre implicite).
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)

    // Créer le prêt : club d'origine → recherche → grimpeur → club d'accueil.
    await page.getByLabel('Club du grimpeur').selectOption({ label: 'Club B' })
    await page.getByLabel(/Rechercher un grimpeur/).fill('Devi')
    await page.locator('select[name="grimpeurId"]').selectOption({ label: 'Devi Bravo' })
    await page.locator('select[name="clubAccueilId"]').selectOption({ label: 'Club A' })
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

  test('accueil exclut le club d’origine + filtre catégorie (enfant) du roster', async ({
    page,
  }) => {
    // Un grimpeur ADO du Club B (né en 2000) ne doit PAS être proposé pour une
    // rencontre ENFANT (R34). Inséré puis nettoyé.
    const ADO = 'b0000000-0000-0000-0000-0000000000b9'
    execSql(
      `insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance) values ('${ADO}','22222222-2222-2222-2222-222222222222','Bravo','Grand',2000) on conflict (id) do nothing;`,
    )
    try {
      await commeAdmin(page)
      await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)

      // Club d'origine = Club B : Club B est exclu des clubs d'accueil.
      await page.getByLabel('Club du grimpeur').selectOption({ label: 'Club B' })
      const accueil = await page
        .locator('select[name="clubAccueilId"] option')
        .allInnerTexts()
      expect(accueil).toContain('Club A')
      expect(accueil).not.toContain('Club B')

      // Filtre par club + catégorie : Devi (enfant, Club B) proposé ; Ana (Club A)
      // et Grand Bravo (ado) absents.
      const options = await page
        .locator('select[name="grimpeurId"] option')
        .allInnerTexts()
      expect(options).toContain('Devi Bravo')
      expect(options.join(' ')).not.toContain('Ana Alpha')
      expect(options.join(' ')).not.toContain('Grand Bravo')
    } finally {
      execSql(`delete from interclub.grimpeur where id='${ADO}';`)
    }
  })
})
