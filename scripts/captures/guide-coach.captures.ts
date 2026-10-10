import { test, expect, type Page } from '@playwright/test'

import { commeCoach } from '../../e2e/helpers/auth'
import { CLUB_A, JETON, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from '../../e2e/helpers/donnees'
import {
  execSql,
  nettoyerSessionsQr,
  poserDate,
  poserPhase,
  reinitialiserEngagement,
} from '../../e2e/helpers/sql'

import {
  capturer as capturerVers,
  capturerBloc as capturerBlocVers,
  effacerReperes,
  masquerOutilsDev,
  numeroter,
} from './outils'

/**
 * Captures d'écran du guide coach (docs/guides/coach/). Rejoue le parcours d'un
 * coach sur la stack LOCALE au seed (`npm run db:reset`) et photographie chaque
 * écran au format téléphone, boutons d'action numérotés.
 *
 * Lancer : `npm run doc:captures`. Les PNG sont écrasés à chaque passage ; la
 * rencontre pilote est remise à l'état seed à la fin.
 */

const DOSSIER = 'docs/guides/coach/captures'
const ADO = 'adadadad-adad-adad-adad-adadadadadad'

const capturer = (page: Page, nom: string, options?: { pleinePage?: boolean }) =>
  capturerVers(page, `${DOSSIER}/${nom}.png`, options)
const capturerBloc = (page: Page, bloc: Parameters<typeof capturerBlocVers>[1], nom: string) =>
  capturerBlocVers(page, bloc, `${DOSSIER}/${nom}.png`)

/** Invitation active du Club A (créée si absente). */
function invitationClubA(): string {
  const existante = execSql(
    `select valeur from interclub.invitation_coach where club_id = '${CLUB_A}' and actif;`,
  )
  if (existante) return existante
  return execSql(
    `insert into interclub.invitation_coach (club_id) values ('${CLUB_A}') returning valeur;`,
  ).split('\n')[0]
}

function etatSeed(): void {
  reinitialiserEngagement()
  poserPhase('pre_competition')
  poserDate(RENCONTRE_PILOTE_DATE)
  nettoyerSessionsQr()
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(etatSeed)
test.afterAll(etatSeed)
test.beforeEach(({ page }) => masquerOutilsDev(page))

test('01 — inscription et connexion', async ({ page }) => {
  await page.goto(`/inscription?invitation=${invitationClubA()}`)
  await numeroter(page, [
    page.getByLabel('E-mail'),
    page.getByLabel('Mot de passe', { exact: true }),
    page.getByLabel('Confirmer le mot de passe'),
    page.getByRole('button', { name: /créer mon compte/i }),
  ])
  await capturer(page, '01-inscription')

  await page.goto('/connexion')
  await numeroter(page, [
    page.getByLabel('E-mail'),
    page.getByLabel('Mot de passe'),
    page.getByRole('button', { name: /se connecter/i }),
  ])
  await capturer(page, '02-connexion')
})

test('02 — mes rencontres et menu', async ({ page }) => {
  await commeCoach(page)
  await page.goto('/coach')
  await numeroter(page, [
    page.getByRole('link', { name: /Enfant/i }),
    page.getByRole('button', { name: /Menu/ }),
    page.getByRole('button', { name: 'Se déconnecter' }),
  ])
  await capturer(page, '03-mes-rencontres')

  await effacerReperes(page)
  await page.getByRole('button', { name: /Menu/ }).click()
  await expect(page.getByRole('link', { name: 'Jetons' })).toBeVisible()
  await numeroter(page, [
    page.getByRole('link', { name: 'Mes rencontres' }),
    page.getByRole('link', { name: 'Jetons' }),
  ])
  await capturer(page, '04-menu', { pleinePage: false })
})

test('03 — engagement des équipes', async ({ page }) => {
  await commeCoach(page)
  await page.goto(`/coach/rencontres/${RENCONTRE_PILOTE}`)
  await expect(page.getByText('Équipe A1')).toBeVisible()
  await capturer(page, '05-engagement')

  // Carte de l'équipe A1 : le plus petit bloc arrondi qui contient son titre et
  // le bouton de suppression.
  const equipe = page
    .locator('div.rounded-2xl, section')
    .filter({ hasText: 'Équipe A1' })
    .filter({ has: page.getByRole('button', { name: 'Supprimer l’équipe' }) })
    .last()
  await numeroter(page, [
    equipe.getByRole('combobox').first(),
    equipe.getByRole('button', { name: 'OK' }).first(),
    equipe.getByRole('button', { name: /^Retirer / }).first(),
    equipe.getByPlaceholder(/Rechercher/),
    equipe.getByRole('combobox').nth(2),
    equipe.getByRole('combobox').nth(3),
    equipe.getByRole('button', { name: 'Ajouter à l’équipe' }),
    equipe.getByRole('button', { name: 'Supprimer l’équipe' }),
  ])
  await capturerBloc(page, equipe, '06-engagement-equipe')

  const nouvelle = page.locator('form', { has: page.getByRole('button', { name: 'Créer l’équipe' }) })
  await numeroter(page, [
    nouvelle.getByRole('textbox'),
    nouvelle.getByRole('button', { name: 'Créer l’équipe' }),
  ])
  await capturerBloc(page, nouvelle, '07-engagement-nouvelle-equipe')
})

test('04 — jetons QR du coach temporaire', async ({ page }) => {
  await commeCoach(page)
  await page.goto('/coach/jetons')
  await numeroter(page, [
    page.getByRole('button', { name: 'Générer le jeton' }),
    page.getByRole('button', { name: 'Régénérer' }),
    page.getByRole('button', { name: 'Révoquer' }),
  ])
  await capturer(page, '08-jetons')
})

test('05 — saisie des résultats', async ({ page }) => {
  await commeCoach(page)
  await page.goto(`/coach/rencontres/${ADO}/resultats`)
  await numeroter(page, [
    page.getByRole('link', { name: /Voir le classement/ }),
    page.getByRole('button', { name: 'Par équipe' }),
    page.getByRole('button', { name: 'Alphabétique' }),
    page.getByRole('button', { name: /^Nora Delta/ }),
  ])
  await capturer(page, '09-resultats-liste')

  await effacerReperes(page)
  await page.getByRole('button', { name: /^Nora Delta/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
  await numeroter(page, [
    page.getByRole('button', { name: '← Liste des grimpeurs' }),
    page.getByRole('button', { name: 'Grimpeur précédent' }),
    page.getByRole('button', { name: 'Grimpeur suivant' }),
    page.getByRole('combobox').first(),
    page.getByRole('button', { name: 'Top' }),
    page.getByRole('button', { name: 'Bloc complet' }).first(),
  ])
  await capturer(page, '10-resultats-grimpeur')
})

test('06 — classement', async ({ page }) => {
  await commeCoach(page)
  await page.goto(`/coach/rencontres/${ADO}/classement`)
  await numeroter(page, [
    page.getByRole('button', { name: 'Individuel' }),
    page.getByRole('button', { name: 'Femmes' }),
    page.getByRole('searchbox'),
    page.getByRole('button', { name: 'Mon club' }),
    page.getByRole('combobox').first(),
  ])
  await capturer(page, '11-classement')
})

test('07 — coach temporaire (scan du QR)', async ({ page }) => {
  // Le coach temporaire n'est actif que le jour J, en préparation/compétition.
  poserPhase('preparation')
  poserDate('today')
  nettoyerSessionsQr()

  await page.goto(`/scan?jeton=${JETON.coachTemp}`)
  await page.waitForURL('**/coach/rencontres/**')
  await page.getByRole('button', { name: /Menu/ }).click()
  await numeroter(page, [
    page.getByRole('link', { name: 'Ma rencontre' }),
    page.getByRole('link', { name: 'Classement' }),
    page.getByRole('button', { name: /Terminer/ }),
  ])
  await capturer(page, '12-coach-temporaire', { pleinePage: false })
})
