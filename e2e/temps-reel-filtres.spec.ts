import type { Page, Request } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { CLUB_A, GRIMPEURS, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 22 — CT-20 et CT-21 (lot 10 du plan « appels Supabase », spec #11
 * rév. 2026-11-10) :
 * - CT-20 (R8bis) : un écran de classement ne se relit que pour une écriture
 *   concernant un grimpeur composé dans SA rencontre ; une saisie dans une autre
 *   rencontre en cours ne le relit plus.
 * - CT-21 (R6bis) : sur l'écran de contrôle, l'écho de ses propres coches ne
 *   relance pas de relecture ; la coche d'un autre admin, si.
 *
 * Relecture = `router.refresh()` = GET `…?_rsc=` sur l'écran observé.
 * Série + un seul worker : mute la phase et les résultats de la rencontre pilote.
 */

const T1 = '99999999-9999-9999-9999-999999999901'
const AUTRE = 'f2f2f2f2-0000-0000-0000-000000000001'
const AUTRE_EPREUVE = 'f2f2f2f2-0000-0000-0000-000000000003'
const AUTRE_VOIE = 'f2f2f2f2-0000-0000-0000-000000000004'
const AUTRE_EQUIPE = 'f2f2f2f2-0000-0000-0000-000000000002'
const AUTRE_GRIMPEUR = 'f2f2f2f2-0000-0000-0000-0000000000a1'

function purger(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id = '${T1}';
     delete from interclub.rencontre where id = '${AUTRE}';
     delete from interclub.grimpeur where id = '${AUTRE_GRIMPEUR}';`,
  )
}

const relectures = (page: Page, chemin: string): Request[] => {
  const liste: Request[] = []
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().includes(chemin) && r.url().includes('_rsc=')) liste.push(r)
  })
  return liste
}

test.describe('Cahier 22 — filtres temps réel du classement et du contrôle (spec #11)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purger()
    poserDate('today')
    // Une AUTRE rencontre en cours le même jour, avec un grimpeur composé.
    execSql(
      `insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
         values ('${AUTRE}', current_date, '${CLUB_A}', 'enfant', 'competition');
       insert into interclub.epreuve (id, rencontre_id, type) values ('${AUTRE_EPREUVE}', '${AUTRE}', 'voie');
       insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, ordre, points)
         select '${AUTRE_VOIE}', '${AUTRE_EPREUVE}', niveau, type_voie, cotation, ordre, points
           from interclub.voie_difficulte where id = '${T1}';
       insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
         values ('${AUTRE_GRIMPEUR}', '${CLUB_A}', 'Ailleurs', 'Zoé', 2015, 'F', 921401);
       insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${AUTRE_EQUIPE}', '${AUTRE}', '${CLUB_A}', 'Ailleurs A');
       insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
         values ('${AUTRE_EQUIPE}', '${AUTRE_GRIMPEUR}', 'T1');`,
    )
  })

  test.afterAll(() => {
    purger()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-20 · une saisie d’une autre rencontre ne relit pas le classement (R8bis)', async ({ page }) => {
    poserPhase('competition')
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}/classement`)
    await expect(page.getByText('En direct', { exact: true })).toBeVisible({ timeout: 15_000 })
    const liste = relectures(page, '/classement')

    // Autre rencontre : grimpeur absent du classement observé → aucune relecture.
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${AUTRE_VOIE}', '${AUTRE_GRIMPEUR}', 'top');`,
    )
    await page.waitForTimeout(2_500)
    expect(liste).toHaveLength(0)

    // Grimpeur de la rencontre observée → relecture.
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${T1}', '${GRIMPEURS.bob}', 'top');`,
    )
    await expect.poll(() => liste.length, { timeout: 10_000 }).toBeGreaterThan(0)
  })

  test('CT-21 · l’écho de mes coches ne relit pas le contrôle ; celle d’un autre, si (R6bis)', async ({
    page,
  }) => {
    execSql(
      `delete from interclub.resultat_voie where voie_difficulte_id = '${T1}';
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${T1}', '${GRIMPEURS.bob}', 'top');`,
    )
    poserPhase('cloture')
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}/controle`)
    await page
      .getByRole('navigation', { name: 'Voies et blocs' })
      .getByRole('button', { name: /^T1\b/ })
      .click()
    await expect(page.getByText('En direct', { exact: true })).toBeVisible({ timeout: 15_000 })
    const liste = relectures(page, '/controle')

    // Ma coche : relue par l'action, son écho temps réel est ignoré.
    const caseBob = page.getByRole('checkbox', { name: 'Contrôlé : Alpha Bob' })
    await caseBob.click()
    await expect(caseBob).toHaveAttribute('aria-checked', 'true')
    await page.waitForTimeout(2_500)
    expect(liste).toHaveLength(0)

    // Décoche puis coche par un AUTRE admin (simulée en base) → relecture.
    execSql(
      `update interclub.resultat_voie
          set controle_le = now(),
              controle_par = (select id from auth.users where email = 'coach@test.local')
        where voie_difficulte_id = '${T1}' and grimpeur_id = '${GRIMPEURS.bob}';`,
    )
    await expect.poll(() => liste.length, { timeout: 10_000 }).toBeGreaterThan(0)
  })
})
