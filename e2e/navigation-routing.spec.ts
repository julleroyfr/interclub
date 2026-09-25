import { expect, test } from '@playwright/test'

import { commeAdmin, commeCoach, commeCoachTemporaire, commeSansMapping } from './helpers/auth'
import { JETON, RENCONTRE_PILOTE } from './helpers/donnees'

/**
 * Cahier 23 — Navigation & routing (spec #12). Valide les redirections, la garde
 * hybride (redirect/404), la déconnexion, la centralisation du bandeau et la vue
 * classement admin. Requiert la stack locale + seed + dev server (port 3011).
 */
test.describe('Cahier 23 — Navigation & routing (spec #12)', () => {
  const nav = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Navigation principale' })

  // ---- CT-02 : la racine / est un routeur (R7) ----
  test('CT-02 · / non authentifié → /connexion', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('CT-02 · / coach → /coach', async ({ page }) => {
    await commeCoach(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/coach$/)
  })

  test('CT-02 · / admin → /admin', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('CT-02 · / sans rôle → écran minimal', async ({ page }) => {
    await commeSansMapping(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(/aucun rôle attribué/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /se déconnecter/i })).toBeVisible()
  })

  // ---- CT-03 : déjà connecté sur une page d'auth (R8) ----
  test('CT-03 · /connexion déjà connecté (admin) → /admin', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/connexion')
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('CT-03 · /inscription déjà connecté (coach) → /coach', async ({ page }) => {
    await commeCoach(page)
    await page.goto('/inscription?invitation=peu-importe')
    await expect(page).toHaveURL(/\/coach$/)
  })

  // ---- CT-04 : absence de session → /connexion (R2) ----
  for (const chemin of ['/admin', '/admin/rencontres', '/coach', '/coach/jetons']) {
    test(`CT-04 · ${chemin} non authentifié → /connexion`, async ({ page }) => {
      await page.goto(chemin)
      await expect(page).toHaveURL(/\/connexion/)
    })
  }

  // ---- CT-05 : mauvais rôle → 404 (R3) ----
  test('CT-05 · coach sur /admin → 404', async ({ page }) => {
    await commeCoach(page)
    const resp = await page.goto('/admin')
    expect(resp?.status()).toBe(404)
  })

  test('CT-05 · admin sur /coach → 404', async ({ page }) => {
    await commeAdmin(page)
    const resp = await page.goto('/coach')
    expect(resp?.status()).toBe(404)
  })

  // ---- CT-06 : déconnexion des comptes permanents (R20/R21) ----
  test('CT-06 · déconnexion depuis l’espace admin', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/clubs')
    await page.getByRole('button', { name: /se déconnecter/i }).click()
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('CT-06 · déconnexion depuis l’espace coach', async ({ page }) => {
    await commeCoach(page)
    await page.goto('/coach')
    await page.getByRole('button', { name: /se déconnecter/i }).click()
    await expect(page).toHaveURL(/\/connexion/)
  })

  // ---- CT-07 : jetons joignables via la nav coach (R10, C1) ----
  test('CT-07 · /coach/jetons via le lien « Jetons »', async ({ page }) => {
    await commeCoach(page)
    await page.goto('/coach')
    await nav(page).getByRole('link', { name: 'Jetons' }).click()
    await expect(page).toHaveURL(/\/coach\/jetons/)
  })

  // ---- CT-10 : vue classement admin (R14/R15) ----
  test('CT-10 · lien classement admin → vue admin (pas /coach)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
    await page.getByRole('link', { name: /voir le classement/i }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/rencontres/${RENCONTRE_PILOTE}/classement`))
    await expect(page).not.toHaveURL(/\/coach\//)
    // Remontée explicite (R19) : le lien retour « ← Tableau de bord ».
    await expect(page.getByRole('link', { name: '← Tableau de bord' })).toBeVisible()
  })

  // ---- CT-11 : bandeau cohérent, sans « Accueil » (R23, R7) ----
  test('CT-11 · bandeau admin : liens présents, aucun « Accueil »', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/clubs')
    await expect(nav(page).getByRole('link', { name: 'Accueil' })).toHaveCount(0)
    await expect(nav(page).getByRole('link', { name: 'Tableau de bord' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Rencontres' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Rôles' })).toBeVisible()
  })

  test('CT-11 · bandeau coach (jetons) : « Mes rencontres » présent, aucun « Accueil »', async ({ page }) => {
    await commeCoach(page)
    await page.goto('/coach/jetons')
    await expect(nav(page).getByRole('link', { name: 'Mes rencontres' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Accueil' })).toHaveCount(0)
  })

  // ---- CT-08 : coach temporaire — nav bornée + « Terminer » (R11/R22) ----
  // Dépend de la fenêtre QR « jour J » : peut échouer si la rencontre seed n'est
  // pas dans la fenêtre au moment du run.
  test('CT-08 · coach temporaire : nav bornée + Terminer', async ({ page }) => {
    await commeCoachTemporaire(page)
    await expect(nav(page).getByRole('link', { name: 'Ma rencontre' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Classement' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Mes rencontres' })).toHaveCount(0)
    await expect(nav(page).getByRole('link', { name: 'Accueil' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /terminer/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /se déconnecter/i })).toHaveCount(0)
  })

  // ---- CT-09 : fin de session juge (R17/R18/R22) ----
  // Dépend de la fenêtre QR « jour J » (rencontre en ③).
  test('CT-09 · juge : « Terminer » ferme la session', async ({ page }) => {
    await page.goto(`/scan?jeton=${JETON.juge}`)
    await page.waitForURL('**/juge')
    await expect(page.getByRole('button', { name: /se déconnecter/i })).toHaveCount(0)
    await page.getByRole('button', { name: /terminer/i }).click()
    // terminerSession → / → redirige vers /connexion (plus de session).
    await expect(page).toHaveURL(/\/connexion/)
  })
})
