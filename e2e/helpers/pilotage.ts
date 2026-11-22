import { expect, type Page } from '@playwright/test'

/**
 * Passe la rencontre affichée de ③ en ④ par le pilotage de phase : le bouton
 * ouvre la confirmation (spec #3 R17bis), qu'on valide par « Clôturer ».
 */
export async function cloturerViaPilotage(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Clôturer la rencontre ?' })
  await expect(fenetre).toBeVisible()
  await fenetre.getByRole('button', { name: 'Clôturer' }).click()
  await expect(page.getByRole('button', { name: 'Avancer à la phase suivante' })).toContainText(
    /Résultats publics/,
  )
}
