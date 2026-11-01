import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Cahier 12 CT-19 à CT-23 — modification et suppression des éléments de la
 * structure d'une rencontre (spec #3 R51–R55). Rencontre ADO du seed, passée en
 * ② préparation : on y ajoute par SQL des éléments jetables (voies T9, bloc
 * BE2E et son palier, voie de vitesse « E2E », une ligne de points de vitesse),
 * retirés en fin de série.
 *
 * Série : mute la phase et la structure de la rencontre ado.
 */

const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const URL_ADMIN = `/admin/rencontres/${ADO}`
const EPREUVE_VOIE = 'adadadad-0000-0000-0000-0000000000a1'
const EPREUVE_BLOC = 'adadadad-0000-0000-0000-0000000000a2'
const EPREUVE_VITESSE = 'adadadad-0000-0000-0000-0000000000a3'
const GRIMPEUR = 'adadadad-0000-0000-0000-0000000000c1'

const VOIE_LIBRE = 'e2e00000-0000-0000-0000-000000000001'
const VOIE_RESULTAT = 'e2e00000-0000-0000-0000-000000000002'
const BLOC = 'e2e00000-0000-0000-0000-000000000003'
const PALIER = 'e2e00000-0000-0000-0000-000000000004'
const VITESSE = 'e2e00000-0000-0000-0000-000000000005'

function nettoyer(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in ('${VOIE_LIBRE}', '${VOIE_RESULTAT}');
     delete from interclub.voie_difficulte
      where id in ('${VOIE_LIBRE}', '${VOIE_RESULTAT}') or (epreuve_id = '${EPREUVE_VOIE}' and repere like 'E2E%');
     delete from interclub.points_vitesse where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${GRIMPEUR}';
     delete from interclub.bloc where id = '${BLOC}' or (epreuve_id = '${EPREUVE_BLOC}' and code like 'BE2E%');
     delete from interclub.voie_vitesse where id = '${VITESSE}';
     update interclub.rencontre set phase = 'competition' where id = '${ADO}';`,
  )
}

function poserPhaseAdo(phase: 'preparation' | 'competition'): void {
  execSql(`update interclub.rencontre set phase = '${phase}' where id = '${ADO}';`)
}

/** Onglet de la structure (Voies de difficulté, Blocs, Vitesse). */
async function ouvrirOnglet(page: Page, nom: RegExp): Promise<void> {
  await page.getByRole('button', { name: nom }).click()
}

test.describe('Édition de la structure d’une rencontre (spec #3 R51–R55)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    nettoyer()
    execSql(
      `insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, repere, points, points_zone1, points_zone2, ordre)
         values ('${VOIE_LIBRE}', '${EPREUVE_VOIE}', 'T9', 'tete', '7a', 'E2E1', 20, 17, 18, 90),
                ('${VOIE_RESULTAT}', '${EPREUVE_VOIE}', 'T9', 'tete', '7a', 'E2E2', 20, 17, 18, 91);
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${VOIE_RESULTAT}', '${GRIMPEUR}', 'top');
       insert into interclub.bloc (id, epreuve_id, code, ordre) values ('${BLOC}', '${EPREUVE_BLOC}', 'BE2E', 90);
       insert into interclub.bloc_palier (id, bloc_id, libelle, points, ordre) values ('${PALIER}', '${BLOC}', 'Zone', 10, 1);
       insert into interclub.voie_vitesse (id, rencontre_id, numero, libelle) values ('${VITESSE}', '${ADO}', 90, 'E2E');`,
    )
    poserPhaseAdo('preparation')
  })

  test.afterAll(() => nettoyer())

  test('en ②, la structure reste éditable : ajout compris (R51 rév.)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await expect(page.getByText('la structure est verrouillée')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Modifier la voie T9 E2E1' })).toBeVisible()

    const ajout = page.locator('form', { has: page.getByRole('button', { name: '+ Voie' }) })
    await ajout.getByLabel('Niveau').selectOption('T3')
    await ajout.getByLabel('Cotation').fill('5b')
    await ajout.getByLabel('Repère').fill('E2E3')
    await ajout.getByLabel('Voie entière').fill('8')
    await ajout.getByRole('button', { name: '+ Voie' }).click()
    await expect(page.getByRole('button', { name: 'Modifier la voie T3 E2E3' })).toBeVisible()
  })

  test('barème de vitesse figé dès qu’une saisie de vitesse existe (R55e)', async ({ page }) => {
    execSql(
      `insert into interclub.points_vitesse (epreuve_id, grimpeur_id, rang, points)
         values ('${EPREUVE_VITESSE}', '${GRIMPEUR}', 1, 60);`,
    )
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await ouvrirOnglet(page, /^Vitesse/)
    const bareme = page.locator('form', { has: page.getByRole('button', { name: 'Enregistrer le barème' }) })
    await bareme.getByRole('button', { name: 'Enregistrer le barème' }).click()
    await expect(bareme.getByRole('alert')).toContainText(
      'Barème non modifiable : 1 saisie de vitesse existe déjà sur cette épreuve.',
    )
  })

  test('modifier niveau, cotation et points d’une voie sans résultat (R52)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await page.getByRole('button', { name: 'Modifier la voie T9 E2E1' }).click()
    const form = page.getByRole('form', { name: 'Modifier la voie T9 E2E1' })
    await form.getByLabel('Niveau').selectOption('T10')
    await form.getByLabel('Cotation').fill('7b')
    await form.getByLabel('Voie entière').fill('25')
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(form).toHaveCount(0)
    expect(
      execSql(
        `select niveau || '|' || cotation || '|' || points from interclub.voie_difficulte where id = '${VOIE_LIBRE}';`,
      ),
    ).toBe('T10|7b|25')
  })

  test('voie portant un résultat : niveau figé, points modifiables, suppression refusée (R55)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await page.getByRole('button', { name: 'Modifier la voie T9 E2E2' }).click()
    const form = page.getByRole('form', { name: 'Modifier la voie T9 E2E2' })
    await form.getByLabel('Niveau').selectOption('T8')
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(form.getByRole('alert')).toContainText('1 résultat déjà saisi')

    await form.getByLabel('Niveau').selectOption('T9')
    await form.getByLabel('Voie entière').fill('21')
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(form).toHaveCount(0)
    expect(execSql(`select points from interclub.voie_difficulte where id = '${VOIE_RESULTAT}';`)).toBe('21')

    await page.getByRole('button', { name: 'Supprimer la voie T9 E2E2' }).click()
    await page.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Suppression impossible' })).toContainText(
      '1 résultat est saisi sur cette voie',
    )
    expect(execSql(`select count(*) from interclub.voie_difficulte where id = '${VOIE_RESULTAT}';`)).toBe('1')
  })

  test('supprimer une voie sans résultat après confirmation (R54)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await page.getByRole('button', { name: 'Supprimer la voie T10 E2E1' }).click()
    await page.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(page.getByRole('button', { name: 'Modifier la voie T10 E2E1' })).toHaveCount(0)
    expect(execSql(`select count(*) from interclub.voie_difficulte where id = '${VOIE_LIBRE}';`)).toBe('0')
  })

  test('bloc : code, paliers ajoutés, modifiés, supprimés, puis bloc supprimé (R53, R54)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await ouvrirOnglet(page, /^Blocs/)

    const code = page.getByLabel('Code du bloc BE2E')
    await code.fill(' BE2E  bis ')
    await code.locator('xpath=ancestor::form').getByRole('button', { name: /^Enregistrer le code/ }).click()
    await expect(page.getByLabel('Code du bloc BE2E bis')).toBeVisible()

    const points = page.getByLabel('Points du palier Zone (bloc BE2E bis)')
    await points.fill('12')
    await points.locator('xpath=ancestor::form').getByRole('button', { name: /^Enregistrer le palier/ }).click()
    await expect(points.locator('xpath=ancestor::form')).toContainText('Palier enregistré.')

    const carte = page.locator('li', { has: page.getByLabel('Code du bloc BE2E bis') })
    await carte.getByLabel('Libellé du nouveau palier (bloc BE2E bis)').fill('Bloc complet')
    await carte.getByLabel('Points du nouveau palier (bloc BE2E bis)').fill('30')
    await carte.getByRole('button', { name: '+ Palier' }).click()
    await expect(page.getByLabel('Points du palier Bloc complet (bloc BE2E bis)')).toHaveValue('30')

    await page.getByRole('button', { name: 'Supprimer le palier Zone du bloc BE2E bis' }).click()
    await page.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(page.getByLabel('Points du palier Zone (bloc BE2E bis)')).toHaveCount(0)
    expect(
      execSql(`select string_agg(libelle || ':' || points, ',') from interclub.bloc_palier where bloc_id = '${BLOC}';`),
    ).toBe('Bloc complet:30')

    await page.getByRole('button', { name: 'Supprimer le bloc BE2E bis' }).click()
    await page.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(page.getByLabel('Code du bloc BE2E bis')).toHaveCount(0)
    expect(execSql(`select count(*) from interclub.bloc_palier where bloc_id = '${BLOC}';`)).toBe('0')
  })

  test('supprimer une voie de vitesse (R54)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await ouvrirOnglet(page, /^Vitesse/)
    await page.getByRole('button', { name: 'Supprimer la voie de vitesse E2E' }).click()
    await expect(page.getByText('Ses jetons juges seront aussi supprimés.')).toBeVisible()
    await page.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(page.getByRole('button', { name: 'Supprimer la voie de vitesse E2E' })).toHaveCount(0)
    expect(execSql(`select count(*) from interclub.voie_vitesse where id = '${VITESSE}';`)).toBe('0')
  })

  test('en ③ compétition, plus aucun geste d’édition (R51, R44)', async ({ page }) => {
    poserPhaseAdo('competition')
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await expect(page.getByText('la structure est verrouillée')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Modifier la voie/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Supprimer la voie/ })).toHaveCount(0)
  })
})
