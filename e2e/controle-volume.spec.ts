import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { CLUB_B, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Contrôle au-delà du plafond de l'API (spec #16 R4/R5/R6 ; constat J2 de
 * l'analyse du 2026-10-09, lot 2 du plan « appels Supabase »). L'API renvoie au
 * plus 1000 lignes par lecture : sans pagination, des résultats manquent à
 * l'écran de contrôle SANS erreur, et la progression est fausse.
 *
 * 80 grimpeuses (Club B, équipe dédiée) ont toutes un résultat sur les 14 voies
 * de la rencontre pilote : 1120 résultats de voie. Attendu : chaque voie liste
 * 80 résultats (« 0/80 »).
 *
 * Série + un seul worker : mute la rencontre pilote.
 */

const URL_CONTROLE = `/admin/rencontres/${RENCONTRE_PILOTE}/controle`
const EQUIPE_VOLUME = '77777777-7777-7777-7777-7777777777c2'
const NB_GRIMPEUSES = 80
/** Identifiants `d0000000-…-000000000001` à `…080`. */
const ID_GRIMPEUSE = `('d0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid`

function purgerVolume(): void {
  execSql(
    `delete from interclub.resultat_voie where grimpeur_id in (
       select grimpeur_id from interclub.composition where equipe_id = '${EQUIPE_VOLUME}');
     delete from interclub.composition where equipe_id = '${EQUIPE_VOLUME}';
     delete from interclub.equipe where id = '${EQUIPE_VOLUME}';
     delete from interclub.grimpeur where id::text like 'd0000000-0000-0000-0000-%';`,
  )
}

test.describe('Contrôle au-delà de 1000 résultats (spec #16, J2)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerVolume()
    poserPhase('competition')
    poserDate('today')
    execSql(
      `insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${EQUIPE_VOLUME}','${RENCONTRE_PILOTE}','${CLUB_B}','Équipe Contrôle');
       insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
         select ${ID_GRIMPEUSE}, '${CLUB_B}', 'Controle' || lpad(i::text, 3, '0'), 'Zoé', 2016, 'F', 9996000 + i
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
    poserPhase('cloture')
  })

  test.afterAll(() => {
    purgerVolume()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('chaque voie liste tous ses résultats (R4, R5, R6)', async ({ page }) => {
    const nbVoies = Number(
      execSql(
        `select count(*) from interclub.voie_difficulte v
           join interclub.epreuve e on e.id = v.epreuve_id
          where e.rencontre_id = '${RENCONTRE_PILOTE}';`,
      ),
    )
    expect(nbVoies * NB_GRIMPEUSES).toBeGreaterThan(1000)

    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    const navigation = page.getByRole('navigation', { name: 'Voies et blocs' })
    await expect(navigation.getByRole('button', { name: /^B1\b/ })).toBeVisible()
    // Progression de chaque voie (« 0/80 ») : les blocs (B…) n'ont pas de résultat ici.
    const progressions = (await navigation.getByRole('button').allInnerTexts())
      .filter((texte) => !/^B\d/.test(texte.trim()))
      .map((texte) => texte.match(/\d+\/\d+/)?.[0])
    expect(progressions).toEqual(Array(nbVoies).fill(`0/${NB_GRIMPEUSES}`))
  })

  test('le tableau de bord compte tous les résultats (R3)', async ({ page }) => {
    const total = Number(
      execSql(
        `select (select count(*) from interclub.resultat_voie rv
                   join interclub.voie_difficulte v on v.id = rv.voie_difficulte_id
                   join interclub.epreuve e on e.id = v.epreuve_id
                  where e.rencontre_id = '${RENCONTRE_PILOTE}')
              + (select count(*) from interclub.resultat_bloc rb
                   join interclub.bloc b on b.id = rb.bloc_id
                   join interclub.epreuve e on e.id = b.epreuve_id
                  where e.rencontre_id = '${RENCONTRE_PILOTE}');`,
      ),
    )
    expect(total).toBeGreaterThan(1000)

    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
    await expect(page.getByText(`0/${total} lignes contrôlées`)).toBeVisible()
  })
})
