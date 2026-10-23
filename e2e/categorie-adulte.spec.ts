import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Cahier 33 — catégorie adulte, lots 1, 3 et 4 (spec #20 R1, R6–R9, R9bis, R10–R14,
 * R23, R25).
 * L'admin crée une rencontre adulte depuis l'IHM : le gabarit adulte est copié
 * (T1–T10, B1/B2, « Voie 1 »/« Voie 2 »). Il renomme une voie de vitesse dans la
 * rencontre et dans le gabarit ; un libellé blanc est refusé. Il compose des
 * équipes adultes sans club (grimpeurs adultes du seed, clubs A et B), 4 au plus ;
 * le coach n'a que la lecture.
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

const idRencontre = () =>
  execSql(`select id from interclub.rencontre where categorie = 'adulte' and date_rencontre = '${DATE}';`)

/** Ajoute un grimpeur (recherche unique) à une équipe adulte de l'écran admin. */
async function ajouter(page: Page, equipe: string, recherche: string) {
  const carte = page.locator(`[data-equipe="${equipe}"]`)
  await carte.getByLabel('Ajouter un grimpeur (tous clubs, 16 ans et plus)').fill(recherche)
  await carte.getByRole('button', { name: 'Ajouter' }).click()
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

  test('l’admin compose une équipe adulte inter-clubs, 4 au plus (R10–R14)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${idRencontre()}`)
    await expect(page.getByRole('heading', { name: 'Équipes adultes' })).toBeVisible()
    // Pas de prêt en adulte (R11).
    await expect(page.getByRole('heading', { name: /Prêts/ })).toHaveCount(0)

    await expect(page.getByLabel('Nouvelle équipe')).toHaveValue('Équipe 1')
    await page.getByRole('button', { name: 'Créer' }).click()
    const carte = page.locator('[data-equipe="Équipe 1"]')
    await expect(carte).toBeVisible()

    for (const nom of ['Lucie', 'Sarah', 'Karim', 'Emma']) {
      await ajouter(page, 'Équipe 1', nom)
      await expect(carte.getByText(new RegExp(`${nom} (Echo|Foxtrot)`))).toBeVisible()
    }
    await expect(carte.getByText('4/4')).toBeVisible()
    await expect(carte.getByText(/Équipe complète/)).toBeVisible()

    const id = idRencontre()
    expect(
      execSql(
        `select count(*) || '/' || count(distinct g.club_id) || '/' || bool_and(e.club_id is null)
           from interclub.composition c join interclub.equipe e on e.id = c.equipe_id
           join interclub.grimpeur g on g.id = c.grimpeur_id where e.rencontre_id = '${id}';`,
      ),
    ).toBe('4/2/true')
  })

  test('l’admin change un grimpeur d’équipe adulte (R11, R12)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${idRencontre()}`)
    await expect(page.getByLabel('Nouvelle équipe')).toHaveValue('Équipe 2')
    await page.getByRole('button', { name: 'Créer' }).click()
    await expect(page.locator('[data-equipe="Équipe 2"]')).toBeVisible()
    await ajouter(page, 'Équipe 2', 'Inès')
    await expect(page.locator('[data-equipe="Équipe 2"]').getByText('Inès Foxtrot', { exact: true })).toBeVisible()

    const carte1 = page.locator('[data-equipe="Équipe 1"]')
    await carte1.getByLabel('Changer Karim Echo d’équipe').selectOption({ label: 'Équipe 2' })
    await carte1
      .getByLabel('Changer Karim Echo d’équipe')
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Changer d’équipe' })
      .click()
    await expect(page.locator('[data-equipe="Équipe 2"]').getByText('Karim Echo', { exact: true })).toBeVisible()
    await expect(carte1.getByText('3/4')).toBeVisible()
  })

  test('le coach voit la rencontre adulte en lecture seule (R10)', async ({ page }) => {
    await commeCoach(page)
    await page.goto(`/coach/rencontres/${idRencontre()}`)
    await expect(page.getByText(/créées et composées par\s+l’administrateur/)).toBeVisible()
    await expect(page.getByLabel('Nouvelle équipe')).toHaveCount(0)
  })

  test('l’admin saisit un top en moulinette : moitié du top (R23, R25)', async ({ page }) => {
    const id = idRencontre()
    execSql(`update interclub.rencontre set phase = 'competition' where id = '${id}';`)
    try {
      await commeAdmin(page)
      await page.goto(`/admin/rencontres/${id}/resultats`)
      await page.getByRole('button', { name: /^Lucie Echo/ }).click()
      const ajout = page.locator('form', { has: page.locator('select[name="voieDifficulteId"]') })
      await ajout.locator('select[name="voieDifficulteId"]').selectOption({ label: 'T5 (6a)' })
      // Issues adultes proposées (R23).
      for (const nom of ['Top', 'Top en moulinette', 'Zone 2', 'Zone 1', 'Échec']) {
        await expect(ajout.getByRole('button', { name: nom, exact: true })).toBeVisible()
      }
      await ajout.getByRole('button', { name: 'Top en moulinette', exact: true }).click()
      await expect
        .poll(() =>
          execSql(
            `select rv.issue from interclub.resultat_voie rv
               join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
               join interclub.epreuve e on e.id = vd.epreuve_id
               join interclub.grimpeur g on g.id = rv.grimpeur_id
              where e.rencontre_id = '${id}' and g.prenom = 'Lucie' and vd.niveau = 'T5';`,
          ),
        )
        .toBe('top_moulinette')
      // T5 : top 12 → 6 points en moulinette (R25), seul résultat de Lucie.
      await expect(page.getByText(/^6\s*pts$/).first()).toBeVisible()
    } finally {
      execSql(`update interclub.rencontre set phase = 'pre_competition' where id = '${id}';`)
    }
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
