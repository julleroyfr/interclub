import type { Page } from '@playwright/test'

import { commeAdmin } from './helpers/auth'
import { CLUB_B, EQUIPES, GRIMPEURS, RENCONTRE_PILOTE } from './helpers/donnees'
import { expect, test } from './helpers/fixtures'
import { execSql } from './helpers/sql'

// Cahier 12 CT-29 (+ CT-26 étape 2) — tableau de bord d'une rencontre en
// onglets (spec #3 R41k). La résolution de `?onglet=` est couverte en Vitest
// (`tableau-de-bord.test.ts`) ; ici, le comportement d'écran.

const URL_ENFANT = `/admin/rencontres/${RENCONTRE_PILOTE}`
const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const ADULTE = 'adadad00-0000-0000-0000-0000000000b4'

const onglets = (page: Page) => page.getByRole('tablist', { name: 'Sections de la rencontre' })
const onglet = (page: Page, nom: RegExp) => onglets(page).getByRole('tab', { name: nom })

async function libellesOnglets(page: Page): Promise<string[]> {
  return (await onglets(page).getByRole('tab').allInnerTexts()).map((t) =>
    t.replace(/\s*\d+$/, '').trim(),
  )
}

test.describe('Cahier 12 CT-29 — tableau de bord en onglets (R41k)', () => {
  test.describe.configure({ mode: 'serial' })

  let groupeCleo = ''

  test.beforeAll(() => {
    execSql(
      `delete from interclub.rencontre where id = '${ADULTE}';
       insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
         values ('${ADULTE}', '2027-03-13', '${CLUB_B}', 'adulte', 'pre_competition');`,
    )
    groupeCleo = execSql(
      `select coalesce(groupe_depart, '') from interclub.composition
        where equipe_id = '${EQUIPES.B1}' and grimpeur_id = '${GRIMPEURS.cleo}';`,
    )
  })

  test.afterAll(() => {
    execSql(
      `delete from interclub.rencontre where id = '${ADULTE}';
       update interclub.composition set groupe_depart = ${groupeCleo ? `'${groupeCleo}'` : 'null'}
        where equipe_id = '${EQUIPES.B1}' and grimpeur_id = '${GRIMPEURS.cleo}';
       update interclub.voie_difficulte v set repere = null
         from interclub.epreuve e
        where v.epreuve_id = e.id and e.rencontre_id = '${RENCONTRE_PILOTE}';`,
    )
  })

  test('enfant : cinq onglets, Vue d’ensemble par défaut avec le lien QR (étape 1)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_ENFANT)
    expect(await libellesOnglets(page)).toEqual([
      'Vue d’ensemble',
      'Structure',
      'Équipes',
      'Prêts',
      'Statistiques',
    ])
    await expect(onglet(page, /^Vue d’ensemble/)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('link', { name: /^QR codes Coach/ })).toBeVisible()
    // Les autres panneaux sont masqués.
    await expect(page.getByRole('button', { name: /^Voies de difficulté/ })).toBeHidden()
  })

  test('changer d’onglet met l’URL à jour ; l’onglet survit à une action et au rechargement (étapes 2–3)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_ENFANT)
    await onglet(page, /^Structure/).click()
    await expect(page).toHaveURL(/\?onglet=structure$/)
    await expect(page.getByRole('button', { name: /^Voies de difficulté/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^QR codes Coach/ })).toBeHidden()

    const champ = page.getByLabel('Repère de la voie M1')
    await champ.fill('Relais 1')
    await champ
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: /^Enregistrer le repère/ })
      .click()
    await expect(page.getByText('M1 Relais 1', { exact: true }).first()).toBeVisible()
    await expect(onglet(page, /^Structure/)).toHaveAttribute('aria-selected', 'true')

    await page.reload()
    await expect(onglet(page, /^Structure/)).toHaveAttribute('aria-selected', 'true')
  })

  test('onglet inconnu ou absent → Vue d’ensemble (étapes 4–6)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`${URL_ENFANT}?onglet=pirate`)
    await expect(onglet(page, /^Vue d’ensemble/)).toHaveAttribute('aria-selected', 'true')

    await page.goto(`/admin/rencontres/${ADO}?onglet=statistiques`)
    expect(await libellesOnglets(page)).toEqual(['Vue d’ensemble', 'Structure', 'Équipes', 'Prêts'])
    await expect(onglet(page, /^Vue d’ensemble/)).toHaveAttribute('aria-selected', 'true')

    await page.goto(`/admin/rencontres/${ADULTE}?onglet=prets`)
    expect(await libellesOnglets(page)).toEqual(['Vue d’ensemble', 'Structure', 'Équipes'])
    await expect(onglet(page, /^Vue d’ensemble/)).toHaveAttribute('aria-selected', 'true')
  })

  test('clavier : flèches et Début/Fin (étape 7)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ENFANT)
    await onglet(page, /^Vue d’ensemble/).focus()
    await page.keyboard.press('ArrowRight')
    await expect(onglet(page, /^Structure/)).toBeFocused()
    await expect(onglet(page, /^Structure/)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(onglet(page, /^Statistiques/)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(onglet(page, /^Vue d’ensemble/)).toHaveAttribute('aria-selected', 'true')
  })

  test('CT-26 étape 2 : un club « sans groupe » ouvre l’onglet Équipes sur son bloc (R41h)', async ({
    page,
  }) => {
    execSql(
      `update interclub.composition set groupe_depart = null
        where equipe_id = '${EQUIPES.B1}' and grimpeur_id = '${GRIMPEURS.cleo}';`,
    )
    await commeAdmin(page)
    await page.goto(`${URL_ENFANT}?onglet=statistiques`)
    await page.getByRole('link', { name: /^Club B/ }).click()
    await expect(onglet(page, /^Équipes/)).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\?onglet=equipes#club-/)
    await expect(page.locator('details[data-club="Club B"]')).toHaveAttribute('open', '')
  })
})
