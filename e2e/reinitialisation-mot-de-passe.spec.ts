import type { APIRequestContext, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { MDP } from './helpers/donnees'
import { execSql } from './helpers/sql'

/**
 * Cahier 35 — Réinitialisation du mot de passe (spec #2 R48–R53, rév.
 * 2026-11-22). Requiert la stack locale (modèle d'e-mail branché par
 * supabase/config.toml) + Mailpit (boîte de test, port 54324) + seed.
 * Compte utilisé : coach2 (coach permanent Club A) ; son mot de passe est remis
 * à la valeur du seed après chaque test.
 */

const EMAIL = 'coach2@test.local'
const NOUVEAU = 'nouveau-mdp-e2e'
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

test.describe.configure({ mode: 'serial' })

function remettreMotDePasseDuSeed(): void {
  execSql(
    `update auth.users set encrypted_password = extensions.crypt('${MDP}', extensions.gen_salt('bf'))
     where email = '${EMAIL}';`,
  )
}

async function viderBoite(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT}/api/v1/messages`)
}

/** Chemin (+ requête) du lien de l'e-mail reçu par `email`, rapporté à l'app testée. */
async function lienRecu(request: APIRequestContext, email: string): Promise<string> {
  let id: string | undefined
  await expect
    .poll(
      async () => {
        const r = await request.get(`${MAILPIT}/api/v1/search?query=to:${email}`)
        id = (await r.json()).messages?.[0]?.ID
        return id
      },
      { timeout: 15_000 },
    )
    .toBeTruthy()
  const message = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()
  const href = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML)?.[1]
  expect(href, 'lien /auth/confirm dans l’e-mail').toBeTruthy()
  const url = new URL(href!.replace(/&amp;/g, '&'))
  return `${url.pathname}${url.search}`
}

async function demander(page: Page, email: string): Promise<void> {
  await page.goto('/connexion')
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
  await expect(page).toHaveURL(/\/mot-de-passe-oublie$/)
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('button', { name: 'Recevoir le lien' }).click()
  await expect(
    page.getByText('Si un compte existe pour cette adresse, un e-mail vient de lui être envoyé.'),
  ).toBeVisible()
}

async function saisir(page: Page, motDePasse: string, confirmation = motDePasse): Promise<void> {
  await page.getByLabel('Nouveau mot de passe').fill(motDePasse)
  await page.getByLabel('Confirmer le mot de passe').fill(confirmation)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
}

test.describe('Cahier 35 — réinitialisation du mot de passe (spec #2 R48–R53)', () => {
  test.beforeEach(async ({ request }) => {
    remettreMotDePasseDuSeed()
    await viderBoite(request)
  })
  test.afterAll(() => remettreMotDePasseDuSeed())

  test('CT-01 · parcours nominal : e-mail, nouveau mot de passe, connecté (R48, R50, R51)', async ({
    page,
    request,
  }) => {
    await demander(page, EMAIL)
    const lien = await lienRecu(request, EMAIL)

    await page.goto(lien)
    await expect(page).toHaveURL(/\/mot-de-passe\/nouveau\?token_hash=/)
    await saisir(page, NOUVEAU)
    await expect(page).toHaveURL(/\/coach$/)

    // L'ancien mot de passe ne fonctionne plus, le nouveau oui.
    await page.context().clearCookies()
    await page.goto('/connexion')
    await page.getByLabel('E-mail').fill(EMAIL)
    await page.getByLabel('Mot de passe').fill(MDP)
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page.locator('p[role="alert"]')).toHaveText('Identifiants invalides.')
    // Le formulaire est réinitialisé après l'échec : on ressaisit tout.
    await page.getByLabel('E-mail').fill(EMAIL)
    await page.getByLabel('Mot de passe').fill(NOUVEAU)
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL(/\/coach$/)
  })

  test('CT-02 · adresse inconnue : même message, aucun e-mail (R49)', async ({ page, request }) => {
    await demander(page, 'inconnu-e2e@test.local')
    await page.waitForTimeout(1500)
    const r = await request.get(`${MAILPIT}/api/v1/search?query=to:inconnu-e2e@test.local`)
    expect((await r.json()).messages ?? []).toHaveLength(0)
  })

  test('CT-03 · adresse mal formée refusée sans envoi (R49)', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie')
    // Accepté par le navigateur (`type=email`), refusé par le contrôle serveur.
    await page.getByLabel('E-mail').fill('pas@valide')
    await page.getByRole('button', { name: 'Recevoir le lien' }).click()
    await expect(page.locator('p[role="alert"]')).toHaveText("L'e-mail n'est pas valide.")
  })

  test('CT-04 · saisie refusée sans consommer le lien, puis succès (R51, R52)', async ({
    page,
    request,
  }) => {
    await demander(page, EMAIL)
    const lien = await lienRecu(request, EMAIL)
    await page.goto(lien)

    await saisir(page, 'abcde')
    await expect(page.locator('p[role="alert"]')).toHaveText(
      'Le mot de passe doit contenir au moins 6 caractères.',
    )
    await saisir(page, NOUVEAU, `${NOUVEAU}x`)
    await expect(page.locator('p[role="alert"]')).toHaveText('Les deux mots de passe ne correspondent pas.')

    await saisir(page, NOUVEAU)
    await expect(page).toHaveURL(/\/coach$/)
  })

  test('CT-05 · ouvrir le lien ne le consomme pas ; réutilisé → refusé (R52)', async ({
    page,
    request,
    browser,
  }) => {
    await demander(page, EMAIL)
    const lien = await lienRecu(request, EMAIL)

    // Un « robot de messagerie » ouvre le lien avant l'utilisateur.
    const robot = await request.get(lien, { maxRedirects: 5 })
    expect(robot.ok()).toBe(true)

    await page.goto(lien)
    await saisir(page, NOUVEAU)
    await expect(page).toHaveURL(/\/coach$/)

    // Le même lien, dans un autre navigateur : refusé à l'enregistrement.
    const autre = await browser.newPage()
    await autre.goto(lien)
    await saisir(autre, 'encore-un-autre')
    await expect(autre.locator('p[role="alert"]')).toHaveText(
      'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.',
    )
    await expect(autre.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
    await autre.close()
  })

  test('CT-06 · lien invalide refusé, rien modifié (R52)', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=pasvalide&type=recovery')
    await saisir(page, NOUVEAU)
    await expect(page.locator('p[role="alert"]')).toHaveText(
      'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.',
    )
    expect(
      execSql(
        `select encrypted_password = extensions.crypt('${MDP}', encrypted_password)
         from auth.users where email = '${EMAIL}';`,
      ),
    ).toBe('t')
  })

  test('CT-07 · écran sans lien → demande ; appel direct refusé (R53)', async ({ page }) => {
    await page.goto('/mot-de-passe/nouveau')
    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/)

    // Même connecté par mot de passe, l'écran exige le lien.
    await page.goto('/connexion')
    await page.getByLabel('E-mail').fill(EMAIL)
    await page.getByLabel('Mot de passe').fill(MDP)
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL(/\/coach$/)
    await page.goto('/mot-de-passe/nouveau')
    await expect(page).not.toHaveURL(/\/mot-de-passe\/nouveau/)

    // Envoi direct de l'action sans lien, avec cette session ordinaire : refusé.
    await page.goto('/mot-de-passe/nouveau?token_hash=x')
    await page.locator('input[name="tokenHash"]').evaluate((el) => el.setAttribute('value', ''))
    await saisir(page, NOUVEAU)
    await expect(page.locator('p[role="alert"]')).toHaveText(
      'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.',
    )
    expect(
      execSql(
        `select encrypted_password = extensions.crypt('${MDP}', encrypted_password)
         from auth.users where email = '${EMAIL}';`,
      ),
    ).toBe('t')
  })
})
