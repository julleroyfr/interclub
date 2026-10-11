import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { CLUB_B, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Classement au-delà du plafond de l'API (spec #7 R3/R5/R6 ; constat J1 de
 * l'analyse du 2026-10-09, lot 1 du plan « appels Supabase »). L'API renvoie au
 * plus 1000 lignes par lecture : sans pagination, les résultats au-delà sont
 * ignorés SANS erreur et le classement est faux.
 *
 * 80 grimpeuses (Club B, équipe dédiée) ont toutes « top » sur les 14 voies de
 * la rencontre pilote (barème 1 à 14 pts, soit 105 pts chacune) : 1120 résultats
 * de voie. Attendu : équipe et club à 80 × 105 = 8400 pts.
 *
 * Série + un seul worker : mute la rencontre pilote.
 */

const URL_ADMIN = `/admin/rencontres/${RENCONTRE_PILOTE}/classement`
const EQUIPE_VOLUME = '77777777-7777-7777-7777-7777777777c1'
const NB_GRIMPEUSES = 80
const POINTS_PAR_GRIMPEUSE = 105 // 1 + 2 + … + 14
/** Identifiants `c0000000-…-000000000001` à `…080`. */
const ID_GRIMPEUSE = `('c0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid`

function purgerVolume(): void {
  execSql(
    `delete from interclub.resultat_voie where grimpeur_id in (
       select grimpeur_id from interclub.composition where equipe_id = '${EQUIPE_VOLUME}');
     delete from interclub.composition where equipe_id = '${EQUIPE_VOLUME}';
     delete from interclub.equipe where id = '${EQUIPE_VOLUME}';
     delete from interclub.grimpeur where id::text like 'c0000000-0000-0000-0000-%';`,
  )
}

test.describe('Classement au-delà de 1000 résultats (spec #7, J1)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerVolume()
    poserPhase('competition')
    poserDate('today')
    execSql(
      `insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${EQUIPE_VOLUME}','${RENCONTRE_PILOTE}','${CLUB_B}','Équipe Volume');
       insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
         select ${ID_GRIMPEUSE}, '${CLUB_B}', 'Volume' || lpad(i::text, 3, '0'), 'Zoé', 2016, 'F', 9997000 + i
           from generate_series(1, ${NB_GRIMPEUSES}) i;
       insert into interclub.composition (equipe_id, grimpeur_id)
         select '${EQUIPE_VOLUME}', ${ID_GRIMPEUSE} from generate_series(1, ${NB_GRIMPEUSES}) i;
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         select v.id, ${ID_GRIMPEUSE}, 'top'
           from generate_series(1, ${NB_GRIMPEUSES}) i
           cross join interclub.voie_difficulte v
           join interclub.epreuve e on e.id = v.epreuve_id
          where e.rencontre_id = '${RENCONTRE_PILOTE}';`,
    )
  })

  test.afterAll(() => {
    purgerVolume()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('le jeu dépasse bien le plafond de l’API', () => {
    const nb = Number(
      execSql(
        `select count(*) from interclub.resultat_voie rv
           join interclub.composition c on c.grimpeur_id = rv.grimpeur_id
          where c.equipe_id = '${EQUIPE_VOLUME}';`,
      ),
    )
    expect(nb).toBeGreaterThan(1000)
  })

  test('équipe et club comptent tous les résultats (R3, R5, R6)', async ({ page }) => {
    const total = `${NB_GRIMPEUSES * POINTS_PAR_GRIMPEUSE}pts`
    await commeAdmin(page)
    await page.goto(URL_ADMIN)

    await page.getByRole('button', { name: 'Par équipe' }).click()
    const equipe = page.locator('tbody tr', { hasText: 'Équipe Volume' })
    await expect(equipe).toContainText(`Club B · ${NB_GRIMPEUSES} grimpeur(s)`)
    await expect(equipe).toContainText(total)

    await page.getByRole('button', { name: 'Par club' }).click()
    await expect(page.locator('tbody tr', { hasText: 'Club B' })).toContainText(total)
  })
})
