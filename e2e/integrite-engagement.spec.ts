import type { APIRequestContext, APIResponse, Locator, Page } from '@playwright/test'

import { infosApi } from './helpers/api'
import { commeAdmin } from './helpers/auth'
import { COMPTES, EQUIPES, GRIMPEURS, RENCONTRE_PILOTE } from './helpers/donnees'
import { expect, test } from './helpers/fixtures'
import { execSql, poserPhase, reinitialiserEngagement } from './helpers/sql'

// Intégrité de l'engagement et des résultats — lot 4 de la revue du 2026-10-03
// (migration 202610031200), révisions validées le 2026-10-03 :
//   - cahier 15 CT-06/CT-07 : changement d'équipe admin (spec #3 R41d, spec #10 R18bis) ;
//   - cahier 17 CT-16 : plafond de 6 voies ado garanti en base (spec #6 R14) ;
//   - cahier 20 CT-12/CT-13 : vitesse réservée aux engagés, purge au retrait
//     (spec #10 R7bis/R18).
// Série + un seul worker : mute la rencontre pilote et la rencontre ado.

const EPREUVE_VITESSE = '88888888-8888-8888-8888-888888888803'
const RENCONTRE_ADO = 'adadadad-adad-adad-adad-adadadadadad'
const EPREUVE_VOIE_ADO = 'adadadad-0000-0000-0000-0000000000a1'

async function jetonDe(request: APIRequestContext, email: string, mdp: string) {
  const { url, anon } = infosApi()
  const rep = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    data: { email, password: mdp },
  })
  expect(rep.ok()).toBe(true)
  return (await rep.json()).access_token as string
}

function entetes(jeton: string, prefer = 'return=representation') {
  return {
    apikey: infosApi().anon,
    Authorization: `Bearer ${jeton}`,
    'Content-Profile': 'interclub',
    'Content-Type': 'application/json',
    Prefer: prefer,
  }
}

/** Refus d'un trigger d'intégrité (check_violation 23514) portant `message`. */
async function attendreRefusIntegrite(rep: APIResponse, message: string) {
  expect(rep.status()).toBe(400)
  const corps = await rep.json()
  expect(corps.code).toBe('23514')
  expect(corps.message).toBe(message)
}

const compter = (sql: string) => Number(execSql(sql))

const carteClub = (page: Page, nom: string): Locator => page.locator(`details[data-club="${nom}"]`)

test.describe.configure({ mode: 'serial' })

test.describe('Intégrité engagement & résultats (revue 2026-10-03, lot 4)', () => {
  let jetonAdmin: string
  let jetonCoach: string

  test.beforeAll(async ({ request }) => {
    jetonAdmin = await jetonDe(request, COMPTES.admin.email, COMPTES.admin.mdp)
    jetonCoach = await jetonDe(request, COMPTES.coach.email, COMPTES.coach.mdp)
  })

  test.describe('Changement d’équipe et vitesse — rencontre pilote', () => {
    test.beforeEach(() => {
      // Baseline : A1 = {Ana (M2), Bob}, A2 vide, B1 = {Cléo} ; aucun temps.
      execSql(`delete from interclub.temps_vitesse where epreuve_id = '${EPREUVE_VITESSE}';`)
      reinitialiserEngagement()
      poserPhase('competition')
    })

    test.afterAll(() => {
      execSql(`delete from interclub.temps_vitesse where epreuve_id = '${EPREUVE_VITESSE}';`)
      reinitialiserEngagement()
      poserPhase('pre_competition')
    })

    test('cahier 15 CT-06 — changement dans le club d’affectation, résultats conservés (spec #3 R41d, spec #10 R18bis)', async ({
      page,
    }) => {
      execSql(
        `insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
         values ('${EPREUVE_VITESSE}', '${GRIMPEURS.ana}', 'temps', 9.5);`,
      )
      await commeAdmin(page)
      await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
      const clubA = carteClub(page, 'Club A')
      await clubA.locator('summary').first().click()

      const equipeA1 = clubA.locator('[data-equipe="Équipe A1"]')
      const choix = equipeA1.getByLabel(/Changer Ana Alpha d.équipe/)
      // Seule A2 est proposée : ni A1 (actuelle) ni B1 (autre club).
      await expect(choix.locator('option:not([disabled])')).toHaveText(['Équipe A2'])

      await choix.selectOption({ label: 'Équipe A2' })
      await equipeA1
        .locator('form')
        .filter({ has: page.getByLabel(/Changer Ana Alpha d.équipe/) })
        .getByRole('button', { name: /Changer d.équipe/ })
        .click()

      const equipeA2 = clubA.locator('[data-equipe="Équipe A2"]')
      await expect(equipeA2.locator('li', { hasText: 'Ana Alpha' })).toBeVisible()
      await expect(equipeA1.locator('li', { hasText: 'Ana Alpha' })).toHaveCount(0)

      // Mise à jour, pas retrait + ajout : groupe et vitesse conservés.
      expect(
        execSql(
          `select equipe_id || '|' || coalesce(groupe_depart, '') from interclub.composition
            where rencontre_id = '${RENCONTRE_PILOTE}' and grimpeur_id = '${GRIMPEURS.ana}';`,
        ),
      ).toBe(`${EQUIPES.A2}|M2`)
      expect(
        compter(
          `select count(*) from interclub.temps_vitesse
            where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${GRIMPEURS.ana}';`,
        ),
      ).toBe(1)
      expect(
        compter(
          `select count(*) from interclub.points_vitesse
            where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${GRIMPEURS.ana}';`,
        ),
      ).toBe(1)
    })

    test('cahier 15 CT-07 — hors club refusé par la base ; club à une seule équipe (spec #3 R41d)', async ({
      page,
      request,
    }) => {
      await commeAdmin(page)
      await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
      const clubB = carteClub(page, 'Club B')
      await clubB.locator('summary').first().click()
      await expect(clubB.locator('li', { hasText: 'Cléo Bravo' }).first()).toBeVisible()
      // Club B n'a que B1 : aucune action de changement d'équipe.
      await expect(clubB.getByLabel(/Changer .* d.équipe/)).toHaveCount(0)

      const rep = await request.patch(
        `${infosApi().url}/rest/v1/composition?equipe_id=eq.${EQUIPES.A1}&grimpeur_id=eq.${GRIMPEURS.ana}`,
        { headers: entetes(jetonAdmin), data: { equipe_id: EQUIPES.B1 } },
      )
      await attendreRefusIntegrite(rep, 'changement_equipe_hors_club')
      expect(
        execSql(
          `select equipe_id from interclub.composition
            where rencontre_id = '${RENCONTRE_PILOTE}' and grimpeur_id = '${GRIMPEURS.ana}';`,
        ),
      ).toBe(EQUIPES.A1)
    })

    test('cahier 20 CT-12 — résultat de vitesse refusé pour un non-engagé (spec #10 R7bis)', async ({
      request,
    }) => {
      const rep = await request.post(`${infosApi().url}/rest/v1/temps_vitesse`, {
        headers: entetes(jetonAdmin),
        data: {
          epreuve_id: EPREUVE_VITESSE,
          grimpeur_id: GRIMPEURS.devi,
          issue: 'temps',
          temps: 9.1,
        },
      })
      await attendreRefusIntegrite(rep, 'grimpeur_non_engage')
      expect(
        compter(
          `select count(*) from interclub.temps_vitesse where grimpeur_id = '${GRIMPEURS.devi}';`,
        ),
      ).toBe(0)
    })

    test('cahier 20 CT-13 — retrait d’un grimpeur chronométré : résultat supprimé, rangs recalculés (spec #10 R18)', async ({
      page,
    }) => {
      // Deux grimpeuses : Ana 8,000 s (rang 1), Cléo 9,000 s (rang 2).
      execSql(
        `insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps) values
           ('${EPREUVE_VITESSE}', '${GRIMPEURS.ana}', 'temps', 8.0),
           ('${EPREUVE_VITESSE}', '${GRIMPEURS.cleo}', 'temps', 9.0);`,
      )
      const rangCleo = () =>
        execSql(
          `select rang from interclub.points_vitesse
            where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${GRIMPEURS.cleo}';`,
        )
      expect(rangCleo()).toBe('2')

      await commeAdmin(page)
      await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
      const clubA = carteClub(page, 'Club A')
      await clubA.locator('summary').first().click()
      const equipeA1 = clubA.locator('[data-equipe="Équipe A1"]')
      await equipeA1.getByRole('button', { name: 'Retirer Ana Alpha' }).click()
      await expect(equipeA1.locator('li', { hasText: 'Ana Alpha' })).toHaveCount(0)

      expect(
        compter(
          `select (select count(*) from interclub.temps_vitesse where grimpeur_id = '${GRIMPEURS.ana}')
                + (select count(*) from interclub.points_vitesse where grimpeur_id = '${GRIMPEURS.ana}');`,
        ),
      ).toBe(0)
      expect(rangCleo()).toBe('1')
    })
  })

  test.describe('cahier 17 CT-16 — plafond de 6 voies ado garanti en base (spec #6 R14)', () => {
    let grimpeur: string
    let voies: string[]

    const purger = () =>
      execSql(`delete from interclub.resultat_voie where grimpeur_id = '${grimpeur}';`)

    test.beforeAll(() => {
      execSql(`update interclub.rencontre set phase = 'competition' where id = '${RENCONTRE_ADO}';`)
      grimpeur = execSql(
        `select grimpeur_id from interclub.composition
          where rencontre_id = '${RENCONTRE_ADO}' order by grimpeur_id limit 1;`,
      )
      voies = execSql(
        `select id from interclub.voie_difficulte
          where epreuve_id = '${EPREUVE_VOIE_ADO}' order by ordre, id limit 7;`,
      ).split('\n')
      expect(voies).toHaveLength(7)
      purger()
      execSql(
        `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         select unnest(array['${voies.slice(0, 6).join("','")}']::uuid[]), '${grimpeur}', 'top';`,
      )
    })

    test.afterAll(() => purger())

    test('7ᵉ voie refusée par la base ; correction d’une voie saisie permise', async ({
      request,
    }) => {
      const { url } = infosApi()
      const nbVoies = () =>
        compter(`select count(*) from interclub.resultat_voie where grimpeur_id = '${grimpeur}';`)

      const septieme = await request.post(`${url}/rest/v1/resultat_voie`, {
        headers: entetes(jetonCoach),
        data: { voie_difficulte_id: voies[6], grimpeur_id: grimpeur, issue: 'top' },
      })
      await attendreRefusIntegrite(septieme, 'plafond_voies_ado')
      expect(nbVoies()).toBe(6)

      const correction = await request.post(
        `${url}/rest/v1/resultat_voie?on_conflict=voie_difficulte_id,grimpeur_id`,
        {
          headers: entetes(jetonCoach, 'resolution=merge-duplicates,return=representation'),
          data: { voie_difficulte_id: voies[0], grimpeur_id: grimpeur, issue: 'echec' },
        },
      )
      // Upsert qui met à jour une ligne existante : PostgREST répond 200.
      expect(correction.status()).toBe(200)
      expect((await correction.json())[0].issue).toBe('echec')
      expect(nbVoies()).toBe(6)
    })
  })
})
