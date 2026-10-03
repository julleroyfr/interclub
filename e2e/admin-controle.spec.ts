import { readFileSync } from 'node:fs'

import type { Locator, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach, commeSansMapping, seConnecter } from './helpers/auth'
import { EQUIPES, GRIMPEURS, MDP, RENCONTRE_PILOTE } from './helpers/donnees'
import { execSql, poserPhase } from './helpers/sql'

/**
 * Cahier 27 — contrôle des résultats contre les fiches de juges (spec #16).
 * Rejoue la part automatisable : accès/phase (R1–R3), supports et lignes (R4–R8),
 * coche/décoche + auteur + progression (R5/R10/R11/R18), filtres (R9), lecture
 * seule ⑤ (R2/R15), refus hors ④ (R13), coche conservée après correction (R14),
 * temps réel entre deux admins (R12bis), mobile (R17).
 *
 * Série + un seul worker : mute les résultats de la rencontre pilote.
 */

const URL_CONTROLE = `/admin/rencontres/${RENCONTRE_PILOTE}/controle`
const URL_TDB = `/admin/rencontres/${RENCONTRE_PILOTE}`

const VOIE = {
  M2: '99999999-9999-9999-9999-999999999912',
  M3: '99999999-9999-9999-9999-999999999913',
  M4: '99999999-9999-9999-9999-999999999914',
  T1: '99999999-9999-9999-9999-999999999901',
  T2: '99999999-9999-9999-9999-999999999921',
  T3: '99999999-9999-9999-9999-999999999922',
  T4: '99999999-9999-9999-9999-999999999923',
} as const
const BLOC = { B1: '99999999-9999-9999-9999-999999999902', B2: '99999999-9999-9999-9999-999999999903' }
const PALIER = {
  b1_1: '99999999-9999-9999-9999-9999999999a1',
  b1_2: '99999999-9999-9999-9999-9999999999a2',
  b2_2: '99999999-9999-9999-9999-9999999999b2',
}

const ADMIN2 = { email: 'admin2@test.local', mdp: MDP }

/**
 * État « après clôture » : résultats saisis + NP posés sur les attendus (comme la
 * transition ③→④, spec #6 R18), aucune coche. Devi (Club B) composé en A2 → prêté.
 */
function poserResultatsCloture(): void {
  const { ana, bob, cleo, devi } = GRIMPEURS
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (${Object.values(VOIE)
      .map((v) => `'${v}'`)
      .join(',')});
     delete from interclub.resultat_bloc where bloc_id in ('${BLOC.B1}','${BLOC.B2}');
     insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
       values ('${EQUIPES.A2}','${devi}','T1') on conflict do nothing;
     insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
       ('${VOIE.M2}','${ana}','top'),('${VOIE.M3}','${ana}','echec'),('${VOIE.M4}','${ana}','np'),
       ('${VOIE.T1}','${bob}','top'),('${VOIE.T2}','${bob}','prise_valorisee'),('${VOIE.T3}','${bob}','np'),
       ('${VOIE.T2}','${cleo}','top'),('${VOIE.T3}','${cleo}','np'),('${VOIE.T4}','${cleo}','np'),
       ('${VOIE.T1}','${devi}','echec'),('${VOIE.T2}','${devi}','np'),('${VOIE.T3}','${devi}','np');
     insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
       ('${BLOC.B1}','${ana}','palier','${PALIER.b1_1}'),('${BLOC.B1}','${bob}','np',null),
       ('${BLOC.B1}','${cleo}','echec',null),('${BLOC.B1}','${devi}','palier','${PALIER.b1_2}'),
       ('${BLOC.B2}','${ana}','np',null),('${BLOC.B2}','${bob}','palier','${PALIER.b2_2}'),
       ('${BLOC.B2}','${cleo}','np',null),('${BLOC.B2}','${devi}','np',null);`,
  )
}

/** Crée (une fois) un 2ᵉ compte admin local via l'API Auth admin + mapping. */
async function assurerAdmin2(): Promise<void> {
  if (execSql(`select count(*) from auth.users where email = '${ADMIN2.email}';`) === '0') {
    const env = readFileSync('.env.local', 'utf8')
    const lire = (cle: string) =>
      env.match(new RegExp(`^${cle}=(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '') ?? ''
    const resp = await fetch(`${lire('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: lire('SUPABASE_SERVICE_ROLE_KEY'),
        Authorization: `Bearer ${lire('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: ADMIN2.email, password: ADMIN2.mdp, email_confirm: true }),
    })
    if (!resp.ok) throw new Error(`Création admin2 : ${resp.status} ${await resp.text()}`)
  }
  execSql(
    `insert into interclub.compte (utilisateur_id, role)
       select id, 'admin' from auth.users where email = '${ADMIN2.email}'
     on conflict (utilisateur_id) do update set role = 'admin', club_id = null;`,
  )
}

const controleLe = (table: 'resultat_voie' | 'resultat_bloc', col: string, support: string, grimpeur: string) =>
  execSql(
    `select coalesce(controle_le::text,'null') || '|' || coalesce(controle_par::text,'null')
       from interclub.${table} where ${col} = '${support}' and grimpeur_id = '${grimpeur}';`,
  )

/** Ouvre un support dans la colonne de gauche (bouton « T2 · 5a … »). */
async function ouvrirSupport(page: Page, code: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Voies et blocs' })
    .getByRole('button', { name: new RegExp(`^${code}\\b`) })
    .click()
  await expect(page.getByRole('heading', { level: 2 })).toContainText(code)
}

const ligne = (page: Page, nomMajuscule: string): Locator =>
  page.locator('li', { has: page.getByRole('checkbox', { name: new RegExp(nomMajuscule, 'i') }) })

const caseDe = (page: Page, nom: string, prenom: string): Locator =>
  page.getByRole('checkbox', { name: `Contrôlé : ${nom} ${prenom}` })

test.describe('Cahier 27 — contrôle des résultats (spec #16)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await assurerAdmin2()
  })

  test.beforeEach(() => {
    poserResultatsCloture()
    poserPhase('cloture')
  })

  test.afterAll(() => {
    // Retour à l'état seed : aucun résultat, Devi en A2 (seed), phase ③.
    execSql(
      `delete from interclub.resultat_voie where voie_difficulte_id in (${Object.values(VOIE)
        .map((v) => `'${v}'`)
        .join(',')});
       delete from interclub.resultat_bloc where bloc_id in ('${BLOC.B1}','${BLOC.B2}');`,
    )
    poserPhase('competition')
  })

  test('CT-02 · accès réservé à l’admin (R1)', async ({ browser }) => {
    const admin = await browser.newPage()
    await commeAdmin(admin)
    const ok = await admin.goto(URL_CONTROLE)
    expect(ok?.status()).toBe(200)
    await expect(admin.getByRole('heading', { level: 1 })).toContainText('Contrôle des résultats')

    const coach = await browser.newPage()
    await commeCoach(coach)
    expect((await coach.goto(URL_CONTROLE))?.status()).toBe(404)

    const sansRole = await browser.newPage()
    await commeSansMapping(sansRole)
    expect((await sansRole.goto(URL_CONTROLE))?.status()).toBe(404)

    const anonyme = await browser.newPage()
    await anonyme.goto(URL_CONTROLE)
    await expect(anonyme).toHaveURL(/\/connexion/)
  })

  test('CT-03 · disponibilité selon la phase + action du tableau de bord (R2/R3)', async ({ page }) => {
    await commeAdmin(page)

    poserPhase('competition')
    await page.goto(URL_TDB)
    await expect(page.getByRole('link', { name: /contr[ôo]le/i })).toHaveCount(0)
    expect((await page.goto(URL_CONTROLE))?.status()).toBe(404)

    poserPhase('cloture')
    await page.goto(URL_TDB)
    const action = page.getByRole('link', { name: /Contrôler les résultats \(fiches juges\)/ })
    await expect(action).toBeVisible()
    await expect(action).toContainText('0/20 lignes contrôlées')

    poserPhase('resultats_publics')
    await page.goto(URL_TDB)
    await page.getByRole('link', { name: /Voir le contrôle des résultats/ }).click()
    await expect(page).toHaveURL(new RegExp(`${URL_CONTROLE}$`))
    await expect(page.getByText('contrôle consultable en lecture seule')).toBeVisible()
  })

  test('CT-04 · supports, lignes tous clubs, issues sans points (R4–R8)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)

    const nav = page.getByRole('navigation', { name: 'Voies et blocs' })
    const codes = (await nav.getByRole('button').allInnerTexts()).map((t) => t.split(/\s/)[0])
    expect(codes).toEqual([
      'M1', 'M2', 'M3', 'M4', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'B1', 'B2',
    ])
    await expect(nav.getByRole('button', { name: /^T2\b/ })).toContainText('0/3')
    await expect(nav.getByRole('button', { name: /^T5\b/ })).toContainText('0/0')

    // T2 : Bob (A), Cléo (B), Devi (B prêté) — tri nom puis prénom (R7).
    await ouvrirSupport(page, 'T2')
    const noms = await page.getByRole('checkbox').evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label')),
    )
    expect(noms).toEqual(['Contrôlé : Alpha Bob', 'Contrôlé : Bravo Cléo', 'Contrôlé : Bravo Devi'])
    await expect(ligne(page, 'Alpha Bob')).toContainText('Prise valorisée')
    await expect(ligne(page, 'Bravo Cléo')).toContainText('Top')
    await expect(ligne(page, 'Bravo Cléo')).toContainText('Club B')
    await expect(ligne(page, 'Bravo Devi')).toContainText('NP')
    await expect(ligne(page, 'Bravo Devi')).toContainText('prêté → Club A')

    // B1 : libellés de palier, Échec, NP — aucun point (R8).
    await ouvrirSupport(page, 'B1')
    await expect(ligne(page, 'Alpha Ana')).toContainText('1er essai')
    await expect(ligne(page, 'Bravo Devi')).toContainText('2e essai')
    await expect(ligne(page, 'Bravo Cléo')).toContainText('Échec')
    await expect(ligne(page, 'Alpha Bob')).toContainText('NP')
    await expect(page.locator('section')).not.toContainText(/\bpts?\b|points/i)

    await ouvrirSupport(page, 'M4')
    await expect(ligne(page, 'Alpha Ana')).toContainText('NP')
  })

  test('CT-05 · coche, décoche, auteur et progression (R5/R10/R11/R18)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    await ouvrirSupport(page, 'T2')

    for (const [nom, prenom] of [['Alpha', 'Bob'], ['Bravo', 'Cléo'], ['Bravo', 'Devi']]) {
      await caseDe(page, nom!, prenom!).click()
      await expect(caseDe(page, nom!, prenom!)).toHaveAttribute('aria-checked', 'true')
    }
    const nav = page.getByRole('navigation', { name: 'Voies et blocs' })
    await expect(nav.getByRole('button', { name: /^T2\b/ })).toContainText('✓ 3/3')
    await expect(page.getByText('3/20 lignes contrôlées')).toBeVisible()
    // Auteur (partie de l'email avant « @ ») sur la ligne, détail en infobulle.
    await expect(ligne(page, 'Alpha Bob')).toContainText('✓ admin')
    await expect(ligne(page, 'Alpha Bob').locator('[title^="Contrôlé par admin le"]')).toHaveCount(1)

    // En base : horodatage + auteur = compte admin du seed.
    await expect
      .poll(() => controleLe('resultat_voie', 'voie_difficulte_id', VOIE.T2, GRIMPEURS.bob))
      .toMatch(/^\d{4}-.*\|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa$/)

    // Tableau de bord : progression globale.
    await page.goto(URL_TDB)
    await expect(page.getByRole('link', { name: /Contrôler les résultats/ })).toContainText(
      '3/20 lignes contrôlées',
    )

    // Décoche Cléo.
    await page.goto(URL_CONTROLE)
    await ouvrirSupport(page, 'T2')
    await caseDe(page, 'Bravo', 'Cléo').click()
    await expect(caseDe(page, 'Bravo', 'Cléo')).toHaveAttribute('aria-checked', 'false')
    await expect(nav.getByRole('button', { name: /^T2\b/ })).toContainText('2/3')
    await expect(ligne(page, 'Bravo Cléo')).not.toContainText('✓ admin')
    await expect
      .poll(() => controleLe('resultat_voie', 'voie_difficulte_id', VOIE.T2, GRIMPEURS.cleo))
      .toBe('null|null')
  })

  test('CT-06 · recherche et filtre « non contrôlées seulement » (R9)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    await ouvrirSupport(page, 'B1')

    await page.getByPlaceholder(/Rechercher un grimpeur/).fill('cleo')
    await expect(page.getByRole('checkbox')).toHaveCount(1)
    await expect(page.getByText('1 affiché(s) sur 4')).toBeVisible()
    await page.getByPlaceholder(/Rechercher un grimpeur/).fill('bravo devi')
    await expect(page.getByRole('checkbox')).toHaveCount(1)
    await page.getByPlaceholder(/Rechercher un grimpeur/).fill('')

    await caseDe(page, 'Alpha', 'Ana').click()
    await expect(caseDe(page, 'Alpha', 'Ana')).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Non contrôlées seulement' }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(3)
    await caseDe(page, 'Alpha', 'Bob').click()
    await expect(page.getByRole('checkbox')).toHaveCount(2)
    const nav = page.getByRole('navigation', { name: 'Voies et blocs' })
    await expect(nav.getByRole('button', { name: /^B1\b/ })).toContainText('2/4')
  })

  test('CT-07 · lecture seule en ⑤, passage non bloqué (R2/R13/R15)', async ({ page }) => {
    execSql(
      `update interclub.resultat_bloc set controle_le = now(),
         controle_par = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       where bloc_id = '${BLOC.B1}' and grimpeur_id = '${GRIMPEURS.ana}';`,
    )
    poserPhase('resultats_publics')
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    await expect(page.getByText('contrôle consultable en lecture seule')).toBeVisible()
    await ouvrirSupport(page, 'B1')
    await expect(caseDe(page, 'Alpha', 'Ana')).toHaveAttribute('aria-checked', 'true')
    await expect(ligne(page, 'Alpha Ana')).toContainText('✓ admin')
    for (const c of await page.getByRole('checkbox').all()) await expect(c).toBeDisabled()
    // Pas d'indicateur temps réel en ⑤.
    await expect(page.getByText('En direct', { exact: true })).toHaveCount(0)
  })

  test('CT-10 · refus d’écriture hors ④ (R13)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    await ouvrirSupport(page, 'T2')
    poserPhase('resultats_publics') // l'onglet reste ouvert en ④
    await caseDe(page, 'Alpha', 'Bob').click()
    await expect(page.locator('p[role="alert"]')).toContainText("n'est modifiable qu'en clôture")
    await expect(caseDe(page, 'Alpha', 'Bob')).toHaveAttribute('aria-checked', 'false')
    expect(controleLe('resultat_voie', 'voie_difficulte_id', VOIE.T2, GRIMPEURS.bob)).toBe(
      'null|null',
    )
  })

  test('CT-11 · coche conservée après correction du résultat (R14/R16)', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    await ouvrirSupport(page, 'M3')
    await expect(ligne(page, 'Alpha Ana')).toContainText('Échec')
    await caseDe(page, 'Alpha', 'Ana').click()
    await expect(caseDe(page, 'Alpha', 'Ana')).toHaveAttribute('aria-checked', 'true')
    // La coche est optimiste : attendre l'écriture serveur avant de la relever.
    await expect
      .poll(() => controleLe('resultat_voie', 'voie_difficulte_id', VOIE.M3, GRIMPEURS.ana))
      .not.toBe('null|null')
    const avant = controleLe('resultat_voie', 'voie_difficulte_id', VOIE.M3, GRIMPEURS.ana)

    // Correction (équivalent saisie admin, spec #9) : seule l'issue change.
    execSql(
      `update interclub.resultat_voie set issue = 'top', auteur_role = 'admin'
        where voie_difficulte_id = '${VOIE.M3}' and grimpeur_id = '${GRIMPEURS.ana}';`,
    )
    await page.reload()
    await ouvrirSupport(page, 'M3')
    await expect(ligne(page, 'Alpha Ana')).toContainText('Top')
    await expect(caseDe(page, 'Alpha', 'Ana')).toHaveAttribute('aria-checked', 'true')
    expect(controleLe('resultat_voie', 'voie_difficulte_id', VOIE.M3, GRIMPEURS.ana)).toBe(avant)
    // Aucune action « écart » (R16).
    await expect(page.getByRole('button', { name: /écart/i })).toHaveCount(0)
  })

  test('CT-08/CT-09 · temps réel entre deux admins + rattrapage (R11/R12/R12bis)', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()
    await commeAdmin(a)
    await seConnecter(b, ADMIN2)
    await a.goto(URL_CONTROLE)
    await b.goto(URL_CONTROLE)
    await ouvrirSupport(a, 'B2')
    await ouvrirSupport(b, 'B2')
    await b.getByRole('button', { name: 'Non contrôlées seulement' }).click()
    await expect(b.getByRole('checkbox')).toHaveCount(4)
    // Laisser le canal s'établir.
    await expect(a.getByText('En direct', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(b.getByText('En direct', { exact: true })).toBeVisible({ timeout: 15_000 })

    await caseDe(a, 'Alpha', 'Bob').click()
    // Sans action de B : la ligne disparaît de sa liste filtrée, B2 reste choisi.
    await expect(b.getByRole('checkbox')).toHaveCount(3, { timeout: 10_000 })
    await expect(b.getByRole('heading', { level: 2 })).toContainText('B2')
    await expect(b.getByRole('button', { name: 'Non contrôlées seulement' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      b.getByRole('navigation', { name: 'Voies et blocs' }).getByRole('button', { name: /^B2\b/ }),
    ).toContainText('1/4')
    await b.getByRole('button', { name: 'Non contrôlées seulement' }).click()
    await expect(ligne(b, 'Alpha Bob')).toContainText('✓ admin')

    // Inversement : une coche de B apparaît chez A avec l'auteur « admin2 ».
    await caseDe(b, 'Bravo', 'Cléo').click()
    await expect(caseDe(a, 'Bravo', 'Cléo')).toHaveAttribute('aria-checked', 'true', {
      timeout: 10_000,
    })
    await expect(ligne(a, 'Bravo Cléo')).toContainText('✓ admin2')

    // CT-09 · coupure réseau chez B : indicateur interrompu, puis rattrapage.
    await ctxB.setOffline(true)
    await expect(b.getByText('Hors ligne', { exact: true })).toBeVisible()
    await caseDe(a, 'Alpha', 'Ana').click()
    await caseDe(a, 'Bravo', 'Devi').click()
    await expect(caseDe(a, 'Bravo', 'Devi')).toHaveAttribute('aria-checked', 'true')
    await ctxB.setOffline(false)
    await expect(caseDe(b, 'Alpha', 'Ana')).toHaveAttribute('aria-checked', 'true', {
      timeout: 15_000,
    })
    await expect(caseDe(b, 'Bravo', 'Devi')).toHaveAttribute('aria-checked', 'true')

    await ctxA.close()
    await ctxB.close()
  })

  test('CT-12 · mobile : une colonne, cases tactiles, pas de défilement horizontal (R17)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true })
    const page = await ctx.newPage()
    await commeAdmin(page)
    await page.goto(URL_CONTROLE)
    await ouvrirSupport(page, 'B1')
    await expect(page.getByRole('navigation', { name: 'Voies et blocs' })).toBeHidden()
    const box = await caseDe(page, 'Alpha', 'Ana').boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await caseDe(page, 'Alpha', 'Ana').tap()
    await expect(caseDe(page, 'Alpha', 'Ana')).toHaveAttribute('aria-checked', 'true')
    // Page entière (barre de navigation comprise, repliée en menu — D4) :
    // aucun défilement horizontal.
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(debordement).toBe(0)
    await page.getByRole('button', { name: '← Voies et blocs' }).click()
    await expect(page.getByRole('navigation', { name: 'Voies et blocs' })).toBeVisible()
    await ctx.close()
  })
})
