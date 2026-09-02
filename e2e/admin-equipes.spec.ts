import { expect, test, type Locator, type Page } from '@playwright/test'

import { commeAdmin } from './helpers/auth'
import { RENCONTRE_PILOTE } from './helpers/donnees'
import { poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Écran admin — CRUD des équipes/compositions de TOUS les clubs (spec #1 R10),
 * en toute phase (R6 : l'admin corrige même quand les coachs sont gelés).
 * Série + un seul worker (mute la même rencontre en base).
 */
test.describe('Écran admin — équipes tous clubs (R10)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(() => {
    reinitialiserEngagement()
  })

  // Section (Carte) d'un club, repérée par son titre.
  const carteClub = (page: Page, nom: string): Locator =>
    page.getByRole('heading', { name: nom, exact: true }).locator('..')

  test('CRUD d’une équipe d’un autre club, en compétition (R6/R10)', async ({
    page,
  }) => {
    // En compétition les coachs sont gelés ; l'admin, non.
    poserPhase('competition')
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)

    // Le panneau liste les équipes de tous les clubs.
    await expect(
      page.getByRole('heading', { name: 'Équipes & engagement (tous clubs)' }),
    ).toBeVisible()
    const carteB = carteClub(page, 'Club B')
    await expect(carteB.getByRole('heading', { name: 'Équipe B1' })).toBeVisible()

    // Créer une équipe « B2 » pour le Club B (en compétition).
    await carteB.getByLabel('Nouvelle équipe').fill('B2')
    await carteB.getByRole('button', { name: /Créer/ }).click()
    await expect(carteB.getByRole('heading', { name: 'B2' })).toBeVisible()

    // Ajouter Devi (libre, Club B) à B2.
    const equipeB2 = carteB.locator('[data-equipe="B2"]')
    await equipeB2.locator('select[name="grimpeurId"]').selectOption({ label: 'Devi Bravo' })
    await equipeB2.getByRole('button', { name: /Ajouter/ }).click()
    await expect(equipeB2.locator('li', { hasText: 'Devi Bravo' })).toBeVisible()

    // Retirer Devi.
    await equipeB2.getByRole('button', { name: 'Retirer Devi Bravo' }).click()
    await expect(equipeB2.locator('li', { hasText: 'Devi Bravo' })).toHaveCount(0)

    // Supprimer l'équipe B2.
    await equipeB2.getByRole('button', { name: /Supprimer l.équipe B2/ }).click()
    await expect(carteB.getByRole('heading', { name: 'B2' })).toHaveCount(0)
  })
})
