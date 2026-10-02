import { expect, test, type Page } from '@playwright/test'

import { commeAdmin, commeCoach } from './helpers/auth'
import {
  EQUIPES,
  GRIMPEURS,
  JETON,
  POOL_LIBRES,
  RENCONTRE_PILOTE,
  RENCONTRE_PILOTE_DATE,
} from './helpers/donnees'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 21 — vitesse au classement (spec #7 R15–R20, spec #3 R46).
 * Rejoue : barème seedé visible (R46), édition en ① et lecture seule en ③ (R44),
 * temps → points matérialisés et décomposition (R13/R15/R16/R20), ex æquo + saut
 * de rang (R15), chute / non-présentation / à saisir (R17), recalcul de tout le
 * sexe (R19/R20), propagation équipe/club (R3/R5/R6/R18), barème ado (R46),
 * écriture de `points_vitesse` réservée au trigger (R20).
 *
 * Les temps sont saisis par le juge via l'IHM (CT-03) puis posés en SQL pour les
 * variantes : la saisie juge elle-même relève du cahier 20.
 * Série + un seul worker : mute les rencontres seed.
 */

const URL_CLASSEMENT = `/coach/rencontres/${RENCONTRE_PILOTE}/classement`
const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const EPREUVE = '88888888-8888-8888-8888-888888888803'
const EPREUVE_ADO = 'adadadad-0000-0000-0000-0000000000a3'
const NORA = 'adadadad-0000-0000-0000-0000000000c1'
const CHLOE = POOL_LIBRES[0]

function purger(): void {
  execSql(
    `delete from interclub.temps_vitesse where epreuve_id in ('${EPREUVE}','${EPREUVE_ADO}');
     update interclub.epreuve set points_chute = 1, points_non_presentation = 0 where id = '${EPREUVE}';
     update interclub.bareme_vitesse_echelon set points = 15
      where epreuve_id = '${EPREUVE}' and rang_min = 1;`,
  )
}

/** Pose (ou remplace) le résultat de vitesse d'un grimpeur — le trigger recalcule. */
function poserVitesse(grimpeurId: string, issue: 'temps' | 'chute' | 'non_presentation', temps?: number): void {
  execSql(
    `insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, temps, issue)
       values ('${EPREUVE}','${grimpeurId}',${temps ?? 'null'},'${issue}')
     on conflict (epreuve_id, grimpeur_id) do update set temps = excluded.temps, issue = excluded.issue;`,
  )
}

const ligne = (page: Page, texte: string) => page.locator('tbody tr', { hasText: texte })

/** Section « Vitesse » de la décomposition d'un grimpeur (texte complet). */
async function decompositionVitesse(page: Page, nom: string): Promise<string> {
  await ligne(page, nom).click()
  // En-tête « Vitesse · n pts » + carte de détail : on remonte au conteneur.
  const section = page.locator(`xpath=//span[normalize-space()='Vitesse']/../..`)
  const texte = (await section.innerText()).replace(/\s+/g, ' ')
  await page.getByRole('button', { name: '← Retour au classement' }).click()
  return texte
}

async function ouvrirClassement(page: Page, sexe: 'Femmes' | 'Hommes' = 'Femmes', url = URL_CLASSEMENT) {
  await page.goto(url)
  await page.getByRole('button', { name: sexe, exact: true }).click()
}

test.describe('Cahier 21 — vitesse au classement (spec #7, spec #3 R46)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purger()
    nettoyerSessionsQr()
    poserPhase('pre_competition')
    poserDate('today')
  })

  test.afterAll(() => {
    purger()
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  async function ongletVitesse(page: Page, rencontreId = RENCONTRE_PILOTE) {
    await page.goto(`/admin/rencontres/${rencontreId}`)
    await page.getByRole('button', { name: /^Vitesse · \d+$/ }).click()
    await expect(page.getByText('Barème par rang')).toBeVisible()
  }

  test('CT-01 · barème enfant seedé et visible (R46)', async ({ page }) => {
    await commeAdmin(page)
    await ongletVitesse(page)
    // ① : éditable — 1er échelon 1–5 / 15 / décr. 1, dernier « 46 et + » = 2.
    await expect(page.getByLabel('Rang minimum').first()).toHaveValue('1')
    await expect(page.getByLabel('Rang maximum (vide = et +)').first()).toHaveValue('5')
    await expect(page.getByLabel('Points').first()).toHaveValue('15')
    await expect(page.getByLabel('Décrément').first()).toHaveValue('1')
    await expect(page.getByLabel('Rang minimum')).toHaveCount(10)
    await expect(page.getByLabel('Rang minimum').last()).toHaveValue('46')
    await expect(page.getByLabel('Rang maximum (vide = et +)').last()).toHaveValue('')
    await expect(page.getByLabel('Points').last()).toHaveValue('2')
    await expect(page.locator('input[name="pointsChute"]')).toHaveValue('1')
    await expect(page.locator('input[name="pointsNonPresentation"]')).toHaveValue('0')
    await expect(page.getByText(/points − \(rang − rang min\) × décrément/)).toBeVisible()
  })

  test('CT-02 · édition en ①, lecture seule en ③ (R46, R44)', async ({ page, browser }) => {
    await commeAdmin(page)
    await ongletVitesse(page)
    await page.locator('input[name="pointsChute"]').fill('2')
    await page.getByLabel('Points').first().fill('20')
    await page.getByRole('button', { name: 'Enregistrer le barème' }).click()
    await expect(page.getByText('Barème de vitesse mis à jour.')).toBeVisible()
    await ongletVitesse(page)
    await expect(page.locator('input[name="pointsChute"]')).toHaveValue('2')
    await expect(page.getByLabel('Points').first()).toHaveValue('20')

    // Rétablir (Chute 1, points 15).
    await page.locator('input[name="pointsChute"]').fill('1')
    await page.getByLabel('Points').first().fill('15')
    await page.getByRole('button', { name: 'Enregistrer le barème' }).click()
    await expect(page.getByText('Barème de vitesse mis à jour.')).toBeVisible()
    expect(
      execSql(`select points_chute from interclub.epreuve where id = '${EPREUVE}';`),
    ).toBe('1')

    // ③ : lecture seule (pas de champ ni de bouton).
    poserPhase('competition')
    await ongletVitesse(page)
    await expect(page.locator('input[name="pointsChute"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Enregistrer le barème' })).toHaveCount(0)

    // Le coach n'a pas accès à l'écran admin de la rencontre.
    const ctx = await browser.newContext()
    const coach = await ctx.newPage()
    await commeCoach(coach)
    expect((await coach.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`))?.status()).toBe(404)
    await ctx.close()
  })

  test('CT-03 · un temps saisi par le juge matérialise les points (R13, R15, R16, R20)', async ({
    page,
    browser,
  }) => {
    const ctxJuge = await browser.newContext()
    const juge = await ctxJuge.newPage()
    await juge.goto(`/scan?jeton=${JETON.juge}`)
    await juge.waitForURL('**/juge')
    await juge.getByLabel('Temps de Alpha Ana').fill('8.100')
    await juge.locator('li', { hasText: 'Alpha Ana' }).getByRole('button', { name: 'OK' }).click()
    await expect(juge.locator('li', { hasText: 'Alpha Ana' }).locator('span.rounded-full')).toHaveText(
      '8,100 s',
    )
    await ctxJuge.close()
    expect(
      execSql(
        `select rang || '|' || points from interclub.points_vitesse
          where epreuve_id = '${EPREUVE}' and grimpeur_id = '${GRIMPEURS.ana}';`,
      ),
    ).toBe('1|15')

    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Ana Alpha')).toContainText('15pts')
    await expect(ligne(page, 'Ana Alpha')).toContainText('vit 15')
    const vitesse = await decompositionVitesse(page, 'Ana Alpha')
    expect(vitesse).toContain('#1')
    expect(vitesse).toContain('8,100 s')
    expect(vitesse).toMatch(/15\s*pts$/)
  })

  test('CT-04 · ex æquo de temps et saut de rang (R15)', async ({ page }) => {
    // 3ᵉ fille engagée (Chloé, A2) pour observer le rang sauté.
    execSql(
      `insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
         values ('${EQUIPES.A2}','${CHLOE.id}','M2') on conflict do nothing;`,
    )
    poserVitesse(GRIMPEURS.cleo, 'temps', 8.1)
    poserVitesse(CHLOE.id, 'temps', 8.5)
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Ana Alpha').locator('td').first()).toHaveText('1')
    await expect(ligne(page, 'Cléo Bravo').locator('td').first()).toHaveText('1')
    await expect(ligne(page, 'Cléo Bravo')).toContainText('vit 15')
    await expect(ligne(page, 'Chloé Alpha').locator('td').first()).toHaveText('3')
    await expect(ligne(page, 'Chloé Alpha')).toContainText('vit 13')
    expect(await decompositionVitesse(page, 'Chloé Alpha')).toContain('#3')
  })

  test('CT-05 · chute, non-présentation, à saisir (R17)', async ({ page }) => {
    poserVitesse(GRIMPEURS.bob, 'chute')
    poserVitesse(GRIMPEURS.cleo, 'non_presentation')
    execSql(`delete from interclub.temps_vitesse where grimpeur_id = '${CHLOE.id}';`)
    await commeCoach(page)
    await ouvrirClassement(page, 'Hommes')
    const bob = await decompositionVitesse(page, 'Bob Alpha')
    expect(bob).toMatch(/—\s*Chute\s*1\s*pts$/)

    await page.getByRole('button', { name: 'Femmes', exact: true }).click()
    expect(await decompositionVitesse(page, 'Cléo Bravo')).toMatch(/—\s*Non-présentation\s*0\s*pts$/)
    await page.getByRole('button', { name: 'Femmes', exact: true }).click()
    expect(await decompositionVitesse(page, 'Chloé Alpha')).toMatch(/—\s*À saisir\s*0\s*pts$/)
    expect(
      execSql(
        `select count(*) from interclub.points_vitesse
          where epreuve_id = '${EPREUVE}' and grimpeur_id = '${CHLOE.id}';`,
      ),
    ).toBe('0')
  })

  test('CT-06 · un seul temps recalcule tout le sexe (R19, R20)', async ({ page }) => {
    poserVitesse(GRIMPEURS.cleo, 'temps', 8.3)
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Ana Alpha')).toContainText('vit 15')
    await expect(ligne(page, 'Cléo Bravo')).toContainText('vit 14')

    poserVitesse(GRIMPEURS.cleo, 'temps', 8.0) // seule Cléo change…
    await page.reload()
    await page.getByRole('button', { name: 'Femmes', exact: true }).click()
    await expect(ligne(page, 'Cléo Bravo')).toContainText('vit 15')
    await expect(ligne(page, 'Ana Alpha')).toContainText('vit 14') // …Ana recule aussi
  })

  test('CT-07 · la vitesse se propage aux équipes et clubs (R3, R5, R6, R18)', async ({ page }) => {
    // Ana 14 + Bob 1 (A1) ; Chloé 0 (A2) ; Cléo 15 (B1) — aucun résultat voie/bloc.
    await commeCoach(page)
    await ouvrirClassement(page)
    await page.getByRole('button', { name: 'Par équipe' }).click()
    await expect(ligne(page, 'Équipe A1')).toContainText('15pts')
    await expect(ligne(page, 'Équipe B1')).toContainText('15pts')
    await page.getByRole('button', { name: 'Par club' }).click()
    await expect(ligne(page, 'Club A')).toContainText('15pts')
    await expect(ligne(page, 'Club B')).toContainText('15pts')

    // Un meilleur temps de Bob réordonne les clubs.
    poserVitesse(GRIMPEURS.bob, 'temps', 7.0) // seul garçon chronométré → 15
    await page.reload()
    await page.getByRole('button', { name: 'Par club' }).click()
    await expect(ligne(page, 'Club A')).toContainText('29pts') // 14 + 15
    await expect(ligne(page, 'Club A').locator('td').first()).toHaveText('1')
    await expect(ligne(page, 'Club B').locator('td').first()).toHaveText('2')
  })

  test('CT-08 · barème ado : 1er = 60, chute = 5 (R46)', async ({ page, browser }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${ADO}`)
    await page.getByRole('button', { name: /^Vitesse · \d+$/ }).click()
    // Rencontre ado en ③ : barème en lecture seule.
    const bareme = page.locator('form', { has: page.getByText('Barème par rang') })
    await expect(bareme.locator('tbody tr').first()).toContainText(/1.*5.*60\s*1/)
    await expect(bareme).toContainText(/Chute\s*5/)

    poserVitesseAdo(NORA, 'temps', 9.0)
    const ctx = await browser.newContext()
    const coach = await ctx.newPage()
    await commeCoach(coach)
    await ouvrirClassement(coach, 'Femmes', `/coach/rencontres/${ADO}/classement`)
    await expect(ligne(coach, 'Nora Delta')).toContainText('vit 60')
    poserVitesseAdo(NORA, 'chute')
    await coach.reload()
    await expect(ligne(coach, 'Nora Delta')).toContainText('vit 5')
    await ctx.close()
  })

  test('CT-09 · points_vitesse : aucune écriture applicative, trigger seul (R20)', async () => {
    expect(
      execSql(
        `select string_agg(cmd, ',' order by cmd) from pg_policies
          where schemaname = 'interclub' and tablename = 'points_vitesse';`,
      ),
    ).toBe('SELECT')
    const coach = execSql(`select id from auth.users where email = 'coach@test.local';`)
    let refus = ''
    try {
      execSql(
        `begin;
         select set_config('request.jwt.claims', '{"sub":"${coach}","role":"authenticated"}', true);
         set local role authenticated;
         insert into interclub.points_vitesse (epreuve_id, grimpeur_id, rang, points)
           values ('${EPREUVE}','${GRIMPEURS.ana}',1,99);
         rollback;`,
      )
    } catch (e) {
      refus = String(e)
    }
    expect(refus).toMatch(/permission denied|row-level security/)
  })
})

function poserVitesseAdo(grimpeurId: string, issue: 'temps' | 'chute', temps?: number): void {
  execSql(
    `insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, temps, issue)
       values ('${EPREUVE_ADO}','${grimpeurId}',${temps ?? 'null'},'${issue}')
     on conflict (epreuve_id, grimpeur_id) do update set temps = excluded.temps, issue = excluded.issue;`,
  )
}
