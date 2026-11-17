import type { Locator, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { GRIMPEURS, RENCONTRE_PILOTE } from './helpers/donnees'
import { execSql } from './helpers/sql'

/**
 * Cahier 17 CT-25…CT-27 et cahier 19 CT-12 — effacer une saisie (spec #6
 * R13ter, spec #9 R8). Rencontre pilote (enfant), grimpeuse Ana (groupe M2 →
 * M2·M3·M4) : Top saisi par erreur sur M3 puis effacé ; bloc B1 saisi puis
 * effacé ; pas de bouton sur une ligne « à saisir » ; effacement admin. Les
 * contrôles en base (heure de saisie, club, phase) sont couverts par
 * `npm run test:effacer-saisie`.
 *
 * Non destructif : ne touche qu'aux résultats d'Ana, sauvegardés au début et
 * restaurés à la fin avec la phase et la date de la rencontre.
 */

const URL_COACH = `/coach/rencontres/${RENCONTRE_PILOTE}/resultats`
const URL_ADMIN = `/admin/rencontres/${RENCONTRE_PILOTE}/resultats`
const ANA = GRIMPEURS.ana
const VOIES_PILOTE = `select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
   where e.rencontre_id = '${RENCONTRE_PILOTE}'`
const BLOCS_PILOTE = `select b.id from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
   where e.rencontre_id = '${RENCONTRE_PILOTE}'`

let sauvegarde = { voies: '[]', blocs: '[]', phase: 'competition', date: '' }

function effacerAna(): void {
  execSql(
    `delete from interclub.resultat_voie where grimpeur_id = '${ANA}' and voie_difficulte_id in (${VOIES_PILOTE});
     delete from interclub.resultat_bloc where grimpeur_id = '${ANA}' and bloc_id in (${BLOCS_PILOTE});`,
  )
}

/** Résultats d'Ana : « code:issue » triés, '' si aucun. */
function resultatsAna(): string {
  return execSql(
    `select coalesce(string_agg(c || ':' || i, ',' order by c), '') from (
       select v.niveau c, r.issue i from interclub.resultat_voie r
         join interclub.voie_difficulte v on v.id = r.voie_difficulte_id
        where r.grimpeur_id = '${ANA}' and v.id in (${VOIES_PILOTE})
       union all
       select b.code, r.issue from interclub.resultat_bloc r join interclub.bloc b on b.id = r.bloc_id
        where r.grimpeur_id = '${ANA}' and b.id in (${BLOCS_PILOTE})) s;`,
  )
}

function ligne(page: Page, section: 'Voie de difficulté' | 'Bloc', code: string): Locator {
  return page
    .locator('div.rounded-2xl', { has: page.getByRole('heading', { name: section, exact: true }) })
    .locator('li')
    .filter({ has: page.locator('span.min-w-9', { hasText: new RegExp(`^${code}$`) }) })
}

async function enregistre(page: Page): Promise<void> {
  await expect(page.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
}

async function ouvrirAna(page: Page): Promise<void> {
  await page.goto(URL_COACH)
  await page.getByRole('button', { name: /^Ana Alpha/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
}

test.describe('Effacer une saisie (spec #6 R13ter)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    sauvegarde = {
      voies: execSql(
        `select coalesce(json_agg(r), '[]') from interclub.resultat_voie r
          where grimpeur_id = '${ANA}' and voie_difficulte_id in (${VOIES_PILOTE});`,
      ),
      blocs: execSql(
        `select coalesce(json_agg(r), '[]') from interclub.resultat_bloc r
          where grimpeur_id = '${ANA}' and bloc_id in (${BLOCS_PILOTE});`,
      ),
      phase: execSql(`select phase from interclub.rencontre where id = '${RENCONTRE_PILOTE}';`),
      date: execSql(`select date_rencontre from interclub.rencontre where id = '${RENCONTRE_PILOTE}';`),
    }
    effacerAna()
    execSql(`update interclub.rencontre set phase = 'competition' where id = '${RENCONTRE_PILOTE}';`)
  })

  test.afterEach(async ({ page }) => {
    await enregistre(page)
  })

  test.afterAll(() => {
    effacerAna()
    execSql(
      `insert into interclub.resultat_voie select * from json_populate_recordset(null::interclub.resultat_voie, '${sauvegarde.voies}');
       insert into interclub.resultat_bloc select * from json_populate_recordset(null::interclub.resultat_bloc, '${sauvegarde.blocs}');
       update interclub.rencontre set phase = '${sauvegarde.phase}', date_rencontre = '${sauvegarde.date}'
        where id = '${RENCONTRE_PILOTE}';`,
    )
  })

  test('CT-25 · pas de bouton Effacer sur une ligne « à saisir » (R13ter a)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirAna(page)
    await expect(ligne(page, 'Voie de difficulté', 'M3').getByRole('button', { name: /^Effacer/ })).toHaveCount(0)
    await expect(ligne(page, 'Bloc', 'B1').getByRole('button', { name: /^Effacer/ })).toHaveCount(0)
  })

  test('CT-26 · Top sur la mauvaise voie enfant, effacé : la ligne revient « à saisir » (R13ter a/b)', async ({
    page,
  }) => {
    await commeCoach(page)
    await ouvrirAna(page)
    const m3 = ligne(page, 'Voie de difficulté', 'M3')
    await m3.getByRole('button', { name: 'Top', exact: true }).click()
    await enregistre(page)
    expect(resultatsAna()).toBe('M3:top')

    await m3.getByRole('button', { name: 'Effacer le résultat de la voie M3' }).click()
    await enregistre(page)
    expect(resultatsAna()).toBe('')
    // La ligne reste (une des 3 attendues), sans pastille ni bouton Effacer.
    await expect(m3).toBeVisible()
    await expect(m3.locator('span.rounded-full')).toHaveCount(0)
    await expect(m3.getByRole('button', { name: /^Effacer/ })).toHaveCount(0)
  })

  test('CT-27 · bloc saisi puis effacé (R13ter a/b)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirAna(page)
    const b1 = ligne(page, 'Bloc', 'B1')
    await b1.getByRole('button', { name: '1er essai', exact: true }).click()
    await enregistre(page)
    expect(resultatsAna()).toBe('B1:palier')

    await b1.getByRole('button', { name: 'Effacer le résultat du bloc B1' }).click()
    await enregistre(page)
    expect(resultatsAna()).toBe('')
    await expect(b1.locator('span.rounded-full')).toHaveCount(0)
  })

  test('cahier 19 CT-12 · l’admin efface une voie et un bloc (spec #9 R8)', async ({ page }) => {
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('99999999-9999-9999-9999-999999999913', '${ANA}', 'echec');
       insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue)
         values ('99999999-9999-9999-9999-999999999903', '${ANA}', 'echec');`,
    )
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await page.locator('li > button').filter({ hasText: 'Ana Alpha' }).click()
    await ligne(page, 'Voie de difficulté', 'M3').getByRole('button', { name: 'Effacer le résultat de la voie M3' }).click()
    await expect.poll(resultatsAna).toBe('B2:echec')
    await ligne(page, 'Bloc', 'B2').getByRole('button', { name: 'Effacer le résultat du bloc B2' }).click()
    await expect.poll(resultatsAna).toBe('')
  })
})
