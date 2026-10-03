import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { GRIMPEURS, JETON, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 20 — saisie de la vitesse par le juge (spec #10).
 * Rejoue : session juge + roster tous clubs par sexe (R1/R2/R12), saisie d'un
 * temps (R7/R8/R13/R14), chute puis correction (R10/R11), non-présentation (R9),
 * recherche/filtres (R14b), temps invalide (R8), fenêtre ③ (R6), espace masqué
 * hors session juge (R1), périmètre d'écriture RLS (R3), lecture seule côté coach
 * (R15), responsive (R14b/R14c).
 *
 * Série + un seul worker : mute la rencontre pilote et ses sessions QR.
 */

const EPREUVE_VITESSE = '88888888-8888-8888-8888-888888888803'
const EPREUVE_VITESSE_ADO = 'adadadad-0000-0000-0000-0000000000a3'

function purgerTemps(): void {
  execSql(
    `delete from interclub.temps_vitesse where epreuve_id in ('${EPREUVE_VITESSE}','${EPREUVE_VITESSE_ADO}');`,
  )
}

/** « issue|temps » en base pour un grimpeur (vide si aucun résultat). */
function tempsEnBase(grimpeurId: string): string {
  return execSql(
    `select issue || '|' || coalesce(temps::text, '') from interclub.temps_vitesse
      where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${grimpeurId}';`,
  )
}

async function commeJuge(page: Page): Promise<void> {
  await page.goto(`/scan?jeton=${JETON.juge}`)
  await page.waitForURL('**/juge')
}

/** Ligne d'un grimpeur (libellé « Nom Prénom »). */
const ligne = (page: Page, nomPrenom: string) => page.locator('li', { hasText: nomPrenom })
const pastille = (page: Page, nomPrenom: string) => ligne(page, nomPrenom).locator('span.rounded-full')

async function saisirTemps(page: Page, nomPrenom: string, valeur: string): Promise<void> {
  await page.getByLabel(`Temps de ${nomPrenom}`).fill(valeur)
  await ligne(page, nomPrenom).getByRole('button', { name: 'OK' }).click()
}

/** Compteur de progression d'un sexe (« Femmes 1 / 2 »). */
const compteur = (page: Page, titre: 'Femmes' | 'Hommes') =>
  page.locator('div.rounded-xl').filter({ has: page.locator('span.uppercase', { hasText: new RegExp(`^${titre}$`) }) })

test.describe('Cahier 20 — saisie de la vitesse par le juge (spec #10)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerTemps()
    nettoyerSessionsQr()
    poserPhase('competition')
    poserDate('today')
  })

  test.afterAll(() => {
    purgerTemps()
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-01 · session juge, roster tous clubs par sexe (R1, R2, R12, R14)', async ({ page }) => {
    await commeJuge(page)
    await expect(page.getByRole('heading', { name: /⚡ Vitesse — Club A ·/ })).toBeVisible()
    await expect(page.getByText('● ③ Compétition')).toBeVisible()
    await expect(page.getByText(/couloir 1/)).toBeVisible()

    // Femmes : Ana (A) et Cléo (B, cross-club via RPC) ; Hommes : Bob. Tri alpha.
    const femmes = page.locator('section', { has: page.locator('header', { hasText: 'Femmes' }) })
    const hommes = page.locator('section', { has: page.locator('header', { hasText: 'Hommes' }) })
    await expect(femmes.locator('li div.truncate')).toHaveText(['Alpha Ana', 'Bravo Cléo'])
    await expect(hommes.locator('li div.truncate')).toHaveText(['Alpha Bob'])
    await expect(pastille(page, 'Alpha Ana')).toHaveText('à saisir')
    await expect(compteur(page, 'Femmes')).toContainText(/0\s*\/\s*2/)
    await expect(compteur(page, 'Hommes')).toContainText(/0\s*\/\s*1/)
  })

  test('CT-02 · saisir un temps, persistance et compteur (R7, R8, R13, R14)', async ({ page }) => {
    await commeJuge(page)
    await saisirTemps(page, 'Alpha Bob', '8.123')
    await expect(pastille(page, 'Alpha Bob')).toHaveText('8,123 s')
    await expect(compteur(page, 'Hommes')).toContainText(/1\s*\/\s*1/)
    await expect(compteur(page, 'Femmes')).toContainText(/0\s*\/\s*2/)
    await page.reload()
    await expect(pastille(page, 'Alpha Bob')).toHaveText('8,123 s')
    expect(tempsEnBase(GRIMPEURS.bob)).toBe('temps|8.123')
  })

  test('CT-03 · chute puis correction en temps, un seul résultat (R10, R11)', async ({ page }) => {
    await commeJuge(page)
    await ligne(page, 'Alpha Ana').getByRole('button', { name: 'Chute' }).click()
    await expect(pastille(page, 'Alpha Ana')).toHaveText('Chute')
    expect(tempsEnBase(GRIMPEURS.ana)).toBe('chute|')
    // Entrée valide le temps (OK est le premier bouton du formulaire, R14c).
    await page.getByLabel('Temps de Alpha Ana').fill('9.340')
    await page.getByLabel('Temps de Alpha Ana').press('Enter')
    await expect(pastille(page, 'Alpha Ana')).toHaveText('9,340 s')
    expect(tempsEnBase(GRIMPEURS.ana)).toBe('temps|9.340')
    await expect(compteur(page, 'Femmes')).toContainText(/1\s*\/\s*2/)
  })

  test('CT-04 · non-présentation (R7, R9)', async ({ page }) => {
    await commeJuge(page)
    await ligne(page, 'Bravo Cléo').getByRole('button', { name: 'Abs.' }).click()
    await expect(pastille(page, 'Bravo Cléo')).toHaveText('Non prés.')
    expect(tempsEnBase(GRIMPEURS.cleo)).toBe('non_presentation|')
    await expect(compteur(page, 'Femmes')).toContainText(/2\s*\/\s*2/)
    await expect(compteur(page, 'Hommes')).toContainText(/1\s*\/\s*1/)
  })

  test('CT-05 · recherche, filtre « à saisir », filtre sexe (R14b)', async ({ page }) => {
    execSql(`delete from interclub.temps_vitesse where grimpeur_id = '${GRIMPEURS.cleo}';`)
    await commeJuge(page)
    const recherche = page.getByPlaceholder('Rechercher un grimpeur (nom, prénom)…')
    await recherche.fill('bo')
    await expect(page.locator('li div.truncate')).toHaveText(['Alpha Bob'])
    await recherche.fill('')

    await page.getByRole('button', { name: 'À saisir (1)' }).click()
    await expect(page.locator('li div.truncate')).toHaveText(['Bravo Cléo'])
    await page.getByRole('button', { name: 'À saisir (1)' }).click()

    await page.getByRole('button', { name: 'Femmes', exact: true }).click()
    await expect(page.locator('section header', { hasText: 'Hommes' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Hommes', exact: true }).click()
    await expect(page.locator('section header', { hasText: 'Femmes' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Tous', exact: true }).click()
    await expect(page.locator('section')).toHaveCount(2)
    // Les filtres ne changent ni les données ni les compteurs.
    await expect(compteur(page, 'Femmes')).toContainText(/1\s*\/\s*2/)
  })

  test('CT-06 · temps invalide refusé sans écriture (R8)', async ({ page }) => {
    await commeJuge(page)
    for (const valeur of ['0', '', '-3']) {
      await saisirTemps(page, 'Bravo Cléo', valeur)
      await expect(ligne(page, 'Bravo Cléo').getByRole('alert')).toContainText(/strictement positive/)
      await expect(pastille(page, 'Bravo Cléo')).toHaveText('à saisir')
    }
    expect(tempsEnBase(GRIMPEURS.cleo)).toBe('')
  })

  test('CT-09 · le juge n’écrit que sur la vitesse de sa rencontre (R3)', async ({ page }) => {
    await commeJuge(page)
    const juge = execSql(
      `select s.utilisateur_id from interclub.session_qr s
         join interclub.jeton_qr j on j.id = s.jeton_qr_id
        where j.valeur = '${JETON.juge}' order by s.created_at desc limit 1;`,
    )
    // Grimpeur ENGAGÉ dans la rencontre visée : sinon le refus viendrait du
    // contrôle « grimpeur engagé » (spec #10 R7bis) et non du périmètre RLS testé ici.
    const engageAdo = execSql(
      `select grimpeur_id from interclub.composition
        where rencontre_id = 'adadadad-adad-adad-adad-adadadadadad' order by grimpeur_id limit 1;`,
    )
    const essai = (epreuve: string, grimpeur: string = GRIMPEURS.cleo) => {
      try {
        execSql(
          `begin;
           select set_config('request.jwt.claims', '{"sub":"${juge}","role":"authenticated"}', true);
           set local role authenticated;
           insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, temps, issue)
             values ('${epreuve}','${grimpeur}',7.7,'temps');
           rollback;`,
        )
        return 'accepte'
      } catch (e) {
        return String(e).includes('row-level security') ? 'refus_rls' : `autre: ${String(e)}`
      }
    }
    expect(essai(EPREUVE_VITESSE)).toBe('accepte') // sa rencontre (contrôle positif)
    expect(essai(EPREUVE_VITESSE_ADO, engageAdo)).toBe('refus_rls') // une autre rencontre
    expect(essai('88888888-8888-8888-8888-888888888801')).toBe('refus_rls') // épreuve non-vitesse
  })

  test('CT-10 · le coach lit la vitesse sans pouvoir la saisir (R15)', async ({ page }) => {
    await commeCoach(page)
    await page.goto(`/coach/rencontres/${RENCONTRE_PILOTE}/resultats`)
    await page.getByRole('button', { name: /^Bob Alpha/ }).click()
    const vitesse = page.locator('div', { has: page.getByRole('heading', { name: '⚡ Vitesse' }) }).last()
    await expect(vitesse).toContainText('8,123 s')
    await expect(vitesse.getByRole('button')).toHaveCount(0)
    await expect(vitesse.locator('input')).toHaveCount(0)
  })

  test('CT-11 · deux colonnes en grand écran, empilées en mobile, en-têtes collants (R14b, R14c)', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await commeJuge(page)
    const [f, h] = await page.locator('section').evaluateAll((ss) =>
      ss.map((s) => s.getBoundingClientRect().top),
    )
    expect(Math.abs(f - h)).toBeLessThan(2) // côte à côte
    expect(
      await page.locator('section header').first().evaluate((e) => getComputedStyle(e).position),
    ).toBe('sticky')
    expect(await page.getByLabel('Temps de Alpha Ana').getAttribute('inputmode')).toBe('decimal')

    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true })
    const mobile = await ctx.newPage()
    await commeJuge(mobile)
    const [fm, hm] = await mobile.locator('section').evaluateAll((ss) =>
      ss.map((s) => s.getBoundingClientRect().top),
    )
    expect(hm).toBeGreaterThan(fm + 50) // empilées
    expect(
      await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBe(0)
    await ctx.close()
  })

  test('CT-08 · espace juge masqué hors session juge (R1)', async ({ browser }) => {
    const anon = await browser.newContext()
    const pAnon = await anon.newPage()
    await pAnon.goto('/juge')
    await expect(pAnon).toHaveURL(/\/connexion/) // spec #12 R2
    await anon.close()

    for (const connecter of [commeAdmin, commeCoach]) {
      const ctx = await browser.newContext()
      const p = await ctx.newPage()
      await connecter(p)
      expect((await p.goto('/juge'))?.status()).toBe(404)
      await ctx.close()
    }
  })

  test('CT-07 · fenêtre ③ uniquement : pas de session juge en ② ni en ④ (R6)', async ({
    browser,
  }) => {
    for (const phase of ['preparation', 'cloture'] as const) {
      poserPhase(phase)
      nettoyerSessionsQr()
      const ctx = await browser.newContext()
      const p = await ctx.newPage()
      await p.goto(`/scan?jeton=${JETON.juge}`)
      await expect(p.getByText(/pas encore ouvert|pas encore en cours/)).toBeVisible()
      await expect(p).not.toHaveURL(/\/juge/)
      await ctx.close()
    }
    // Le résultat saisi en ③ reste en base après la clôture.
    expect(tempsEnBase(GRIMPEURS.bob)).toBe('temps|8.123')
    poserPhase('competition')
  })
})
