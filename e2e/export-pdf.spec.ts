import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach, commeSansMapping, seConnecter } from './helpers/auth'
import { MDP, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 26 — accès à l'export PDF (spec #15 R1–R9), cas CT-01, CT-04 à CT-07.
 * Le point d'accès lit le classement EN PARALLÈLE de la vérification d'accès
 * (lot 1 du plan « appels Supabase ») : ces cas prouvent qu'un refus reste un
 * 404 sans fichier. Le contenu du document (CT-02, CT-03, CT-08 à CT-10) reste
 * vérifié à la main.
 *
 * Série + un seul worker : mute la phase des rencontres du seed.
 */

const RENCONTRE_ADO = 'adadadad-adad-adad-adad-adadadadadad'
const COACH_B = { email: 'coachb@test.local', mdp: MDP }
const BOUTON = /Exporter en PDF/

const urlPdf = (espace: 'admin' | 'coach', rencontreId = RENCONTRE_PILOTE) =>
  `/${espace}/rencontres/${rencontreId}/classement/pdf`

/** Appel direct de l'URL d'export, avec la session de la page. */
async function appelerPdf(page: Page, url: string) {
  const reponse = await page.request.get(url, { maxRedirects: 0 })
  return { statut: reponse.status(), type: reponse.headers()['content-type'] ?? '' }
}

async function attendreRefus(page: Page, url: string): Promise<void> {
  const { statut, type } = await appelerPdf(page, url)
  expect(type).not.toContain('application/pdf')
  expect(statut).toBe(404)
}

test.describe('Cahier 26 — accès à l’export PDF (spec #15)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    poserPhase('resultats_publics')
  })

  test.afterAll(() => {
    poserPhase('competition', RENCONTRE_ADO)
    poserPhase('pre_competition')
    reinitialiserEngagement()
  })

  test('CT-01 · l’admin télécharge le PDF en ⑤ (R3, R7, R8, R9)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}/classement`)
    const telechargement = page.waitForEvent('download')
    await page.getByRole('link', { name: BOUTON }).click()
    expect((await telechargement).suggestedFilename()).toBe(
      `classement-${RENCONTRE_PILOTE_DATE}-enfant.pdf`,
    )
  })

  test('CT-04 · les coachs des clubs engagés exportent (R4, R7)', async ({ page }) => {
    for (const connecter of [commeCoach, (p: Page) => seConnecter(p, COACH_B)]) {
      await page.context().clearCookies()
      await connecter(page)
      await page.goto(`/coach/rencontres/${RENCONTRE_PILOTE}/classement`)
      await expect(page.getByRole('link', { name: BOUTON })).toBeVisible()
      const { statut, type } = await appelerPdf(page, urlPdf('coach'))
      expect(statut).toBe(200)
      expect(type).toContain('application/pdf')
    }
  })

  test('CT-05 · pas d’export avant la ⑤ (R1, R2)', async ({ page }) => {
    poserPhase('cloture')
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}/classement`)
    await expect(page.getByRole('button', { name: 'Individuel' })).toBeVisible()
    await expect(page.getByRole('link', { name: BOUTON })).toHaveCount(0)
    await attendreRefus(page, urlPdf('admin'))

    await page.context().clearCookies()
    await commeCoach(page)
    await attendreRefus(page, urlPdf('coach'))
    poserPhase('resultats_publics')
  })

  test('CT-06 · coach d’un club non engagé : 404 (R4)', async ({ page }) => {
    poserPhase('resultats_publics', RENCONTRE_ADO)
    await seConnecter(page, COACH_B)
    await page.goto(`/coach/rencontres/${RENCONTRE_ADO}/classement`)
    await expect(page.getByRole('button', { name: 'Individuel' })).toBeVisible()
    await expect(page.getByRole('link', { name: BOUTON })).toHaveCount(0)
    await attendreRefus(page, urlPdf('coach', RENCONTRE_ADO))

    // Contrôle positif : Club A est engagé.
    await page.context().clearCookies()
    await commeCoach(page)
    expect((await appelerPdf(page, urlPdf('coach', RENCONTRE_ADO))).statut).toBe(200)
  })

  test('CT-07 · rôles sans accès : 404 (R5)', async ({ page }) => {
    // 1. Déconnecté.
    await attendreRefus(page, urlPdf('admin'))
    await attendreRefus(page, urlPdf('coach'))
    // 2. Authentifié sans rôle.
    await commeSansMapping(page)
    await attendreRefus(page, urlPdf('admin'))
    await attendreRefus(page, urlPdf('coach'))
    // 3. Coach sur l'URL de l'espace admin.
    await page.context().clearCookies()
    await commeCoach(page)
    await attendreRefus(page, urlPdf('admin'))
  })
})
