import { commeAdmin } from './helpers/auth'
import { RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { expect, test } from './helpers/fixtures'
import { execSql, poserDate, poserPhase } from './helpers/sql'

// Cahier 12 CT-17 — changement de phase refusé depuis un écran périmé (spec #3
// R17, revue du 2026-10-03 M4). L'action relit la phase EN BASE et n'accepte
// qu'une transition adjacente (`peutTransiter`, testé en Vitest) : un onglet
// resté en ③ ne peut plus faire sauter la rencontre de ④ à ②.

const phaseEnBase = () =>
  execSql(`select phase from interclub.rencontre where id = '${RENCONTRE_PILOTE}';`)

test.describe('Cahier 12 CT-17 — pilotage de phase (R17)', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(() => {
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('écran resté en ③ alors que la base est en ④ : « ← Préparation » refusé', async ({
    page,
  }) => {
    poserDate('today')
    poserPhase('competition')
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)

    const revenir = page.getByRole('button', { name: 'Revenir à la phase précédente' })
    await expect(revenir).toContainText('Préparation')

    // Un autre admin passe la rencontre en clôture ; cet écran n'est pas rechargé.
    poserPhase('cloture')
    await revenir.click()

    await expect(
      page.getByText(/La rencontre est en phase « Clôture » : ce changement de phase n.est plus possible/),
    ).toBeVisible()
    expect(phaseEnBase()).toBe('cloture')
  })

  test('transition adjacente depuis un écran à jour : acceptée', async ({ page }) => {
    poserDate('today')
    poserPhase('competition')
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)

    await page.getByRole('button', { name: 'Revenir à la phase précédente' }).click()
    await expect.poll(phaseEnBase).toBe('preparation')
  })
})
