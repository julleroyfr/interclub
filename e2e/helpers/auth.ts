import { expect, type Page } from '@playwright/test'

import { COMPTES, JETON } from './donnees'

type Compte = { email: string; mdp: string }

/**
 * Connexion via l'IHM `/connexion` (formulaire seConnecter). Attend la fin de la
 * redirection post-connexion avant de rendre la main.
 */
export async function seConnecter(page: Page, compte: Compte): Promise<void> {
  await page.goto('/connexion')
  await page.getByLabel('E-mail').fill(compte.email)
  await page.getByLabel('Mot de passe').fill(compte.mdp)
  await page.getByRole('button', { name: /se connecter/i }).click()
  // La connexion redirige hors de /connexion ; on attend ce départ.
  await expect(page).not.toHaveURL(/\/connexion/, { timeout: 15_000 })
}

export const commeCoach = (page: Page) => seConnecter(page, COMPTES.coach)
export const commeAdmin = (page: Page) => seConnecter(page, COMPTES.admin)
export const commeSansMapping = (page: Page) => seConnecter(page, COMPTES.sansMapping)

/**
 * Ouvre une session **coach temporaire** par scan du QR (utilisateur anonyme) et
 * attend la redirection vers `/coach`. La rencontre doit être dans la fenêtre du
 * coach temp (préparation ou compétition) au moment du scan.
 */
export async function commeCoachTemporaire(page: Page): Promise<void> {
  await page.goto(`/scan?jeton=${JETON.coachTemp}`)
  await page.waitForURL('**/coach')
}
