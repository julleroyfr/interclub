import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Import CSV sans licence, format Marsas (spec #18 ; spec #3 R21c/R26) — cahier
 * 31. Parcours IHM complet sur un club dédié, vidé avant chaque test : dépôt du
 * fichier → compte-rendu → ré-import → liste des grimpeurs → garde R21c.
 *
 * Série + un seul worker (mute le même club en base).
 */

const CLUB_ID = '18181818-1818-1818-1818-181818181818'
const CLUB_NOM = 'Club E2E import CSV'

// Fichier synthétique (aucune donnée réelle) : 2 valides, 1 doublon de clé,
// 1 accent perdu (U+FFFD), 1 QUALITE invalide, 1 hors âge.
const CSV = [
  'QUALITE,NOM,PRENOM,DATNAISS',
  'MME,ROBIN-BROSSE,CELESTE ,2021-07-04',
  'M,L’HOSTIS,GABIN,2021-09-01',
  'M,L HOSTIS,Gabin,2021-01-15',
  'MME,BARRA,CL�OPH�E,2017-01-24',
  'MLLE,DUPONT,LEA,2015-03-03',
  'M,ANCIEN,PAUL,2001-05-05',
].join('\n')

async function deposer(page: Page, nom: string, contenu: string) {
  await page.goto('/admin/grimpeurs/import-csv')
  await page.getByLabel('Club cible').selectOption({ label: CLUB_NOM })
  await page.getByLabel(/Fichier des grimpeurs/).setInputFiles({
    name: nom,
    mimeType: 'text/csv',
    buffer: Buffer.from(contenu, 'utf8'),
  })
  await page.getByRole('button', { name: /Lancer l’import/ }).click()
}

const stat = (page: Page, label: string) =>
  page.locator('div.rounded-xl', { hasText: label }).locator('div').first()

test.describe('Import CSV sans licence (spec #18)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(() => {
    execSql(`delete from interclub.club where id = '${CLUB_ID}';`)
    execSql(`insert into interclub.club (id, nom) values ('${CLUB_ID}', '${CLUB_NOM}');`)
  })

  test.afterAll(() => {
    execSql(`delete from interclub.club where id = '${CLUB_ID}';`)
  })

  test('CT-01 écran réservé à l’admin : un coach reçoit un 404 (R1)', async ({ page }) => {
    await commeCoach(page)
    const reponse = await page.goto('/admin/grimpeurs/import-csv')
    expect(reponse?.status()).toBe(404)
  })

  test('CT-02 lien depuis l’import FFME (R2)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs/import')
    await page.getByRole('link', { name: /Importer un CSV sans licence/ }).click()
    await expect(page).toHaveURL(/\/admin\/grimpeurs\/import-csv$/)
  })

  test('CT-03 refus sans traitement : mauvais type, en-têtes inattendus (R4, R6)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await deposer(page, 'liste.txt', CSV)
    await expect(page.locator('form p[role="alert"]')).toHaveText(/format \.csv/)
    await deposer(page, 'liste.csv', 'NOM,PRENOM,QUALITE,DATNAISS\nAITA,HUGO,M,2012-08-12')
    await expect(page.locator('form p[role="alert"]')).toHaveText(/En-têtes inattendus/)
    expect(execSql(`select count(*) from interclub.grimpeur where club_id = '${CLUB_ID}';`)).toBe(
      '0',
    )
  })

  test('CT-04/05 import puis ré-import : créés, déjà présents, erreurs, doublon (R8–R17)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await deposer(page, 'liste.csv', CSV)

    await expect(page.getByText(/Import terminé — club/)).toContainText(CLUB_NOM)
    await expect(stat(page, 'Créés (licence générée)')).toHaveText('2')
    await expect(stat(page, 'Déjà présents')).toHaveText('0')
    await expect(stat(page, 'Ignorés (hors âge)')).toHaveText('1')
    await expect(stat(page, 'Lignes en erreur')).toHaveText('2')
    await expect(page.getByText(/1 doublon dans le fichier/)).toContainText('(L. 3)')
    await expect(page.locator('tr', { hasText: 'L. 5' })).toContainText(/caractère illisible/)
    await expect(page.locator('tr', { hasText: 'L. 6' })).toContainText(/QUALITE/)

    // Licences générées, distinctes, dans la plage ; dernière occurrence retenue (R12, R14).
    const lignes = execSql(
      `select nom || '|' || prenom || '|' || annee_naissance || '|' || licence_generee
         from interclub.grimpeur where club_id = '${CLUB_ID}' order by nom;`,
    ).split('\n')
    expect(lignes).toEqual(['L HOSTIS|Gabin|2021|true', 'ROBIN-BROSSE|CELESTE|2021|true'])

    // Ré-import : tout est reconnu, rien n'est créé (R13).
    await deposer(page, 'liste.csv', CSV)
    await expect(stat(page, 'Créés (licence générée)')).toHaveText('0')
    await expect(stat(page, 'Déjà présents')).toHaveText('2')
    expect(execSql(`select count(*) from interclub.grimpeur where club_id = '${CLUB_ID}';`)).toBe(
      '2',
    )
  })

  test('CT-11/12 liste : mention « générée » ; plage réservée refusée à la saisie (spec #3 R21c, R26)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await deposer(page, 'liste.csv', 'QUALITE,NOM,PRENOM,DATNAISS\nMME,ZZIMPORT,CELESTE,2021-07-04')
    await expect(stat(page, 'Créés (licence générée)')).toHaveText('1')

    await page.goto('/admin/grimpeurs?recherche=ZZIMPORT')
    const carte = page.locator('li', { hasText: 'ZZIMPORT' })
    await expect(carte).toContainText('générée')

    // Saisir un autre numéro de la plage réservée → refus (R21c).
    await carte.getByRole('button', { name: 'Modifier' }).click()
    // En édition, le nom n'est plus du texte (champ) : on cible le formulaire.
    const edition = page.locator('form:has(input[name="id"]):has(input[name="licence"])')
    await edition.getByLabel('Numéro de licence').fill('2147483000')
    await edition.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(edition.locator('p[role="alert"]')).toHaveText(/réservés aux licences générées/)

    // Remplacer par un vrai numéro → accepté, la mention disparaît (R21c, spec #18 R15).
    await edition.getByLabel('Numéro de licence').fill('918273')
    await edition.getByRole('button', { name: 'Enregistrer' }).click()
    const carteMaj = page.locator('li', { hasText: 'ZZIMPORT' })
    await expect(carteMaj).toContainText('licence 918273')
    await expect(carteMaj).not.toContainText('générée')
  })
})
