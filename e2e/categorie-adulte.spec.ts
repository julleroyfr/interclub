import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Cahier 33 — catégorie adulte, lot 1 (spec #20 R1, R6–R9, R9bis).
 * L'admin crée une rencontre adulte depuis l'IHM : le gabarit adulte est copié
 * (T1–T10, B1/B2, « Voie 1 »/« Voie 2 »). Il renomme une voie de vitesse dans la
 * rencontre et dans le gabarit ; un libellé blanc est refusé.
 *
 * Série : crée puis supprime une rencontre adulte (date 2027-01-16) et rétablit
 * le libellé « Voie 2 » du gabarit adulte.
 */

const DATE = '2027-01-16'

function supprimerRencontresAdultes(): void {
  execSql(`delete from interclub.rencontre where categorie = 'adulte' and date_rencontre = '${DATE}';`)
}

function retablirGabarit(): void {
  execSql(
    `update interclub.gabarit_voie_vitesse set libelle = 'Voie 2'
      where ordre = 2 and gabarit_epreuve_id =
        (select id from interclub.gabarit_epreuve where categorie = 'adulte' and type = 'vitesse');`,
  )
}

/** Carte du gabarit d'une catégorie (titre « Gabarit <label> »). */
const carteGabarit = (page: Page, label: string) =>
  page.getByRole('heading', { name: `Gabarit ${label}` }).locator('xpath=../..')

test.describe('Catégorie adulte — lot 1 (spec #20)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    supprimerRencontresAdultes()
    retablirGabarit()
  })

  test.afterAll(() => {
    supprimerRencontresAdultes()
    retablirGabarit()
  })

  test('l’admin crée une rencontre adulte ; le gabarit adulte est copié (R1, R6–R9)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/rencontres')
    await page.getByLabel('Date de la rencontre').fill(DATE)
    await page.getByLabel('Club porteur').selectOption({ index: 1 })
    await page.getByLabel('Catégorie').selectOption('adulte')
    await page.getByRole('button', { name: 'Créer la rencontre' }).click()
    await expect(page.getByText('Rencontre créée.')).toBeVisible()

    const structure = execSql(
      `select (select count(*) from interclub.voie_difficulte vd join interclub.epreuve e on e.id = vd.epreuve_id
                where e.rencontre_id = r.id and vd.type_voie = 'tete') || '/' ||
              (select count(*) from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
                where e.rencontre_id = r.id) || '/' ||
              (select string_agg(libelle, ',' order by numero) from interclub.voie_vitesse where rencontre_id = r.id)
         from interclub.rencontre r where r.categorie = 'adulte' and r.date_rencontre = '${DATE}';`,
    )
    expect(structure).toBe('10/2/Voie 1,Voie 2')
  })

  test('dans la rencontre, l’admin renomme une voie de vitesse (R9bis)', async ({ page }) => {
    const id = execSql(
      `select id from interclub.rencontre where categorie = 'adulte' and date_rencontre = '${DATE}';`,
    )
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${id}`)
    await page.getByRole('button', { name: /^Vitesse/ }).click()
    const champ = page.getByLabel('Libellé (voie 1)')
    await expect(champ).toHaveValue('Voie 1')
    await champ.fill('  Voie 1   —  dalle ')
    await champ.locator('xpath=ancestor::form').getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Libellé enregistré.')).toBeVisible()
    expect(
      execSql(`select libelle from interclub.voie_vitesse where rencontre_id = '${id}' and numero = 1;`),
    ).toBe('Voie 1 — dalle')
  })

  test('un libellé blanc est refusé, l’ancien est conservé (R9bis)', async ({ page }) => {
    const id = execSql(
      `select id from interclub.rencontre where categorie = 'adulte' and date_rencontre = '${DATE}';`,
    )
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${id}`)
    await page.getByRole('button', { name: /^Vitesse/ }).click()
    const form = page.getByLabel('Libellé (voie 2)').locator('xpath=ancestor::form')
    await page.getByLabel('Libellé (voie 2)').fill('   ')
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(form.getByRole('alert')).toContainText('obligatoire')
    expect(
      execSql(`select libelle from interclub.voie_vitesse where rencontre_id = '${id}' and numero = 2;`),
    ).toBe('Voie 2')
  })

  test('le gabarit affiche la catégorie adulte et son libellé de vitesse se modifie (R6, R9bis)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto('/admin/gabarit')
    const carte = carteGabarit(page, 'Adulte')
    await expect(carte).toBeVisible()
    const champ = carte.getByLabel('Libellé (voie 2)')
    await expect(champ).toHaveValue('Voie 2')
    await champ.fill('Voie 2 — dévers')
    await champ.locator('xpath=ancestor::form').getByRole('button', { name: 'Enregistrer' }).click()
    await expect(carte.getByText('Libellé enregistré.')).toBeVisible()
    expect(
      execSql(
        `select libelle from interclub.gabarit_voie_vitesse
          where ordre = 2 and gabarit_epreuve_id =
            (select id from interclub.gabarit_epreuve where categorie = 'adulte' and type = 'vitesse');`,
      ),
    ).toBe('Voie 2 — dévers')
  })
})
