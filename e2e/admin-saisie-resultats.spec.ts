import { expect, test, type Locator, type Page } from '@playwright/test'

import { commeAdmin, commeCoach, commeCoachTemporaire } from './helpers/auth'
import { GRIMPEURS, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 19 — saisie & correction admin des résultats (spec #9).
 * Rejoue : accès réservé à l'admin (R1), liste tous clubs + recherche/filtre
 * (R2/R10), saisie cross-club en ③ (R2/R5/R7), correction NP → réel en ④
 * (R5/R8/R9), coexistence admin/coach (R6), refus hors ③/④ y compris par
 * re-soumission (R3/R5), traçabilité de l'auteur (R14), entrée depuis le tableau
 * de bord (R12), règles de saisie réutilisées (R7), responsive (R11).
 * Les refus par contournement d'API (issue incohérente) restent couverts par
 * `npm run test:resultats` (triggers BDD).
 *
 * Série + un seul worker : mute la rencontre pilote.
 */

const URL_SAISIE = `/admin/rencontres/${RENCONTRE_PILOTE}/resultats`
const URL_TDB = `/admin/rencontres/${RENCONTRE_PILOTE}`

const V = {
  M2: '99999999-9999-9999-9999-999999999912',
  M3: '99999999-9999-9999-9999-999999999913',
  T1: '99999999-9999-9999-9999-999999999901',
  T2: '99999999-9999-9999-9999-999999999921',
} as const

function purgerResultats(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');
     delete from interclub.resultat_bloc where bloc_id in (
       select b.id from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
        where e.rencontre_id = '${RENCONTRE_PILOTE}');`,
  )
}

/** Résultat de voie en base : « issue|auteur_role », ou '' si absent. */
function resultatVoie(grimpeurId: string, voieId: string): string {
  return execSql(
    `select issue || '|' || coalesce(auteur_role, '') from interclub.resultat_voie
      where grimpeur_id = '${grimpeurId}' and voie_difficulte_id = '${voieId}';`,
  )
}

/** Bouton d'un grimpeur dans la liste maître. */
const boutonGrimpeur = (page: Page, nom: string) =>
  page.locator('li > button').filter({ hasText: nom })

async function selectionner(page: Page, nom: string): Promise<void> {
  await boutonGrimpeur(page, nom).click()
  await expect(page.locator('p.text-lg', { hasText: nom })).toBeVisible()
}

function ligne(page: Page, section: 'Voie de difficulté' | 'Bloc', code: string): Locator {
  return page
    .locator('div.rounded-2xl', { has: page.getByRole('heading', { name: section, exact: true }) })
    .locator('li')
    .filter({ has: page.locator('span.min-w-9', { hasText: new RegExp(`^${code}$`) }) })
}

const pastille = (l: Locator) => l.locator('span.rounded-full')

test.describe('Cahier 19 — saisie & correction admin des résultats (spec #9)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerResultats()
    nettoyerSessionsQr()
    poserPhase('competition')
    poserDate('today')
  })

  test.afterAll(() => {
    purgerResultats()
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-01 · accès réservé à l’admin (R1)', async ({ page, browser }) => {
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await expect(page.getByRole('heading', { name: /Saisie des résultats/ })).toBeVisible()

    const ctxCoach = await browser.newContext()
    const coach = await ctxCoach.newPage()
    await commeCoach(coach)
    expect((await coach.goto(URL_SAISIE))?.status()).toBe(404)
    // L'écran coach reste accessible au coach (spec #6 R1).
    expect((await coach.goto(`/coach/rencontres/${RENCONTRE_PILOTE}/resultats`))?.status()).toBe(200)
    await ctxCoach.close()

    const ctxTemp = await browser.newContext()
    const temp = await ctxTemp.newPage()
    await commeCoachTemporaire(temp)
    expect((await temp.goto(URL_SAISIE))?.status()).toBe(404)
    await ctxTemp.close()

    const ctxAnon = await browser.newContext()
    const anon = await ctxAnon.newPage()
    await anon.goto(URL_SAISIE)
    await expect(anon).toHaveURL(/\/connexion/) // spec #12 R2
    await ctxAnon.close()
  })

  test('CT-08 · entrée depuis le tableau de bord en ③ (R12)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_TDB)
    await page.getByRole('link', { name: /Saisir les résultats \(tous clubs\)/ }).click()
    await expect(page).toHaveURL(new RegExp(`${URL_SAISIE}$`))
  })

  test('CT-02 · liste tous clubs, recherche, filtre club (R2, R10)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await expect(page.getByText(/3\s*grimpeur\(s\)\s*·\s*2\s*club\(s\)/)).toBeVisible()
    for (const nom of ['Ana Alpha', 'Bob Alpha', 'Cléo Bravo']) {
      await expect(boutonGrimpeur(page, nom)).toBeVisible()
    }

    await page.getByPlaceholder(/Rechercher un grimpeur/).fill('Cléo')
    await expect(page.locator('li > button')).toHaveCount(1)
    await expect(boutonGrimpeur(page, 'Cléo Bravo')).toBeVisible()
    await page.getByPlaceholder(/Rechercher un grimpeur/).fill('')

    await page.getByRole('button', { name: 'Club B', exact: true }).click()
    await expect(page.locator('li > button')).toHaveCount(1)
    await expect(boutonGrimpeur(page, 'Cléo Bravo')).toBeVisible()
    await page.getByRole('button', { name: 'Tous', exact: true }).click()
    await expect(page.locator('li > button')).toHaveCount(3)
  })

  test('CT-03 · saisie pour un autre club en ③ (R2, R5, R7)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await selectionner(page, 'Cléo Bravo')
    await ligne(page, 'Voie de difficulté', 'T2').getByRole('button', { name: 'Top' }).click()
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T2'))).toHaveText('Top')
    await ligne(page, 'Voie de difficulté', 'T3').getByRole('button', { name: 'Prise valorisée' }).click()
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T3'))).toHaveText('Prise valorisée')
    await ligne(page, 'Bloc', 'B1').getByRole('button', { name: '1er essai' }).click()
    await expect(pastille(ligne(page, 'Bloc', 'B1'))).toHaveText('1er essai')
    // T2 Top 6 + T3 prise valorisée 4 + B1 1er essai 4.
    await expect(boutonGrimpeur(page, 'Cléo Bravo')).toContainText('14pts')
  })

  test('CT-07 · traçabilité de l’auteur (R14)', async () => {
    const admin = execSql(`select id from auth.users where email = 'admin@test.local';`)
    expect(
      execSql(
        `select count(*) from interclub.resultat_voie
          where grimpeur_id = '${GRIMPEURS.cleo}'
            and auteur_role = 'admin' and auteur_utilisateur_id = '${admin}';`,
      ),
    ).toBe('2')
    expect(
      execSql(
        `select auteur_role from interclub.resultat_bloc where grimpeur_id = '${GRIMPEURS.cleo}';`,
      ),
    ).toBe('admin')
  })

  test('CT-09 · règles de saisie réutilisées : moulinette sans prise valorisée (R7)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await selectionner(page, 'Ana Alpha')
    expect(await ligne(page, 'Voie de difficulté', 'M2').locator('form button').allInnerTexts()).toEqual([
      'Top',
      'Échec',
    ])
  })

  test('CT-05 · coexistence admin / coach : dernière écriture, un seul résultat (R6, R14)', async ({
    page,
    browser,
  }) => {
    // 1. Le coach saisit Bob T1 = Échec.
    const ctxCoach = await browser.newContext()
    const coach = await ctxCoach.newPage()
    await commeCoach(coach)
    await coach.goto(`/coach/rencontres/${RENCONTRE_PILOTE}/resultats`)
    await coach.getByRole('button', { name: /^Bob Alpha/ }).click()
    await ligne(coach, 'Voie de difficulté', 'T1').getByRole('button', { name: 'Échec' }).click()
    await expect(pastille(ligne(coach, 'Voie de difficulté', 'T1'))).toHaveText('Échec')
    expect(resultatVoie(GRIMPEURS.bob, V.T1)).toBe('echec|coach')

    // 2. L'admin corrige en Top → un seul résultat, auteur admin.
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await selectionner(page, 'Bob Alpha')
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T1'))).toHaveText('Échec')
    await ligne(page, 'Voie de difficulté', 'T1').getByRole('button', { name: 'Top' }).click()
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T1'))).toHaveText('Top')
    expect(resultatVoie(GRIMPEURS.bob, V.T1)).toBe('top|admin')

    // 3. L'inverse : le coach réécrit → dernière écriture, auteur coach.
    await coach.reload()
    await coach.getByRole('button', { name: /^Bob Alpha/ }).click()
    await expect(pastille(ligne(coach, 'Voie de difficulté', 'T1'))).toHaveText('Top')
    await ligne(coach, 'Voie de difficulté', 'T1').getByRole('button', { name: 'Échec' }).click()
    await expect(pastille(ligne(coach, 'Voie de difficulté', 'T1'))).toHaveText('Échec')
    expect(resultatVoie(GRIMPEURS.bob, V.T1)).toBe('echec|coach')
    expect(
      execSql(
        `select count(*) from interclub.resultat_voie
          where grimpeur_id = '${GRIMPEURS.bob}' and voie_difficulte_id = '${V.T1}';`,
      ),
    ).toBe('1')
    await ctxCoach.close()
  })

  test('CT-06 · re-soumission après passage en ⑤ : refusée sans écriture (R3, R5)', async ({
    page,
  }) => {
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await selectionner(page, 'Cléo Bravo')
    // L'écran est encore ouvert en ③ quand la rencontre passe en ⑤.
    poserPhase('resultats_publics')
    try {
      await ligne(page, 'Voie de difficulté', 'T2').getByRole('button', { name: 'Échec' }).click()
      await expect(ligne(page, 'Voie de difficulté', 'T2').getByRole('alert')).toContainText(
        /n'est possible qu'en compétition/,
      )
      expect(resultatVoie(GRIMPEURS.cleo, V.T2)).toBe('top|admin') // inchangé
    } finally {
      poserPhase('competition')
    }
  })

  test('CT-06 · saisie fermée en ①, ② et ⑤ ; action absente du tableau de bord (R5, R12)', async ({
    page,
  }) => {
    await commeAdmin(page)
    for (const phase of ['pre_competition', 'preparation', 'resultats_publics'] as const) {
      poserPhase(phase)
      await page.goto(URL_SAISIE)
      await expect(page.getByText(/n’est ouverte qu’en compétition \(③\) ou clôture \(④\)/)).toBeVisible()
      await selectionner(page, 'Cléo Bravo')
      await expect(page.locator('main form button')).toHaveCount(0)
      await page.goto(URL_TDB)
      await expect(page.getByRole('link', { name: /les résultats \(tous clubs\)/ })).toHaveCount(0)
    }
    poserPhase('competition')
  })

  test('CT-04 · correction en ④ : NP automatique repassé en Top (R5, R8, R9, R12)', async ({
    page,
  }) => {
    execSql(
      `delete from interclub.resultat_voie where grimpeur_id = '${GRIMPEURS.ana}';
       delete from interclub.resultat_bloc where grimpeur_id = '${GRIMPEURS.ana}';
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${V.M2}','${GRIMPEURS.ana}','top');`,
    )
    await commeAdmin(page)
    await page.goto(URL_TDB)
    await page.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
    // En ④, l'action devient « Corriger » et mène à l'écran de correction.
    await page.getByRole('link', { name: /Corriger les résultats \(tous clubs\)/ }).click()
    await expect(page.getByRole('heading', { name: /Correction des résultats/ })).toBeVisible()

    await selectionner(page, 'Ana Alpha')
    const m3 = ligne(page, 'Voie de difficulté', 'M3')
    await expect(pastille(m3)).toHaveText('NP')
    await m3.getByRole('button', { name: 'Top' }).click()
    await expect(pastille(m3)).toHaveText('Top')
    expect(resultatVoie(GRIMPEURS.ana, V.M3)).toBe('top|admin')
    // Les autres résultats ne bougent pas.
    await expect(pastille(ligne(page, 'Voie de difficulté', 'M2'))).toHaveText('Top')
    await expect(pastille(ligne(page, 'Voie de difficulté', 'M4'))).toHaveText('NP')
    await expect(pastille(ligne(page, 'Bloc', 'B1'))).toHaveText('NP')
    await expect(boutonGrimpeur(page, 'Ana Alpha')).toContainText('5pts') // M2 2 + M3 3
  })

  test('CT-10 · responsive : deux colonnes desktop, une colonne mobile (R11)', async ({
    page,
    browser,
  }) => {
    // Desktop (≥ 1024 px) : liste et détail côte à côte.
    await page.setViewportSize({ width: 1280, height: 900 })
    await commeAdmin(page)
    await page.goto(URL_SAISIE)
    await selectionner(page, 'Bob Alpha')
    await expect(boutonGrimpeur(page, 'Ana Alpha')).toBeVisible()
    await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeHidden()

    // Mobile (~375 px) : une colonne, retour à la liste, aucun débordement.
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true })
    const mobile = await ctx.newPage()
    await commeAdmin(mobile)
    await mobile.goto(URL_SAISIE)
    const recherche = mobile.getByPlaceholder(/Rechercher un grimpeur/)
    expect(await recherche.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16)
    await selectionner(mobile, 'Bob Alpha')
    await expect(boutonGrimpeur(mobile, 'Ana Alpha')).toBeHidden()
    // Boutons d'issue confortables au doigt (≥ 44 px, conv. 08).
    const hauteurs = await mobile
      .locator('main form button')
      .evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height))
    expect(hauteurs.length).toBeGreaterThan(0)
    expect(Math.min(...hauteurs)).toBeGreaterThanOrEqual(44)
    expect(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0)
    await mobile.getByRole('button', { name: '← Liste des grimpeurs' }).click()
    await expect(boutonGrimpeur(mobile, 'Ana Alpha')).toBeVisible()
    await ctx.close()
  })
})
