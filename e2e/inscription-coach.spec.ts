import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { CLUB_A } from './helpers/donnees'
import { execSql } from './helpers/sql'

/**
 * Cahier 16 — Invitation coach permanent : inscription avec double saisie du
 * mot de passe (spec #2 R30, rév. du 2026-10-09). Requiert la stack locale +
 * seed + dev server (port 3011).
 */

const EMAIL_NOMINAL = 'coach-e2e-inscription@test.local'
const EMAIL_CONFIRMATION_DIFFERENTE = 'coach-e2e-confirmation@test.local'

/** Valeur de l'invitation active de Club A (créée si absente). */
function invitationActiveClubA(): string {
  const existante = execSql(
    `select valeur from interclub.invitation_coach where club_id = '${CLUB_A}' and actif;`,
  )
  if (existante) return existante
  return execSql(
    `insert into interclub.invitation_coach (club_id) values ('${CLUB_A}') returning valeur;`,
  ).split('\n')[0]
}

function supprimerComptes(): void {
  execSql(
    `delete from auth.users where email in ('${EMAIL_NOMINAL}', '${EMAIL_CONFIRMATION_DIFFERENTE}');`,
  )
}

function compteExiste(email: string): boolean {
  return execSql(`select count(*) from auth.users where email = '${email}';`) === '1'
}

async function remplirInscription(
  page: Page,
  email: string,
  motDePasse: string,
  confirmation: string,
): Promise<void> {
  await page.goto(`/inscription?invitation=${invitationActiveClubA()}`)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse)
  await page.getByLabel('Confirmer le mot de passe').fill(confirmation)
  await page.getByRole('button', { name: /créer mon compte/i }).click()
}

test.describe('Cahier 16 — Inscription coach permanent (spec #2 R30)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(supprimerComptes)
  test.afterAll(supprimerComptes)

  test('CT-02 · mots de passe identiques → compte créé, retour à la connexion (R30, R31)', async ({ page }) => {
    await remplirInscription(page, EMAIL_NOMINAL, 'motdepasse', 'motdepasse')
    await expect(page).toHaveURL(/\/connexion\?inscrit=1/)
    expect(compteExiste(EMAIL_NOMINAL)).toBe(true)
  })

  test('CT-11 · confirmation différente → refus, aucun compte créé (R30)', async ({ page }) => {
    await remplirInscription(page, EMAIL_CONFIRMATION_DIFFERENTE, 'motdepasse', 'motdepasze')
    await expect(
      page.getByRole('alert').filter({ hasText: 'Les deux mots de passe ne correspondent pas.' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/inscription/)
    expect(compteExiste(EMAIL_CONFIRMATION_DIFFERENTE)).toBe(false)
  })
})
