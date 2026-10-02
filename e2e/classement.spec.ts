import { expect, test, type Page } from '@playwright/test'

import { commeAdmin, commeCoach, commeCoachTemporaire } from './helpers/auth'
import {
  CLUB_A,
  CLUB_B,
  EQUIPES,
  GRIMPEURS,
  RENCONTRE_PILOTE,
  RENCONTRE_PILOTE_DATE,
} from './helpers/donnees'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 18 — classement individuel / équipe / club (spec #7).
 * Rejoue la part IHM + assemblage cross-club : visibilité dès la ③ (R11),
 * score et décomposition (R1–R3, R13), au fil de l'eau (R10), séparation par
 * sexe (R8b), ex æquo (R8/R9), équipe/club (R5/R6), prêté (R7), officiel (R10),
 * lecture cross-club + « mon club » (R11/R12b), longue liste (R12b), coach
 * temporaire (R11), vue admin (spec #12 R14/R15). Le calcul pur reste couvert
 * par Vitest (`src/domaine/score.test.ts`).
 *
 * Les résultats sont posés en SQL (pré-conditions) : la saisie IHM relève du
 * cahier 17. Série + un seul worker : mute la rencontre pilote.
 */

const URL_COACH = `/coach/rencontres/${RENCONTRE_PILOTE}/classement`
const URL_ADMIN = `/admin/rencontres/${RENCONTRE_PILOTE}/classement`

const V = {
  M2: '99999999-9999-9999-9999-999999999912',
  M3: '99999999-9999-9999-9999-999999999913',
  M4: '99999999-9999-9999-9999-999999999914',
  T1: '99999999-9999-9999-9999-999999999901',
  T2: '99999999-9999-9999-9999-999999999921',
  T3: '99999999-9999-9999-9999-999999999922',
} as const
const B1 = '99999999-9999-9999-9999-999999999902'
const B2 = '99999999-9999-9999-9999-999999999903'
const P = {
  b1_1: '99999999-9999-9999-9999-9999999999a1',
  b2_2: '99999999-9999-9999-9999-9999999999b2',
}

// Longue liste (CT-10) : 20 grimpeuses Club B dans une équipe B2 dédiée.
const EQUIPE_B2 = '77777777-7777-7777-7777-7777777777b2'
const VOLUME = Array.from({ length: 20 }, (_, i) => ({
  id: `b0000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`,
  nom: `Volume${String(i).padStart(2, '0')}`,
  licence: 9998000 + i,
}))

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

function purgerVolume(): void {
  execSql(
    `delete from interclub.composition where equipe_id = '${EQUIPE_B2}';
     delete from interclub.equipe where id = '${EQUIPE_B2}';
     delete from interclub.grimpeur where id in (${VOLUME.map((g) => `'${g.id}'`).join(',')});`,
  )
}

/** Ligne du classement (individuel/équipe/club) contenant le texte donné. */
const ligne = (page: Page, texte: string) => page.locator('tbody tr', { hasText: texte })

/** Rang (1ʳᵉ cellule) d'une ligne. */
const rang = (page: Page, texte: string) => ligne(page, texte).locator('td').first()

async function ouvrirClassement(page: Page, url = URL_COACH): Promise<void> {
  await page.goto(url)
  await expect(page.getByRole('button', { name: 'Individuel' })).toBeVisible()
}

test.describe('Cahier 18 — classement (spec #7)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    purgerVolume()
    purgerResultats()
    nettoyerSessionsQr()
    poserPhase('competition')
    poserDate('today')
  })

  test.afterAll(() => {
    purgerResultats()
    purgerVolume()
    execSql(`update interclub.grimpeur set sexe = 'H' where id = '${GRIMPEURS.bob}';`)
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
  })

  test('CT-01 · visible dès la ③, masqué avant (R11, R12)', async ({ page }) => {
    await commeCoach(page)
    await page.goto(`/coach/rencontres/${RENCONTRE_PILOTE}/resultats`)
    await page.getByRole('link', { name: 'Voir le classement →' }).click()
    await expect(page).toHaveURL(new RegExp(`${URL_COACH}$`))
    for (const onglet of ['Individuel', 'Par équipe', 'Par club', 'Femmes', 'Hommes']) {
      await expect(page.getByRole('button', { name: onglet, exact: true })).toBeVisible()
    }
    await expect(page.getByText('● Non officiel')).toBeVisible()
    // La vitesse entre dans le score (spec #7 R20) : aucune mention contraire.
    await expect(page.getByText(/La vitesse n’entre pas encore dans le score/)).toHaveCount(0)

    // Négatif : avant la ③, aucun classement.
    poserPhase('pre_competition')
    try {
      await page.reload()
      await expect(page.getByText(/Le classement sera disponible dès l’ouverture/)).toBeVisible()
      await expect(page.locator('tbody tr')).toHaveCount(0)
    } finally {
      poserPhase('competition')
    }
  })

  test('CT-02 · score individuel et décomposition (R1–R3, R13)', async ({ page }) => {
    const { ana } = GRIMPEURS
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
         ('${V.M2}','${ana}','top'),('${V.M3}','${ana}','top'),('${V.M4}','${ana}','echec');
       insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
         ('${B1}','${ana}','palier','${P.b1_1}'),('${B2}','${ana}','echec',null);`,
    )
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Ana Alpha')).toContainText('9pts')
    await expect(ligne(page, 'Ana Alpha')).toContainText('voie 5 · bloc 4 · vit 0')

    await ligne(page, 'Ana Alpha').click()
    await expect(page.getByRole('button', { name: '← Retour au classement' })).toBeVisible()
    const section = (titre: string) =>
      page.locator('div', { has: page.locator('span', { hasText: new RegExp(`^${titre}$`) }) }).last()
    await expect(section('Voies')).toContainText('5 pts')
    await expect(section('Blocs')).toContainText('4 pts')
    await expect(section('Vitesse')).toContainText('0 pts')
    const lignesDecomp = page.locator('div.border-t, div.first\\:border-t-0').filter({ hasText: /^(M|B)/ })
    await expect(lignesDecomp.filter({ hasText: 'M2' })).toContainText(/Top\s*2/)
    await expect(lignesDecomp.filter({ hasText: 'M3' })).toContainText(/Top\s*3/)
    await expect(lignesDecomp.filter({ hasText: 'M4' })).toContainText(/Échec\s*0/)
    await expect(lignesDecomp.filter({ hasText: 'B1' })).toContainText(/1er essai\s*4/)
    await expect(lignesDecomp.filter({ hasText: 'B2' })).toContainText(/Échec\s*0/)
  })

  test('CT-04 · séparation par sexe (R8b, R12)', async ({ page }) => {
    const { bob } = GRIMPEURS
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
         ('${V.T1}','${bob}','top'),('${V.T2}','${bob}','prise_valorisee'),('${V.T3}','${bob}','echec');
       insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
         ('${B1}','${bob}','palier','${P.b1_1}');`,
    )
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Bob Alpha')).toHaveCount(0) // Femmes par défaut
    await page.getByRole('button', { name: 'Hommes', exact: true }).click()
    await expect(ligne(page, 'Bob Alpha')).toContainText('12pts')
    await expect(rang(page, 'Bob Alpha')).toHaveText('1') // les rangs repartent de 1
    await expect(ligne(page, 'Ana Alpha')).toHaveCount(0)

    await ligne(page, 'Bob Alpha').click()
    await expect(page.getByText('Prise valorisée')).toBeVisible()
  })

  test('CT-05 · ex æquo, rang partagé, ordre par nom (R8, R9)', async ({ page }) => {
    const { cleo } = GRIMPEURS
    execSql(
      `insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
         ('${V.T3}','${cleo}','prise_valorisee');
       insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
         ('${B2}','${cleo}','palier','${P.b2_2}');`,
    )
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Cléo Bravo')).toContainText('9pts')
    await expect(rang(page, 'Ana Alpha')).toHaveText('1')
    await expect(rang(page, 'Cléo Bravo')).toHaveText('1')
    // Ordre déterministe : Alpha avant Bravo.
    const noms = await page.locator('tbody tr td:nth-child(2) > span:first-child').allInnerTexts()
    expect(noms.indexOf('Ana Alpha')).toBeLessThan(noms.indexOf('Cléo Bravo'))
  })

  test('CT-06 · classements par équipe et par club (R5, R6, R8)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirClassement(page)
    await page.getByRole('button', { name: 'Par équipe' }).click()
    await expect(ligne(page, 'Équipe A1')).toContainText('21pts') // Ana 9 + Bob 12
    await expect(ligne(page, 'Équipe A1')).toContainText('Club A · 2 grimpeur(s)')
    await expect(ligne(page, 'Équipe B1')).toContainText('9pts')
    await expect(rang(page, 'Équipe A1')).toHaveText('1')

    await page.getByRole('button', { name: 'Par club' }).click()
    await expect(ligne(page, 'Club A')).toContainText('21pts')
    await expect(ligne(page, 'Club B')).toContainText('9pts')
  })

  test('CT-03 · recalcul au fil de l’eau (R10)', async ({ page }) => {
    execSql(
      `update interclub.resultat_voie set issue = 'top'
        where grimpeur_id = '${GRIMPEURS.ana}' and voie_difficulte_id = '${V.M4}';`,
    )
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Ana Alpha')).toContainText('13pts')
    await expect(rang(page, 'Ana Alpha')).toHaveText('1')
    await expect(rang(page, 'Cléo Bravo')).toHaveText('2')
    await expect(page.getByText('● Non officiel')).toBeVisible()
  })

  test('CT-07 · grimpeur prêté : équipe/club d’accueil, individuel d’origine (R7)', async ({
    page,
  }) => {
    const { devi } = GRIMPEURS
    execSql(
      `insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id)
         values ('${RENCONTRE_PILOTE}','${devi}','${CLUB_A}');
       insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
         values ('${EQUIPES.A1}','${devi}','T1');
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${V.T1}','${devi}','top');`,
    )
    await commeCoach(page)
    await ouvrirClassement(page)
    await page.getByRole('button', { name: 'Hommes', exact: true }).click()
    await expect(ligne(page, 'Devi Bravo')).toContainText('5pts')
    await expect(ligne(page, 'Devi Bravo')).toContainText('Club B') // club d'origine

    await page.getByRole('button', { name: 'Par équipe' }).click()
    await expect(ligne(page, 'Équipe A1')).toContainText('30pts') // 13 + 12 + 5
    await expect(ligne(page, 'Équipe A1')).toContainText('3 grimpeur(s)')
    await page.getByRole('button', { name: 'Par club' }).click()
    await expect(ligne(page, 'Club A')).toContainText('30pts')
    await expect(ligne(page, 'Club B')).toContainText('9pts') // sans Devi
  })

  test('CT-09 · lecture cross-club et « mon club » en évidence (R11, R12b)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Cléo Bravo')).toBeVisible() // Club B visible du coach A
    await expect(page.getByText(/1\s*de mon club en évidence/)).toBeVisible()
    await expect(ligne(page, 'Ana Alpha')).toHaveClass(/bg-accent/)
    await expect(ligne(page, 'Cléo Bravo')).not.toHaveClass(/bg-accent/)
  })

  test('CT-10 · recherche, filtres, pagination (R12b)', async ({ page }) => {
    execSql(
      `insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${EQUIPE_B2}','${RENCONTRE_PILOTE}','${CLUB_B}','Équipe B2') on conflict do nothing;
       insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence) values
         ${VOLUME.map((g) => `('${g.id}','${CLUB_B}','${g.nom}','Zoé',2016,'F',${g.licence})`).join(',')}
       on conflict (id) do nothing;
       insert into interclub.composition (equipe_id, grimpeur_id) values
         ${VOLUME.map((g) => `('${EQUIPE_B2}','${g.id}')`).join(',')} on conflict do nothing;`,
    )
    await commeCoach(page)
    await ouvrirClassement(page)
    // 22 grimpeuses → 2 pages de 20.
    await expect(page.getByText(/^22\s*grimpeuse\(s\)/)).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(20)
    await expect(page.getByText('Page 1 sur 2 · 1–20 sur 22')).toBeVisible()
    const pagination = page.getByRole('navigation', { name: 'Pagination' })
    await pagination.getByRole('button', { name: 'Suiv. ›' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(2)
    await expect(page.getByText('Page 2 sur 2 · 21–22 sur 22')).toBeVisible()

    // Recherche par nom → compteur à jour, retour en page 1.
    await page.getByPlaceholder('🔍 Rechercher un nom…').fill('cléo')
    await expect(page.getByText(/^1\s*grimpeuse\(s\)/)).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.getByPlaceholder('🔍 Rechercher un nom…').fill('')

    // Mon club → Club A seul ; puis filtre équipe combiné.
    await page.getByRole('button', { name: 'Mon club' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(ligne(page, 'Ana Alpha')).toBeVisible()
    await page.getByRole('button', { name: 'Tous les clubs' }).click()
    await page.locator('select').selectOption({ label: 'Équipe B2' })
    await expect(page.getByText(/^20\s*grimpeuse\(s\)/)).toBeVisible()
    await page.getByRole('button', { name: 'Mon club' }).click()
    await expect(page.getByText('Aucun grimpeur pour ce filtre.')).toBeVisible()
  })

  test('CT-11 · le sexe du grimpeur choisit son classement (R8b)', async ({ page }) => {
    execSql(`update interclub.grimpeur set sexe = 'F' where id = '${GRIMPEURS.bob}';`)
    try {
      await commeCoach(page)
      await ouvrirClassement(page)
      await expect(ligne(page, 'Bob Alpha')).toBeVisible() // désormais en Femmes
      await page.getByRole('button', { name: 'Hommes', exact: true }).click()
      await expect(ligne(page, 'Bob Alpha')).toHaveCount(0)
    } finally {
      execSql(`update interclub.grimpeur set sexe = 'H' where id = '${GRIMPEURS.bob}';`)
    }
  })

  test('CT-12 · coach temporaire : lecture tous clubs, borné à sa rencontre (R11)', async ({
    page,
  }) => {
    await commeCoachTemporaire(page)
    await ouvrirClassement(page)
    await expect(ligne(page, 'Cléo Bravo')).toBeVisible()
    await expect(ligne(page, 'Ana Alpha')).toHaveClass(/bg-accent/)
    await ligne(page, 'Ana Alpha').click()
    await expect(page.getByText('Score individuel')).toBeVisible()
    await expect(page.locator('form')).toHaveCount(1) // seul « Terminer » (en-tête)

    expect(
      (await page.goto('/coach/rencontres/adadadad-adad-adad-adad-adadadadadad/classement'))?.status(),
    ).toBe(404)
  })

  test('CT-13 · vue classement admin (spec #12 R14/R15)', async ({ page, browser }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
    await page.getByRole('link', { name: /Voir le classement \(tous clubs\)/ }).click()
    await expect(page).toHaveURL(new RegExp(`${URL_ADMIN}$`))
    await expect(ligne(page, 'Cléo Bravo')).toBeVisible()
    await expect(page.getByText(/de mon club en évidence/)).toHaveCount(0)
    await expect(ligne(page, 'Ana Alpha')).not.toHaveClass(/bg-accent/)
    await expect(page.getByRole('link', { name: '← Tableau de bord' })).toBeVisible()

    // Depuis la saisie admin, le lien mène aussi à la vue admin.
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}/resultats`)
    await page.getByRole('link', { name: 'Voir le classement →' }).click()
    await expect(page).toHaveURL(new RegExp(`${URL_ADMIN}$`))

    // Négatifs : coach → 404 ; non connecté → /connexion (spec #12 R2/R3).
    const ctxCoach = await browser.newContext()
    const coach = await ctxCoach.newPage()
    await commeCoach(coach)
    expect((await coach.goto(URL_ADMIN))?.status()).toBe(404)
    await ctxCoach.close()
    const ctxAnon = await browser.newContext()
    const anon = await ctxAnon.newPage()
    await anon.goto(URL_ADMIN)
    await expect(anon).toHaveURL(/\/connexion/)
    await ctxAnon.close()
  })

  test('CT-08 · non officiel → officiel, valeurs identiques (R10)', async ({ page }) => {
    poserPhase('resultats_publics')
    await commeCoach(page)
    await ouvrirClassement(page)
    await expect(page.getByText('✓ Officiel')).toBeVisible()
    await expect(page.getByText(/classement officiel et figé/)).toBeVisible()
    await page.getByPlaceholder('🔍 Rechercher un nom…').fill('ana')
    await expect(ligne(page, 'Ana Alpha')).toContainText('13pts')
  })
})
