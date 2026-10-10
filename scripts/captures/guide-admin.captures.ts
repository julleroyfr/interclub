import { expect, test, type Locator, type Page } from '@playwright/test'

import { commeAdmin } from '../../e2e/helpers/auth'
import { RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from '../../e2e/helpers/donnees'
import {
  execSql,
  nettoyerSessionsQr,
  poserDate,
  poserPhase,
  reinitialiserEngagement,
} from '../../e2e/helpers/sql'

import {
  ORDINATEUR,
  capturer as capturerVers,
  capturerBloc as capturerBlocVers,
  effacerReperes,
  masquerOutilsDev,
  numeroter,
} from './outils'

/**
 * Captures d'écran du guide administrateur (docs/guides/admin/), au format
 * ordinateur. La rencontre Ado du seed reçoit quelques résultats le temps du
 * parcours (saisie, contrôle, classement, export), puis tout est remis à l'état
 * seed : résultats purgés, phases et dates d'origine.
 *
 * Lancer : `npm run doc:captures`.
 */

const DOSSIER = 'docs/guides/admin/captures'
const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const NORA = 'adadadad-0000-0000-0000-0000000000c1'
const OWEN = 'adadadad-0000-0000-0000-0000000000c2'

const capturer = (page: Page, nom: string, options?: { pleinePage?: boolean }) =>
  capturerVers(page, `${DOSSIER}/${nom}.png`, options)
const capturerBloc = (page: Page, bloc: Locator, nom: string) =>
  capturerBlocVers(page, bloc, `${DOSSIER}/${nom}.png`)

function purgerResultatsAdo(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id = '${ADO}');
     delete from interclub.resultat_bloc where bloc_id in (
       select b.id from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
        where e.rencontre_id = '${ADO}');
     delete from interclub.temps_vitesse where epreuve_id in (
       select id from interclub.epreuve where rencontre_id = '${ADO}');`,
  )
}

/** Quelques résultats Ado (voies, blocs, vitesse) pour des écrans parlants. */
function poserResultatsAdo(): void {
  purgerResultatsAdo()
  execSql(
    `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
       select v.id, g.id, g.issue from interclub.voie_difficulte v
         join interclub.epreuve e on e.id = v.epreuve_id
         join (values ('T4', '${NORA}'::uuid, 'top'), ('T5', '${NORA}'::uuid, 'zone2'),
                      ('T4', '${OWEN}'::uuid, 'zone1'), ('T6', '${OWEN}'::uuid, 'top'))
              as g(niveau, id, issue) on g.niveau = v.niveau
        where e.rencontre_id = '${ADO}'
          and v.id = (select min(v2.id::text)::uuid from interclub.voie_difficulte v2
                       where v2.epreuve_id = v.epreuve_id and v2.niveau = v.niveau);
     insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
       ('adadadad-0000-0000-0000-0000000000b1', '${NORA}', 'palier', 'adadadad-0000-0000-0000-00000000b102'),
       ('adadadad-0000-0000-0000-0000000000b1', '${OWEN}', 'palier', 'adadadad-0000-0000-0000-00000000b101'),
       ('adadadad-0000-0000-0000-0000000000b2', '${NORA}', 'echec', null);
     insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps) values
       ('adadadad-0000-0000-0000-0000000000a3', '${NORA}', 'temps', 9.512),
       ('adadadad-0000-0000-0000-0000000000a3', '${OWEN}', 'temps', 8.204);`,
  )
}

function phaseAdo(phase: 'competition' | 'cloture' | 'resultats_publics'): void {
  execSql(`update interclub.rencontre set phase = '${phase}' where id = '${ADO}';`)
}

function etatSeed(): void {
  purgerResultatsAdo()
  phaseAdo('competition')
  reinitialiserEngagement()
  poserPhase('pre_competition')
  poserDate(RENCONTRE_PILOTE_DATE)
  nettoyerSessionsQr()
}

const lien = (page: Page, nom: string | RegExp) => page.getByRole('link', { name: nom }).first()
const bouton = (page: Page, nom: string | RegExp) => page.getByRole('button', { name: nom }).first()

test.describe.configure({ mode: 'serial' })
test.use(ORDINATEUR)
test.beforeAll(etatSeed)
test.afterAll(etatSeed)
test.beforeEach(async ({ page }) => {
  await masquerOutilsDev(page)
  await commeAdmin(page)
})

test('01 — tableau de bord', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  await numeroter(page, [
    page.getByRole('navigation').first(),
    bouton(page, 'Préparation jour J →'),
    lien(page, /Jetons QR de cette rencontre/),
    lien(page, 'Gérer →'),
    page.getByText('Accès', { exact: true }).locator('..'),
  ])
  await capturer(page, '01-tableau-de-bord')
})

test('02 — liste des rencontres', async ({ page }) => {
  await page.goto('/admin/rencontres')
  await numeroter(page, [
    page.locator('input[name="dateRencontre"]'),
    bouton(page, 'Créer la rencontre'),
    page.getByRole('combobox').filter({ hasText: '2026–2027' }),
    bouton(page, 'Préparation jour J →'),
    page.getByRole('link', { name: 'Tableau de bord', exact: true }).nth(1),
    bouton(page, 'Modifier'),
    bouton(page, 'Supprimer'),
  ])
  await capturer(page, '02-rencontres')
})

test('03 — tableau de bord d’une rencontre', async ({ page }) => {
  await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
  await numeroter(page, [
    bouton(page, 'Avancer à la phase suivante'),
    lien(page, /Jetons QR/),
    bouton(page, /Voies de difficulté/),
    bouton(page, '+ Voie'),
    bouton(page, 'Créer le prêt'),
    page.locator('summary').filter({ hasText: 'Club A' }),
  ])
  await capturer(page, '03-rencontre')

  await effacerReperes(page)
  const clubA = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Club A' }) })
  await clubA.locator('summary').click()
  await expect(clubA.getByRole('button', { name: 'Retirer Ana Alpha' })).toBeVisible()
  await numeroter(page, [
    clubA.getByRole('combobox').first(),
    clubA.getByRole('button', { name: 'Retirer Ana Alpha' }),
    clubA.getByRole('combobox').nth(1),
    clubA.getByPlaceholder(/Rechercher un nom ou prénom/).first(),
    clubA.getByRole('button', { name: 'Ajouter', exact: true }).first(),
    clubA.getByRole('button', { name: /Supprimer l'équipe Équipe A1/ }),
    clubA.getByRole('button', { name: 'Créer', exact: true }),
  ])
  await capturerBloc(page, clubA, '04-rencontre-equipes')
})

test('04 — jetons QR d’une rencontre', async ({ page }) => {
  await page.goto(`/admin/jetons?rencontre=${RENCONTRE_PILOTE}`)
  await numeroter(page, [
    bouton(page, 'Régénérer'),
    bouton(page, 'Révoquer'),
    bouton(page, 'Générer le jeton'),
  ])
  await capturer(page, '05-jetons')
})

test('05 — clubs et invitation coach', async ({ page }) => {
  await page.goto('/admin/clubs')
  await numeroter(page, [
    page.locator('summary').filter({ hasText: 'Nouveau club' }),
    bouton(page, /Afficher le QR de l’invitation coach/),
    bouton(page, 'Renommer'),
    bouton(page, 'Supprimer'),
  ])
  await capturer(page, '06-clubs')

  await effacerReperes(page)
  await bouton(page, /Afficher le QR de l’invitation coach/).click()
  await page.waitForTimeout(500)
  await capturer(page, '07-clubs-invitation', { pleinePage: false })
})

test('06 — grimpeurs et imports', async ({ page }) => {
  await page.goto('/admin/grimpeurs')
  await numeroter(page, [
    lien(page, /Importer des licenciés/),
    page.locator('summary').filter({ hasText: 'Nouveau grimpeur' }),
    page.getByPlaceholder(/Rechercher un nom ou prénom/),
    page.getByRole('combobox').filter({ hasText: 'Tous les clubs' }),
    bouton(page, 'Modifier'),
    bouton(page, 'Supprimer'),
  ])
  await capturer(page, '08-grimpeurs', { pleinePage: false })

  await page.goto('/admin/grimpeurs/import')
  await numeroter(page, [
    page.locator('input[type="file"]'),
    bouton(page, 'Lancer l’import'),
    lien(page, /Importer un CSV sans licence/),
  ])
  await capturer(page, '09-import-licencies')

  await page.goto('/admin/grimpeurs/import-csv')
  await numeroter(page, [
    page.getByRole('combobox').first(),
    page.locator('input[type="file"]'),
    bouton(page, 'Lancer l’import'),
  ])
  await capturer(page, '10-import-csv')
})

test('07 — gabarit', async ({ page }) => {
  // La page complète fait ~3 500 px : on capture le haut (blocs, vitesse, barème).
  await page.setViewportSize({ width: 1280, height: 1420 })
  await page.goto('/admin/gabarit')
  await numeroter(page, [
    bouton(page, '+ Palier'),
    bouton(page, '+ Bloc'),
    bouton(page, '+ Voie'),
    // Barème : on numérote la colonne Ado, entièrement visible dans la capture.
    page.getByRole('button', { name: '+ Ajouter un échelon' }).last(),
    page.getByRole('button', { name: 'Enregistrer le barème' }).last(),
  ])
  await capturer(page, '11-gabarit', { pleinePage: false })
})

test('08 — rôles', async ({ page }) => {
  await page.goto('/admin/mapping')
  await numeroter(page, [
    page.getByRole('combobox').first(),
    page.getByRole('radio', { name: 'Coach' }).locator('xpath=ancestor::div[1]'),
    page.getByRole('combobox').nth(1),
    bouton(page, 'Attribuer'),
    bouton(page, 'Générer une invitation'),
  ])
  await capturer(page, '12-roles')
})

test('09 — saisie, affichage, contrôle, classement (rencontre Ado)', async ({ page }) => {
  poserResultatsAdo()
  phaseAdo('competition')

  await page.goto(`/admin/rencontres/${ADO}/resultats`)
  await bouton(page, /^Nora Delta/).click()
  await expect(page.getByRole('heading', { name: /Voie de difficulté/i })).toBeVisible()
  await numeroter(page, [
    page.getByPlaceholder(/Rechercher un grimpeur/),
    bouton(page, 'Tous'),
    bouton(page, /^Nora Delta/),
    page.getByRole('combobox').first(),
    bouton(page, 'Top'),
    bouton(page, 'Bloc complet'),
    lien(page, /Voir le classement/),
  ])
  await capturer(page, '13-saisie-resultats')

  await page.goto(`/admin/rencontres/${ADO}/affichage`)
  await page.waitForTimeout(1000)
  await capturer(page, '14-affichage', { pleinePage: false })

  phaseAdo('cloture')
  await page.goto(`/admin/rencontres/${ADO}`)
  await numeroter(page, [
    lien(page, /Corriger les résultats/),
    lien(page, /Contrôler les résultats/),
    lien(page, /Voir le classement/),
    lien(page, /Écran d.affichage/),
  ])
  await capturer(page, '15-rencontre-cloture')

  await page.goto(`/admin/rencontres/${ADO}/controle`)
  const supports = page.getByRole('navigation', { name: 'Voies et blocs' })
  await supports.getByRole('button', { name: /^T4/ }).first().click()
  const caseNora = page.getByRole('checkbox', { name: /Contrôlé : Delta Nora/ })
  await caseNora.check()
  await expect(caseNora).toBeChecked()
  await numeroter(page, [
    supports.getByRole('button', { name: /^T4/ }).first(),
    page.getByPlaceholder(/Rechercher un grimpeur/),
    page.getByText('Non contrôlées seulement'),
    page.getByRole('checkbox', { name: /Contrôlé : Delta Owen/ }),
  ])
  await capturer(page, '16-controle', { pleinePage: false })

  phaseAdo('resultats_publics')
  await page.goto(`/admin/rencontres/${ADO}/classement`)
  await numeroter(page, [lien(page, /Exporter en PDF/), bouton(page, 'Individuel')])
  await capturer(page, '17-classement-officiel')
})
