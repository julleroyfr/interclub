import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { CLUB_B, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * NP automatique de clôture au-delà du plafond de l'API (spec #6 R18 ; constats
 * P7, J3 et B2, lot 5 du plan « appels Supabase »). L'API renvoie au plus 1000
 * lignes par lecture : si les résultats déjà saisis sont lus tronqués, la
 * clôture croit « non saisis » des niveaux qui le sont et y pose un NP en trop.
 *
 * 80 grimpeuses (Club B, groupe de départ M1 : M1, M2, M3 attendus) ont « top »
 * sur M4 et T1–T10 (880 résultats), puis sur une SECONDE voie de chacun des
 * niveaux M1, M2 et M3 (240 résultats, saisis en dernier). Ces voies ne sont pas
 * les voies représentatives (plus petit `ordre`) où la clôture pose le NP : un
 * résultat ignoré y donnerait un NP en plus du Top. 1120 résultats de voie.
 * Attendu : aucun NP de voie pour ces grimpeuses ; NP sur les 2 blocs.
 *
 * Série + un seul worker : mute la rencontre pilote.
 */

const URL_ADMIN = `/admin/rencontres/${RENCONTRE_PILOTE}`
const EQUIPE_VOLUME = '77777777-7777-7777-7777-7777777777c2'
const NB_GRIMPEUSES = 80
/** Identifiants `d0000000-…-000000000001` à `…080`. */
const ID_GRIMPEUSE = `('d0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid`
const GRIMPEUSES_VOLUME = `select grimpeur_id from interclub.composition where equipe_id = '${EQUIPE_VOLUME}'`
/** Voies ajoutées (seconde voie des niveaux M1, M2, M3), `ordre` ≥ 101. */
const VOIES_BIS = `select v.id from interclub.voie_difficulte v
   join interclub.epreuve e on e.id = v.epreuve_id
  where e.rencontre_id = '${RENCONTRE_PILOTE}' and v.ordre >= 101`

function purgerVolume(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');
     delete from interclub.resultat_bloc where bloc_id in (
       select b.id from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');
     delete from interclub.voie_difficulte where id in (${VOIES_BIS});
     delete from interclub.composition where equipe_id = '${EQUIPE_VOLUME}';
     delete from interclub.equipe where id = '${EQUIPE_VOLUME}';
     delete from interclub.grimpeur where id::text like 'd0000000-0000-0000-0000-%';`,
  )
}

test.describe('Clôture au-delà de 1000 résultats de voie (spec #6 R18, B2)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerVolume()
    poserPhase('competition')
    poserDate('today')
    execSql(
      `insert into interclub.voie_difficulte (epreuve_id, niveau, type_voie, cotation, ordre, points)
         select e.id, n.niveau, 'moulinette', n.cotation, n.ordre, n.ordre - 100
           from interclub.epreuve e
           cross join (values ('M1', '4c', 101), ('M2', '5a', 102), ('M3', '5b', 103)) n(niveau, cotation, ordre)
          where e.rencontre_id = '${RENCONTRE_PILOTE}' and e.type = 'voie';
       insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${EQUIPE_VOLUME}','${RENCONTRE_PILOTE}','${CLUB_B}','Équipe Clôture');
       insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
         select ${ID_GRIMPEUSE}, '${CLUB_B}', 'Cloture' || lpad(i::text, 3, '0'), 'Lou', 2016, 'F', 9996000 + i
           from generate_series(1, ${NB_GRIMPEUSES}) i;
       insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
         select '${EQUIPE_VOLUME}', ${ID_GRIMPEUSE}, 'M1' from generate_series(1, ${NB_GRIMPEUSES}) i;
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         select v.id, ${ID_GRIMPEUSE}, 'top'
           from generate_series(1, ${NB_GRIMPEUSES}) i
           cross join interclub.voie_difficulte v
           join interclub.epreuve e on e.id = v.epreuve_id
          where e.rencontre_id = '${RENCONTRE_PILOTE}' and v.ordre between 4 and 100;
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         select v.id, ${ID_GRIMPEUSE}, 'top'
           from generate_series(1, ${NB_GRIMPEUSES}) i
           cross join (${VOIES_BIS}) v;`,
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
        `select count(*) from interclub.resultat_voie where grimpeur_id in (${GRIMPEUSES_VOLUME});`,
      ),
    )
    expect(nb).toBeGreaterThan(1000)
  })

  test('la clôture ne pose aucun NP sur un niveau déjà saisi (R18)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_ADMIN)
    await page.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
    await expect(page.getByRole('button', { name: 'Avancer à la phase suivante' })).toContainText(
      /Résultats publics/,
    )
    await expect(page.getByText(/non-présentations automatiques/)).toHaveCount(0)
    expect(
      execSql(`select phase from interclub.rencontre where id = '${RENCONTRE_PILOTE}';`),
    ).toBe('cloture')

    // Voies : M1, M2, M3 saisis sur leur seconde voie → aucun NP.
    expect(
      execSql(
        `select count(*) from interclub.resultat_voie
          where issue = 'np' and grimpeur_id in (${GRIMPEUSES_VOLUME});`,
      ),
    ).toBe('0')
    // Les résultats saisis sont intacts.
    expect(
      execSql(
        `select count(*) from interclub.resultat_voie
          where issue = 'top' and grimpeur_id in (${GRIMPEUSES_VOLUME});`,
      ),
    ).toBe(String(NB_GRIMPEUSES * 14))
    // Blocs : aucun saisi → NP sur B1 et B2 pour chaque grimpeuse.
    expect(
      execSql(
        `select count(*) from interclub.resultat_bloc
          where issue = 'np' and grimpeur_id in (${GRIMPEUSES_VOLUME});`,
      ),
    ).toBe(String(NB_GRIMPEUSES * 2))
  })
})
