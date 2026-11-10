import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { CLUB_A, CLUB_B } from './helpers/donnees'
import { execSql } from './helpers/sql'

/**
 * Filtre par catégorie de la liste admin des grimpeurs (spec #3 R26b), cahier
 * docs/tests/09-parametrage-grimpeurs-t8.cahier.md CT-11.
 *
 * Données dédiées (nom « Filtrecat »), créées et nettoyées ici. Saison
 * 2026–2027, AGE_BASCULE = 12, AGE_ADO_MAX = 18 (.env.local) : à rejouer avant
 * le 1er septembre 2027.
 */
const ID = (n: number) => `26b0e000-0000-0000-0000-00000000000${n}`
const GRIMPEURS = [
  // [n, prénom, année, club]
  [1, 'Enfant', 2016, CLUB_A], // enfant seulement
  [2, 'Pivot', 2014, CLUB_A], // enfant + ado
  [3, 'Ado', 2011, CLUB_B], // ado seulement
  [4, 'Grand', 2009, CLUB_A], // ado + adulte (17 ans)
  [5, 'Adulte', 1990, CLUB_B], // adulte seulement
  [6, 'Surclasse', 2016, CLUB_A], // enfant, surclassé ado 2026
] as const

function nettoyer() {
  execSql(
    `delete from interclub.grimpeur where id in (${GRIMPEURS.map(([n]) => `'${ID(n)}'`).join(', ')});`,
  )
}

test.describe('Filtre catégorie de la liste des grimpeurs (spec #3 R26b)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    nettoyer()
    execSql(
      `insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence) values
         ${GRIMPEURS.map(([n, prenom, annee, club]) => `('${ID(n)}', '${club}', 'Filtrecat', '${prenom}', ${annee}, 'F', ${926100 + n})`).join(',\n')};
       insert into interclub.surclassement (grimpeur_id, saison) values ('${ID(6)}', 2026);`,
    )
  })
  test.afterAll(nettoyer)

  // Prénoms des lignes « FILTRECAT Prénom … » affichées, triés.
  const prenomsAffiches = async (page: Page) =>
    (await page.locator('li p.truncate', { hasText: 'FILTRECAT' }).allInnerTexts())
      // Le badge « Surclassé ado … » suit le prénom sans espace.
      .map((t) => t.replace(/^FILTRECAT\s+/, '').replace(/Surclassé[\s\S]*$/, '').trim())
      .sort()

  test('éligibilité de la saison en cours, recouvrements et surclassés (R26b-1 à R26b-3)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs?recherche=Filtrecat')
    await expect(page.getByText('Âges de la saison 2026–2027')).toBeVisible()
    expect(await prenomsAffiches(page)).toEqual(['Ado', 'Adulte', 'Enfant', 'Grand', 'Pivot', 'Surclasse'])

    // Choix par l'écran : le filtre se cumule avec la recherche (R26b).
    await page.getByLabel('Catégorie').selectOption('ado')
    await page.getByRole('button', { name: 'Rechercher' }).click()
    await expect(page).toHaveURL(/categorie=ado/)
    await expect(page.getByText('4 résultats pour « Filtrecat » — Ado')).toBeVisible()
    expect(await prenomsAffiches(page)).toEqual(['Ado', 'Grand', 'Pivot', 'Surclasse'])

    await page.goto('/admin/grimpeurs?recherche=Filtrecat&categorie=enfant')
    expect(await prenomsAffiches(page)).toEqual(['Enfant', 'Pivot', 'Surclasse'])

    await page.goto('/admin/grimpeurs?recherche=Filtrecat&categorie=adulte')
    expect(await prenomsAffiches(page)).toEqual(['Adulte', 'Grand'])

    // Cumul avec le filtre club (R26b).
    await page.goto(`/admin/grimpeurs?recherche=Filtrecat&categorie=ado&club=${CLUB_A}`)
    expect(await prenomsAffiches(page)).toEqual(['Grand', 'Pivot', 'Surclasse'])

    // « Effacer » remet tous les filtres à zéro (R26b).
    await page.getByRole('link', { name: 'Effacer' }).click()
    await expect(page).toHaveURL(/\/admin\/grimpeurs$/)
    await expect(page.getByLabel('Catégorie')).toHaveValue('')
  })

  test('catégorie inconnue dans l’adresse : ignorée (R26b-4)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs?recherche=Filtrecat&categorie=senior')
    await expect(page.getByLabel('Catégorie')).toHaveValue('')
    expect(await prenomsAffiches(page)).toHaveLength(6)
  })
})
