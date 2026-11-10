import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Gabarit : ajout du PREMIER élément d'une épreuve ou d'un bloc vide (constat
 * B1 de l'analyse du 2026-11-10, lot 9). Le prochain `ordre` était lu avec
 * `.single()` : sur un parent vide, l'API répond PGRST116 et l'ajout échouait
 * (écran d'erreur) au lieu de créer l'élément d'ordre 1.
 *
 * Le gabarit adulte est vidé (voies de difficulté, blocs et paliers, voies de
 * vitesse) puis restauré à l'identique depuis une copie : le premier élément
 * de chaque section reçoit l'ordre 1, le suivant l'ordre 2.
 *
 * Série + un seul worker : modifie le gabarit adulte partagé.
 */

const EPREUVE = (type: string) =>
  `(select id from interclub.gabarit_epreuve where categorie = 'adulte' and type = '${type}')`
const TABLES = ['gabarit_voie_difficulte', 'gabarit_bloc', 'gabarit_voie_vitesse'] as const

function sauvegarder(): void {
  execSql(
    `drop table if exists public.e2e_gab_voie, public.e2e_gab_bloc, public.e2e_gab_palier, public.e2e_gab_vitesse;
     create table public.e2e_gab_voie as
       select * from interclub.gabarit_voie_difficulte where gabarit_epreuve_id = ${EPREUVE('voie')};
     create table public.e2e_gab_bloc as
       select * from interclub.gabarit_bloc where gabarit_epreuve_id = ${EPREUVE('bloc')};
     create table public.e2e_gab_palier as
       select p.* from interclub.gabarit_bloc_palier p
        where p.gabarit_bloc_id in (select id from public.e2e_gab_bloc);
     create table public.e2e_gab_vitesse as
       select * from interclub.gabarit_voie_vitesse where gabarit_epreuve_id = ${EPREUVE('vitesse')};`,
  )
}

function vider(): void {
  // Les paliers suivent leurs blocs (on delete cascade).
  execSql(
    TABLES.map(
      (t) =>
        `delete from interclub.${t} where gabarit_epreuve_id = ${EPREUVE(
          t === 'gabarit_voie_difficulte' ? 'voie' : t === 'gabarit_bloc' ? 'bloc' : 'vitesse',
        )};`,
    ).join('\n'),
  )
}

function restaurer(): void {
  vider()
  execSql(
    `insert into interclub.gabarit_voie_difficulte select * from public.e2e_gab_voie;
     insert into interclub.gabarit_bloc select * from public.e2e_gab_bloc;
     insert into interclub.gabarit_bloc_palier select * from public.e2e_gab_palier;
     insert into interclub.gabarit_voie_vitesse select * from public.e2e_gab_vitesse;
     drop table public.e2e_gab_voie, public.e2e_gab_bloc, public.e2e_gab_palier, public.e2e_gab_vitesse;`,
  )
}

/** Section d'une épreuve dans la carte « Gabarit Adulte ». */
function section(page: Page, titre: string) {
  const carte = page.getByRole('heading', { name: 'Gabarit Adulte' }).locator('xpath=../..')
  return carte.locator('section', { has: page.getByRole('heading', { name: titre, exact: true }) })
}

const ordres = (sql: string) => execSql(sql).split('\n').filter(Boolean).join(',')

test.describe('Gabarit — premier élément d’un parent vide (B1)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    sauvegarder()
    vider()
  })

  test.afterAll(() => {
    restaurer()
  })

  test.beforeEach(async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/gabarit')
  })

  test('première puis deuxième voie de difficulté : ordres 1 et 2', async ({ page }) => {
    const voies = section(page, 'Voie de difficulté')
    await expect(voies.getByText('Aucune voie de difficulté.')).toBeVisible()

    for (const cotation of ['5c', '6a']) {
      const ajout = voies.locator('form').last()
      await ajout.getByLabel('Cotation').fill(cotation)
      await ajout.getByLabel('Voie entière').fill('10')
      await ajout.getByRole('button', { name: '+ Voie' }).click()
      await expect(voies.getByText(cotation, { exact: false }).first()).toBeVisible()
    }
    expect(
      ordres(
        `select ordre from interclub.gabarit_voie_difficulte
          where gabarit_epreuve_id = ${EPREUVE('voie')} order by ordre;`,
      ),
    ).toBe('1,2')
  })

  test('premier bloc puis premier palier de ce bloc : ordre 1', async ({ page }) => {
    const blocs = section(page, 'Bloc')
    await expect(blocs.getByText('Aucun bloc.')).toBeVisible()

    const ajoutBloc = blocs.locator('form').last()
    await ajoutBloc.getByLabel('Code').fill('BX1')
    await ajoutBloc.getByRole('button', { name: '+ Bloc' }).click()
    await expect(blocs.getByText('BX1')).toBeVisible()
    await expect(blocs.getByText('Aucun palier.')).toBeVisible()

    await blocs.getByPlaceholder('ex. Zone 1').fill('Top')
    await blocs.getByRole('button', { name: '+ Palier' }).locator('xpath=..').getByLabel('Points').fill('5')
    await blocs.getByRole('button', { name: '+ Palier' }).click()
    await expect(blocs.getByText('Aucun palier.')).toBeHidden()
    await expect(blocs.getByText('Top')).toBeVisible()

    expect(
      ordres(`select ordre from interclub.gabarit_bloc where gabarit_epreuve_id = ${EPREUVE('bloc')};`),
    ).toBe('1')
    expect(
      ordres(
        `select p.ordre from interclub.gabarit_bloc_palier p
           join interclub.gabarit_bloc b on b.id = p.gabarit_bloc_id
          where b.gabarit_epreuve_id = ${EPREUVE('bloc')};`,
      ),
    ).toBe('1')
  })

  test('première puis deuxième voie de vitesse : ordres 1 et 2', async ({ page }) => {
    const vitesse = section(page, 'Vitesse')
    await expect(vitesse.getByText('Aucune voie de vitesse.')).toBeVisible()

    for (const libelle of ['Voie A', 'Voie B']) {
      const ajout = vitesse.getByRole('button', { name: '+ Voie' }).locator('xpath=ancestor::form')
      await ajout.getByLabel('Libellé').fill(libelle)
      await ajout.getByRole('button', { name: '+ Voie' }).click()
      await expect(vitesse.getByRole('button', { name: `Supprimer ${libelle}` })).toBeVisible()
    }
    expect(
      ordres(
        `select ordre from interclub.gabarit_voie_vitesse
          where gabarit_epreuve_id = ${EPREUVE('vitesse')} order by ordre;`,
      ),
    ).toBe('1,2')
  })
})
