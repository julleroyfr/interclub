import { readFileSync } from 'node:fs'

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

/** Rencontre Ado en ③ du seed opt-in 04 : « T4 a », « T4 b », « T5 Jaune », « T5 b »… */
const ADO_REPERES = 'aeaeaeae-0000-0000-0000-000000000002'
const NORA = 'adadadad-0000-0000-0000-0000000000c1'

/** Seed opt-in 04 (voies doublées et repères, spec #3 R49/R50) + 2 résultats de Nora. */
function chargerDemoReperes(): void {
  execSql(readFileSync('supabase/seed/04-demo-repere-voies.sql', 'utf8'))
  execSql(
    `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
       select v.id, '${NORA}', g.issue from interclub.voie_difficulte v
         join interclub.epreuve e on e.id = v.epreuve_id
         join (values ('T5', 'Jaune', 'top'), ('T4', null, 'zone1')) as g(niveau, repere, issue)
           on g.niveau = v.niveau and v.repere is not distinct from g.repere
        where e.rencontre_id = '${ADO_REPERES}'
          and v.ordre = (select max(v2.ordre) from interclub.voie_difficulte v2
                          where v2.epreuve_id = v.epreuve_id and v2.niveau = v.niveau
                            and v2.repere is not distinct from g.repere);`,
  )
}

/** Rencontre adulte de démonstration (seed opt-in 05) : du jour, Club B, en ③. */
const DEMO_ADULTE = `categorie = 'adulte' and club_porteur_id = '22222222-2222-2222-2222-222222222222'`

function etatSeed(): void {
  execSql(`delete from interclub.rencontre where id::text like 'aeaeaeae-%';`)
  execSql(`delete from interclub.rencontre where ${DEMO_ADULTE};`)
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

test('05b — voies doublées (Ado)', async ({ page }) => {
  chargerDemoReperes()
  await commeCoach(page)
  await page.goto(`/coach/rencontres/${ADO_REPERES}/resultats`)
  await page.getByRole('button', { name: /^Nora Delta/ }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
  await numeroter(page, [
    page.getByText('T4 b', { exact: true }),
    page.getByText('T5 Jaune', { exact: true }),
    page.getByRole('combobox').first(),
  ])
  await capturer(page, '13-voies-doublees')
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

test('08 — rencontre adulte', async ({ page }) => {
  execSql(readFileSync('supabase/seed/05-demo-adulte.sql', 'utf8'))
  const id = execSql(`select id from interclub.rencontre where ${DEMO_ADULTE};`)
  await commeCoach(page)
  await page.goto('/coach')
  const carte = page.locator(`a[href="/coach/rencontres/${id}/classement"]`)
  await expect(carte).toContainText('3 grimpeurs')
  await numeroter(page, [carte])
  await capturer(page, '14-rencontre-adulte', { pleinePage: false })
  execSql(`delete from interclub.rencontre where ${DEMO_ADULTE};`)
})
