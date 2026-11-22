import { commeAdmin, commeCoach } from './helpers/auth'
import { CLUB_A, CLUB_B, GRIMPEURS, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { expect, test } from './helpers/fixtures'
import { textePdf } from './helpers/pdf'
import { execSql, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 12 CT-32…CT-36 — confirmation de la clôture (spec #3 R17bis) et
 * contrôle des NP (R41l–R41s). Rencontre pilote enfant à l'engagement seed :
 * Ana (M2) et Bob (T1) au Club A, Cléo (T2) au Club B ; 2 blocs, des voies de
 * vitesse. Seul résultat saisi : Ana Top en M2.
 *
 * Série + un seul worker : mute la rencontre pilote.
 */

const URL_TDB = `/admin/rencontres/${RENCONTRE_PILOTE}`
const V_M2 = '99999999-9999-9999-9999-999999999912'

const phaseEnBase = () =>
  execSql(`select phase from interclub.rencontre where id = '${RENCONTRE_PILOTE}';`)

function purgerResultats(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');
     delete from interclub.resultat_bloc where bloc_id in (
       select b.id from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');
     delete from interclub.temps_vitesse where epreuve_id in (
       select id from interclub.epreuve where rencontre_id = '${RENCONTRE_PILOTE}');`,
  )
}

test.describe('Cahier 12 — confirmation de clôture et contrôle des NP (R17bis, R41l–R41s)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerResultats()
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${V_M2}','${GRIMPEURS.ana}','top');`,
    )
    poserDate('today')
    poserPhase('competition')
  })

  test.afterAll(() => {
    purgerResultats()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-32 · en ③, « Clôture → » ouvre la confirmation avec l’aperçu ; Annuler et Échap ne changent rien (R17bis a–d)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_TDB)
    // Onglet absent avant la clôture (R41k).
    await expect(page.getByRole('tab', { name: /Contrôle des NP/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Clôturer la rencontre ?' })
    await expect(fenetre).toBeVisible()
    await expect(fenetre.getByText(/saisie des coachs, capitaines et juges s’arrête/)).toBeVisible()
    // Aperçu : Club A = Ana (M3, M4) + Bob (T1–T3) ; Club B = Cléo (T2–T4).
    await expect(fenetre.getByRole('row', { name: /Club A/ })).toContainText(/5\s*4\s*2/)
    await expect(fenetre.getByRole('row', { name: /Club B/ })).toContainText(/3\s*2\s*1/)
    await expect(fenetre.getByRole('row', { name: /Total/ })).toContainText(/8\s*6\s*3/)
    // Focus initial sur « Annuler » (R17bis d).
    await expect(fenetre.getByRole('button', { name: 'Annuler' })).toBeFocused()

    await fenetre.getByRole('button', { name: 'Annuler' }).click()
    await expect(fenetre).toBeHidden()
    expect(phaseEnBase()).toBe('competition')

    await page.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
    await expect(fenetre).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(fenetre).toBeHidden()
    expect(phaseEnBase()).toBe('competition')
  })

  test('CT-33 · « Clôturer » passe en ④ et pose les NP ; onglet Contrôle des NP (R17bis d, R41k–R41p)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_TDB)
    await page.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
    await page.getByRole('dialog', { name: 'Clôturer la rencontre ?' }).getByRole('button', { name: 'Clôturer' }).click()
    await expect.poll(phaseEnBase).toBe('cloture')

    const onglet = page.getByRole('tab', { name: /Contrôle des NP/ })
    await expect(onglet).toBeVisible()
    await onglet.click()
    const panneau = page.getByRole('tabpanel')
    for (const titre of ['Vitesse', 'Bloc B1', 'Bloc B2', 'Niveau M3', 'Niveau T2']) {
      await expect(panneau.getByRole('heading', { name: titre, exact: true })).toBeVisible()
    }
    // M2 d'Ana est saisi : pas de section M2 (sections vides omises, R41l).
    await expect(panneau.getByRole('heading', { name: 'Niveau M2', exact: true })).toHaveCount(0)
    // Signaux (R41p) : Bob n'a rien → absent ? ; Ana a 2 voies NP et ses blocs NP.
    await expect(panneau.getByText('Tout NP : absent ?').first()).toBeVisible()
    await expect(panneau.getByText('Peu de saisies').first()).toBeVisible()
  })

  test('CT-34 · le nom mène à la saisie admin, grimpeur présélectionné (R41q, spec #9 R12)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`${URL_TDB}?onglet=np`)
    await page.getByRole('tabpanel').getByRole('link', { name: 'Alpha Ana' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/resultats\\?grimpeur=${GRIMPEURS.ana}`))
    await expect(page.locator('p.text-lg', { hasText: 'Ana Alpha' })).toBeVisible()
  })

  test('CT-35 · exports PDF par niveau et par club ; refusés hors admin (R41r, R41s)', async ({ page, browser }) => {
    await commeAdmin(page)
    const parNiveau = await page.request.get(`${URL_TDB}/np/pdf`)
    expect(parNiveau.status()).toBe(200)
    expect(parNiveau.headers()['content-type']).toBe('application/pdf')
    expect(parNiveau.headers()['content-disposition']).toContain('par-niveau.pdf')
    const texteNiveau = textePdf(await parNiveau.body()).join(' ')
    expect(texteNiveau).toContain('Récapitulatif')
    expect(texteNiveau).toContain('Alpha Ana')

    const clubA = await page.request.get(`${URL_TDB}/np/pdf?club=${CLUB_A}`)
    expect(clubA.status()).toBe(200)
    expect(clubA.headers()['content-disposition']).toContain('-club-a.pdf')
    const texteA = textePdf(await clubA.body()).join(' ')
    expect(texteA).toContain('Alpha Ana')
    expect(texteA).not.toContain('Bravo')

    const clubB = textePdf(await (await page.request.get(`${URL_TDB}/np/pdf?club=${CLUB_B}`)).body()).join(' ')
    expect(clubB).toContain('Bravo Cléo')
    expect(clubB).not.toContain('Alpha')

    const ctx = await browser.newContext()
    const coach = await ctx.newPage()
    await commeCoach(coach)
    expect((await coach.request.get(`${URL_TDB}/np/pdf`)).status()).toBe(404)
    await ctx.close()
  })

  test('CT-36 · bilan → détail des NP ; en ⑤ pas de lien de correction ; hors ④/⑤ export 404 (R41j, R41q)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(`${URL_TDB}?onglet=statistiques`)
    await page.getByRole('link', { name: /Voir le détail des NP/ }).click()
    await expect(page.getByRole('tab', { name: /Contrôle des NP/ })).toHaveAttribute('aria-selected', 'true')

    poserPhase('resultats_publics')
    await page.goto(`${URL_TDB}?onglet=np`)
    await expect(page.getByRole('tabpanel').getByText('Alpha Ana').first()).toBeVisible()
    await expect(page.getByRole('tabpanel').getByRole('link', { name: 'Alpha Ana' })).toHaveCount(0)

    poserPhase('competition')
    expect((await page.request.get(`${URL_TDB}/np/pdf`)).status()).toBe(404)
    await page.goto(`${URL_TDB}?onglet=np`)
    await expect(page.getByRole('tab', { name: /Contrôle des NP/ })).toHaveCount(0)
  })
})
