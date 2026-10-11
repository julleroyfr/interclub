import type { Browser, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, seConnecter } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Cahier 30 — Invitation administrateur (spec #2 R35–R40, rév. 2026-10-09 —
 * TODO D7). Requiert la stack locale + seed + dev server (port 3011).
 *
 * Série + un seul worker : une seule invitation administrateur active à la fois.
 */

const MDP = 'motdepasse'
const EMAIL_NOMINAL = 'admin-e2e-invitation@test.local'
const EMAIL_EXPIRE = 'admin-e2e-expire@test.local'
const EMAIL_SECOND = 'admin-e2e-second@test.local'
const EMAILS = [EMAIL_NOMINAL, EMAIL_EXPIRE, EMAIL_SECOND]

function nettoyer(): void {
  execSql(
    `delete from auth.users where email in (${EMAILS.map((e) => `'${e}'`).join(', ')});
     delete from interclub.invitation_admin;`,
  )
}

const compteExiste = (email: string) =>
  execSql(`select count(*) from auth.users where email = '${email}';`) === '1'

const roleDe = (email: string) =>
  execSql(
    `select c.role from interclub.compte c join auth.users u on u.id = c.utilisateur_id
      where u.email = '${email}';`,
  )

/** Génère une invitation depuis l'écran « Mapping de rôle » et renvoie son URL. */
async function generer(page: Page): Promise<string> {
  await page.goto('/admin/mapping')
  const code = page.locator('code', { hasText: 'invitation_admin=' })
  const precedente = (await code.count()) ? (await code.innerText()).trim() : null
  await page.getByRole('button', { name: /^(Générer une invitation|Régénérer l’invitation)$/ }).click()
  // Attendre l'écran rafraîchi : une URL nouvelle (régénération) ou la première.
  await expect
    .poll(async () => ((await code.count()) ? (await code.innerText()).trim() : null))
    .not.toBe(precedente)
  const url = (await code.innerText()).trim()
  expect(url).toMatch(/\/inscription\?invitation_admin=[0-9a-f-]{36}$/)
  return url
}

/** Ouvre l'invitation dans un navigateur vierge (personne invitée). */
async function ouvrirInvitation(browser: Browser, url: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  return { ctx, page }
}

async function remplir(page: Page, email: string): Promise<void> {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
  await page.getByLabel('Confirmer le mot de passe').fill(MDP)
  await page.getByRole('button', { name: /créer mon compte/i }).click()
}

const invalide = (page: Page) => page.getByRole('heading', { name: 'Invitation invalide' })

test.describe('Cahier 30 — Invitation administrateur (spec #2 R35–R40)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(nettoyer)
  test.afterAll(nettoyer)

  test('CT-01/02/03 · générer, s’inscrire, devenir admin ; invitation consommée (R35, R36, R38, R40)', async ({
    page,
    browser,
  }) => {
    await commeAdmin(page)
    const url = await generer(page)
    await expect(page.getByText('Valable', { exact: true })).toBeVisible()
    await expect(page.getByText(/expire dans 1[45]:\d\d/)).toBeVisible()

    const invite = await ouvrirInvitation(browser, url)
    await expect(
      invite.page.getByRole('heading', { name: 'Créer votre compte administrateur' }),
    ).toBeVisible()
    await remplir(invite.page, EMAIL_NOMINAL)
    await expect(invite.page).toHaveURL(/\/connexion\?inscrit=1/)
    expect(roleDe(EMAIL_NOMINAL)).toBe('admin')

    // Le nouveau compte se connecte et arrive dans l'espace admin.
    await seConnecter(invite.page, { email: EMAIL_NOMINAL, mdp: MDP })
    await expect(invite.page).toHaveURL(/\/admin$/)
    await invite.ctx.close()

    // L'invitation est consommée : état « Utilisée », URL inutilisable (R36, R40).
    await page.reload()
    await expect(page.getByText('Utilisée', { exact: true })).toBeVisible()
    await expect(page.getByAltText("QR de l'invitation administrateur")).toHaveCount(0)
    const reutilisation = await ouvrirInvitation(browser, url)
    await expect(invalide(reutilisation.page)).toBeVisible()
    await reutilisation.ctx.close()
  })

  test('CT-04 · régénérer invalide la précédente (R37)', async ({ page, browser }) => {
    await commeAdmin(page)
    const ancienne = await generer(page)
    const nouvelle = await generer(page)
    expect(nouvelle).not.toBe(ancienne)

    const a = await ouvrirInvitation(browser, ancienne)
    await expect(invalide(a.page)).toBeVisible()
    await a.ctx.close()
    const n = await ouvrirInvitation(browser, nouvelle)
    await expect(
      n.page.getByRole('heading', { name: 'Créer votre compte administrateur' }),
    ).toBeVisible()
    await n.ctx.close()
  })

  test('CT-05 · révocation (R37)', async ({ page, browser }) => {
    await commeAdmin(page)
    const url = await generer(page)
    await page.getByRole('button', { name: 'Révoquer' }).click()
    await expect(page.getByText('Révoquée', { exact: true })).toBeVisible()
    const r = await ouvrirInvitation(browser, url)
    await expect(invalide(r.page)).toBeVisible()
    await r.ctx.close()
  })

  test('CT-06 · expirée après 15 minutes (R36, R40)', async ({ page, browser }) => {
    await commeAdmin(page)
    const url = await generer(page)
    execSql(`update interclub.invitation_admin set expire_le = now() - interval '1 second' where actif;`)

    await page.reload()
    await expect(page.getByText('Expirée', { exact: true })).toBeVisible()
    const e = await ouvrirInvitation(browser, url)
    await expect(invalide(e.page)).toBeVisible()
    await e.ctx.close()
  })

  test('CT-07 · formulaire ouvert avant l’expiration, envoyé après → refus (R39)', async ({
    page,
    browser,
  }) => {
    await commeAdmin(page)
    const url = await generer(page)
    const invite = await ouvrirInvitation(browser, url)
    await expect(
      invite.page.getByRole('heading', { name: 'Créer votre compte administrateur' }),
    ).toBeVisible()

    execSql(`update interclub.invitation_admin set expire_le = now() - interval '1 second' where actif;`)
    await remplir(invite.page, EMAIL_EXPIRE)
    await expect(
      invite.page.getByRole('alert').filter({ hasText: 'Cette invitation a expiré' }),
    ).toBeVisible()
    expect(compteExiste(EMAIL_EXPIRE)).toBe(false)
    await invite.ctx.close()
  })

  test('CT-08 · deux inscriptions avec la même invitation → un seul compte (R38)', async ({
    page,
    browser,
  }) => {
    await commeAdmin(page)
    const url = await generer(page)
    const premier = await ouvrirInvitation(browser, url)
    const second = await ouvrirInvitation(browser, url)

    await remplir(premier.page, EMAIL_NOMINAL)
    await expect(premier.page).toHaveURL(/\/connexion\?inscrit=1/)
    // Le second formulaire, ouvert avant la consommation, est refusé à l'envoi.
    await remplir(second.page, EMAIL_SECOND)
    await expect(
      second.page.getByRole('alert').filter({ hasText: 'déjà été utilisée' }),
    ).toBeVisible()
    expect(compteExiste(EMAIL_SECOND)).toBe(false)

    await premier.ctx.close()
    await second.ctx.close()
  })
})
