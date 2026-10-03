import { commeAdmin } from './helpers/auth'
import { RENCONTRE_PILOTE } from './helpers/donnees'
import { expect, test } from './helpers/fixtures'
import { execSql, poserPhase } from './helpers/sql'

// Cahier 23 CT-14 — écran d'erreur technique (spec #12 R25, rév. 2026-10-03).
// Panne SIMULÉE : retrait du droit `select` de service_role sur points_vitesse,
// lu par le loader du classement (spec #7) ; `verifierLecture` lève alors une
// erreur (lot 2 de la revue) et `app/error.tsx` affiche l'écran d'erreur. Le
// droit est rétabli à la fin, quoi qu'il arrive.

const retirerDroit = () =>
  execSql('revoke select on interclub.points_vitesse from service_role;')
const retablirDroit = () =>
  execSql('grant select on interclub.points_vitesse to service_role;')

test.describe('Cahier 23 CT-14 — écran d’erreur (R25)', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(() => {
    retablirDroit()
    poserPhase('pre_competition')
  })

  test('lecture en échec → écran d’erreur ; « Réessayer » après rétablissement → classement', async ({
    page,
  }) => {
    poserPhase('competition')
    await commeAdmin(page)
    retirerDroit()
    try {
      await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}/classement`)

      await expect(page.getByRole('heading', { name: 'Une erreur est survenue' })).toBeVisible()
      // Aucun détail technique (nom de table, code Postgres, message brut).
      await expect(page.getByRole('alert').filter({ hasText: 'Une erreur est survenue' }))
        .not.toContainText(/points_vitesse|permission denied|Lecture impossible/)
      await expect(page.getByRole('link', { name: 'Revenir à l’accueil' })).toHaveAttribute(
        'href',
        '/',
      )
    } finally {
      retablirDroit()
    }

    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('heading', { name: 'Une erreur est survenue' })).toHaveCount(0)
    await expect(page.getByText(/Classement/).first()).toBeVisible()
  })
})
