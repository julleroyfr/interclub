import type { Browser, Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { CLUB_A, CLUB_B } from './helpers/donnees'
import { textePdf } from './helpers/pdf'
import { execSql } from './helpers/sql'

/**
 * Surclassement enfant → ado (spec #21), cahier docs/tests/34-surclassement.cahier.md,
 * cas complémentaires de `surclassement.spec.ts` (CT-01 → CT-05) :
 *   - CT-06 : un révoqué reste dans les classements (admin, coach), le PDF et le
 *     contrôle de la rencontre ado ⑤ disputée, au même rang (R13, R16) ;
 *   - CT-07 : révocation en ③, sans engagement ado à venir (R15) : il reste
 *     engagé, la saisie coach est acceptée (R13, R17) ;
 *   - CT-08 : surclassé du Club B prêté et engagé par l'admin, retraits annoncés
 *     puis effectués (R9, R12, R15) ;
 *   - CT-09 : pas de Surclasser pour le pivot ni pour un ado, jamais en adulte
 *     (R3, R8) ;
 *   - compléments : 2 saisons proposées (CT-01), pas de badge en enfant (CT-02),
 *     écran réservé à l'admin (CT-10, R1).
 *
 * S'appuie sur la rencontre ado du seed (`adadadad…`, saison 2026–2027, équipe
 * « Ados A1 ») pour CT-06/CT-07 ; le reste est créé et supprimé ici (UUID 21e2e…).
 * Série + un seul worker : mute la phase de la rencontre ado du seed.
 */

const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const EQUIPE_ADO = 'adadadad-0000-0000-0000-00000000e001' // « Ados A1 », Club A
const VOIE_T6 = 'adadadad-0000-0000-0000-000000000006'
const VOIE_T7 = 'adadadad-0000-0000-0000-000000000007'
const BLOC_B1 = 'adadadad-0000-0000-0000-0000000000b1'
const PALIER_B1_TOP = 'adadadad-0000-0000-0000-00000000b102'
const VITESSE_ADO = 'adadadad-0000-0000-0000-0000000000a3'

const G = {
  revoquee: '21e2e000-0000-0000-0000-0000000000b1', // CT-06, Club A, 2015
  encours: '21e2e000-0000-0000-0000-0000000000b2', // CT-07, Club A, 2015
  pretee: '21e2e000-0000-0000-0000-0000000000b3', // CT-08, Club B, 2015
  pivot: '21e2e000-0000-0000-0000-0000000000b4', // CT-09, Club A, 2014
  grand: '21e2e000-0000-0000-0000-0000000000b5', // CT-09, Club A, 2012
  cadet: '21e2e000-0000-0000-0000-0000000000b6', // CT-01, Club A, 2016
} as const
const R = {
  adoA: '21e2e000-0000-0000-0000-000000000011', // ado ①, 2027-01-09
  adoB: '21e2e000-0000-0000-0000-000000000012', // ado ①, 2027-02-06
  enfant: '21e2e000-0000-0000-0000-000000000013', // enfant ①, 2027-01-09
  adulte: '21e2e000-0000-0000-0000-000000000014', // adulte ①, 2027-01-16
} as const
const E = {
  adoA_A: '21e2e000-0000-0000-0000-0000000000e1', // Club A, rencontre adoA
  adoB_B: '21e2e000-0000-0000-0000-0000000000e2', // Club B, rencontre adoB
  enfantA: '21e2e000-0000-0000-0000-0000000000e3', // Club A, rencontre enfant
  adulte: '21e2e000-0000-0000-0000-0000000000e4', // sans club, rencontre adulte
} as const

const liste = (ids: Record<string, string>) =>
  Object.values(ids)
    .map((id) => `'${id}'`)
    .join(',')

function nettoyer(): void {
  execSql(
    `delete from interclub.resultat_voie where grimpeur_id in (${liste(G)});
     delete from interclub.resultat_bloc where grimpeur_id in (${liste(G)});
     delete from interclub.temps_vitesse where grimpeur_id in (${liste(G)});
     delete from interclub.composition where grimpeur_id in (${liste(G)});
     delete from interclub.rencontre where id in (${liste(R)});
     delete from interclub.grimpeur where id in (${liste(G)});
     update interclub.rencontre set phase = 'competition' where id = '${ADO}';`,
  )
}

/** Accorde un surclassement 2026–2027 directement en base (pré-condition). */
const surclasser = (grimpeurId: string) =>
  execSql(`insert into interclub.surclassement (grimpeur_id, saison) values ('${grimpeurId}', 2026);`)

const poserPhaseAdo = (phase: 'competition' | 'resultats_publics') =>
  execSql(`update interclub.rencontre set phase = '${phase}' where id = '${ADO}';`)

const compter = (sql: string) => execSql(`select count(*) from ${sql};`)

/** Ligne d'un grimpeur sur l'écran admin Grimpeurs (recherche par nom). */
async function ligneGrimpeur(page: Page, nom: string) {
  await page.goto(`/admin/grimpeurs?recherche=${nom}`)
  return page.locator('li', { hasText: nom })
}

/** Nouvelle page coach Club A, dans son propre contexte. */
async function pageCoach(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await commeCoach(page)
  return page
}

/** Lignes (texte) d'un onglet du classement : Individuel (Femmes), Par équipe, Par club. */
async function classement(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByRole('button', { name: 'Individuel' })).toBeVisible()
  const lignes = async () => page.locator('tbody tr').allInnerTexts()
  const individuel = await lignes()
  await page.getByRole('button', { name: 'Par équipe' }).click()
  await expect(page.locator('tbody tr', { hasText: 'Ados A1' })).toBeVisible()
  const equipes = await lignes()
  await page.getByRole('button', { name: 'Par club' }).click()
  await expect(page.locator('tbody tr', { hasText: 'Club B' })).toHaveCount(0)
  const clubs = await lignes()
  return { individuel, equipes, clubs }
}

/** Texte de l'export PDF, sans la date de génération (seule partie variable). */
async function textePdfClassement(page: Page, url: string): Promise<string[]> {
  const reponse = await page.request.get(url)
  expect(reponse.status()).toBe(200)
  return textePdf(await reponse.body()).filter((t) => !/\d{1,2}[:h]\d{2}/.test(t))
}

test.describe('Surclassement — compléments du cahier 34 (spec #21)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    nettoyer()
    execSql(
      `insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence) values
         ('${G.revoquee}','${CLUB_A}','Revoquee','Léa',2015,'F',921201),
         ('${G.encours}','${CLUB_A}','Encours','Mia',2015,'F',921202),
         ('${G.pretee}','${CLUB_B}','Pretee','Léo',2015,'H',921203),
         ('${G.pivot}','${CLUB_A}','Pivot','Paul',2014,'H',921204),
         ('${G.grand}','${CLUB_A}','Grandado','Max',2012,'H',921205),
         ('${G.cadet}','${CLUB_A}','Cadet','Noé',2016,'H',921206);
       insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
         ('${R.adoA}','2027-01-09','${CLUB_A}','ado','pre_competition'),
         ('${R.adoB}','2027-02-06','${CLUB_A}','ado','pre_competition'),
         ('${R.enfant}','2027-01-09','${CLUB_A}','enfant','pre_competition'),
         ('${R.adulte}','2027-01-16','${CLUB_A}','adulte','pre_competition');
       insert into interclub.equipe (id, rencontre_id, club_id, nom) values
         ('${E.adoA_A}','${R.adoA}','${CLUB_A}','Surcl A'),
         ('${E.adoB_B}','${R.adoB}','${CLUB_B}','Surcl B'),
         ('${E.enfantA}','${R.enfant}','${CLUB_A}','Surcl enfant'),
         ('${E.adulte}','${R.adulte}',null,'Adultes surcl');`,
    )
  })
  test.afterAll(nettoyer)

  test('CT-06 · un révoqué reste dans les résultats de la rencontre disputée (R13, R16)', async ({
    page,
    browser,
  }) => {
    // Léa a concouru dans la rencontre ado du seed (voie, bloc, vitesse) et est
    // engagée dans une autre rencontre ado en ①.
    surclasser(G.revoquee)
    execSql(
      `insert into interclub.composition (equipe_id, grimpeur_id) values
         ('${EQUIPE_ADO}','${G.revoquee}'),('${E.adoA_A}','${G.revoquee}');
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
         ('${VOIE_T6}','${G.revoquee}','top');
       insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
         ('${BLOC_B1}','${G.revoquee}','palier','${PALIER_B1_TOP}');
       insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, temps, issue) values
         ('${VITESSE_ADO}','${G.revoquee}',9.5,'temps');`,
    )
    poserPhaseAdo('resultats_publics')

    const urlAdmin = `/admin/rencontres/${ADO}/classement`
    const urlCoach = `/coach/rencontres/${ADO}/classement`
    const coach = await pageCoach(browser)
    await commeAdmin(page)

    // 1. Relevé avant révocation : Léa classée, avec des points.
    const avantAdmin = await classement(page, urlAdmin)
    const avantCoach = await classement(coach, urlCoach)
    const ligneLea = avantAdmin.individuel.find((l) => l.includes('Léa Revoquee'))
    expect(ligneLea).toMatch(/\d+\s*pts/)
    expect(avantCoach.individuel).toContain(ligneLea)
    const pdfAvant = await textePdfClassement(page, `${urlAdmin}/pdf`)
    expect(pdfAvant.join(' ')).toMatch(/Revoquee/i)

    // 2. Révocation : seule la rencontre ① est annoncée, puis quittée.
    const ligne = await ligneGrimpeur(page, 'Revoquee')
    await ligne.getByRole('button', { name: 'Révoquer le surclassement' }).click()
    await expect(ligne.getByText('09/01/2027 — Club A, équipe « Surcl A »')).toBeVisible()
    await expect(ligne.getByText(/19\/09\/2026/)).toHaveCount(0)
    await ligne.getByRole('button', { name: 'Oui, révoquer' }).click()
    await expect(
      ligne.getByRole('status').filter({ hasText: 'Léa REVOQUEE a été retiré de 1 rencontre ado à venir.' }),
    ).toBeVisible()
    expect(compter(`interclub.composition where equipe_id = '${E.adoA_A}' and grimpeur_id = '${G.revoquee}'`)).toBe('0')
    expect(compter(`interclub.composition where equipe_id = '${EQUIPE_ADO}' and grimpeur_id = '${G.revoquee}'`)).toBe('1')

    // 3. Classements (admin, coach), PDF : identiques, même rang, mêmes points ;
    //    aucun badge dans le classement.
    expect(await classement(page, urlAdmin)).toEqual(avantAdmin)
    expect(await classement(coach, urlCoach)).toEqual(avantCoach)
    expect(ligneLea).not.toMatch(/surclass/i)
    expect(await textePdfClassement(page, `${urlAdmin}/pdf`)).toEqual(pdfAvant)

    // Contrôle des résultats : sa ligne figure toujours sur T6.
    await page.goto(`/admin/rencontres/${ADO}/controle`)
    await page
      .getByRole('navigation', { name: 'Voies et blocs' })
      .getByRole('button', { name: /^T6\b/ })
      .click()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('T6')
    await expect(page.locator('li', { hasText: /Revoquee/i }).first()).toContainText('Top')
    await coach.context().close()
  })

  test('CT-07 · révocation pendant une rencontre en cours : saisie acceptée (R13, R15, R17)', async ({
    page,
    browser,
  }) => {
    poserPhaseAdo('competition')
    surclasser(G.encours)
    execSql(
      `insert into interclub.composition (equipe_id, grimpeur_id) values ('${EQUIPE_ADO}','${G.encours}');`,
    )

    // La rencontre ③ n'est pas annoncée : aucun engagement ado à venir (R15).
    await commeAdmin(page)
    const ligne = await ligneGrimpeur(page, 'Encours')
    await ligne.getByRole('button', { name: 'Révoquer le surclassement' }).click()
    await expect(ligne.getByText('Aucun engagement ado à venir.')).toBeVisible()
    await ligne.getByRole('button', { name: 'Oui, révoquer' }).click()
    await expect(
      ligne.getByRole('status').filter({ hasText: 'Surclassement révoqué. Aucun engagement ado à venir.' }),
    ).toBeVisible()
    expect(compter(`interclub.composition where equipe_id = '${EQUIPE_ADO}' and grimpeur_id = '${G.encours}'`)).toBe('1')

    // Le coach saisit puis corrige un résultat de voie de Mia (R17).
    const coach = await pageCoach(browser)
    await coach.goto(`/coach/rencontres/${ADO}/resultats`)
    await coach.getByRole('button', { name: /^Mia Encours/ }).click()
    const formAjout = coach.locator('form', { has: coach.getByText(/Ajouter une voie/) })
    await formAjout.locator('select[name="voieDifficulteId"]').selectOption(VOIE_T7)
    await formAjout.getByRole('button', { name: 'Zone 1', exact: true }).click()
    await expect(coach.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
    const issue = () =>
      execSql(
        `select issue from interclub.resultat_voie
          where voie_difficulte_id = '${VOIE_T7}' and grimpeur_id = '${G.encours}';`,
      )
    await expect.poll(issue).toBe('zone1')
    const t7 = coach
      .locator('div.rounded-2xl', { has: coach.getByRole('heading', { name: 'Voie de difficulté', exact: true }) })
      .locator('li', { hasText: 'T7' })
    await t7.getByRole('button', { name: 'Top', exact: true }).click()
    await expect(coach.locator('[data-en-attente]')).toHaveCount(0, { timeout: 10_000 })
    await expect.poll(issue).toBe('top')
    await coach.context().close()
  })

  test('CT-08 · surclassé du Club B : prêt, équipe admin, retraits (R9, R12, R15)', async ({
    page,
    browser,
  }) => {
    surclasser(G.pretee)
    await commeAdmin(page)

    // 1. Panneau Prêts de la rencontre ado A : Léo est proposé, prêté au Club A.
    await page.goto(`/admin/rencontres/${R.adoA}`)
    const formPret = page.locator('form', { has: page.getByLabel('Club du grimpeur') })
    await formPret.getByLabel('Club du grimpeur').selectOption({ label: 'Club B' })
    await formPret.getByLabel(/Rechercher un grimpeur/).fill('Pretee')
    await formPret.locator('select[name="grimpeurId"]').selectOption({ label: 'Léo Pretee · surclassé' })
    await formPret.locator('select[name="clubAccueilId"]').selectOption({ label: 'Club A' })
    await formPret.getByRole('button', { name: /Créer le prêt/ }).click()
    await expect(page.getByRole('status').filter({ hasText: /Prêt créé/ })).toBeVisible()

    // 2. Le coach du Club A le voit avec les deux mentions.
    const coach = await pageCoach(browser)
    await coach.goto(`/coach/rencontres/${R.adoA}`)
    expect(await coach.locator('select[name="grimpeurId"] option').allInnerTexts()).toContain(
      'Léo Pretee (prêté · Club B) · surclassé',
    )
    await coach.context().close()

    // 3. Panneau Équipes de la rencontre ado B : l'admin l'ajoute à « Surcl B ».
    await page.goto(`/admin/rencontres/${R.adoB}`)
    const carteB = page.locator('details[data-club="Club B"]')
    // Seul club engagé : déjà déplié (spec #3 R41c), on s'en assure sans basculer.
    await carteB.evaluate((d) => ((d as HTMLDetailsElement).open = true))
    const equipe = carteB.locator('[data-equipe="Surcl B"]')
    await equipe.locator('select[name="grimpeurId"]').selectOption({ label: 'Léo Pretee · surclassé' })
    await equipe.getByRole('button', { name: /Ajouter/ }).click()
    await expect(equipe.locator('li', { hasText: 'Léo Pretee' })).toBeVisible()

    // Révocation : prêt et équipe annoncés, puis supprimés.
    const ligne = await ligneGrimpeur(page, 'Pretee')
    await ligne.getByRole('button', { name: 'Révoquer le surclassement' }).click()
    await expect(ligne.getByText('09/01/2027 — Club A, prêt supprimé')).toBeVisible()
    await expect(ligne.getByText('06/02/2027 — Club A, équipe « Surcl B »')).toBeVisible()
    await ligne.getByRole('button', { name: 'Oui, révoquer' }).click()
    await expect(
      ligne.getByRole('status').filter({ hasText: 'Léo PRETEE a été retiré de 2 rencontres ado à venir.' }),
    ).toBeVisible()
    expect(compter(`interclub.pret where grimpeur_id = '${G.pretee}'`)).toBe('0')
    expect(compter(`interclub.composition where grimpeur_id = '${G.pretee}'`)).toBe('0')
  })

  test('CT-09 · ni pivot, ni ado, jamais en adulte (R3, R8)', async ({ page }) => {
    await commeAdmin(page)
    for (const nom of ['Pivot', 'Grandado']) {
      const ligne = await ligneGrimpeur(page, nom)
      await expect(ligne).toBeVisible()
      await expect(ligne.getByRole('button', { name: 'Supprimer' })).toBeVisible()
      await expect(ligne.getByRole('button', { name: 'Surclasser' })).toHaveCount(0)
    }

    // Un surclassé n'est pas proposé dans une équipe adulte.
    surclasser(G.cadet)
    try {
      await page.goto(`/admin/rencontres/${R.adulte}`)
      const carte = page.locator('[data-equipe="Adultes surcl"]')
      await carte.getByLabel('Ajouter un grimpeur (tous clubs, 16 ans et plus)').fill('Cadet')
      await expect(carte.getByText('Grimpeur (0)')).toBeVisible()
    } finally {
      execSql(`delete from interclub.surclassement where grimpeur_id = '${G.cadet}';`)
    }
  })

  test('CT-01 · né en 2016 : saison courante et suivante proposées (R2)', async ({ page }) => {
    await commeAdmin(page)
    const ligne = await ligneGrimpeur(page, 'Cadet')
    await ligne.getByRole('button', { name: 'Surclasser' }).click()
    expect(await ligne.getByLabel('Saison').locator('option').allInnerTexts()).toEqual([
      '2026–2027 (saison courante)',
      '2027–2028',
    ])
    await expect(ligne.getByLabel('Saison')).toHaveValue('2026')
    await ligne.getByRole('button', { name: 'Annuler' }).click()
    await expect(ligne.getByLabel('Saison')).toHaveCount(0)
  })

  test('CT-02 · en rencontre enfant, le surclassé est proposé sans badge (R20)', async ({ page }) => {
    surclasser(G.cadet)
    execSql(
      `insert into interclub.composition (equipe_id, grimpeur_id) values ('${E.enfantA}','${G.cadet}');`,
    )
    await commeCoach(page)
    await page.goto(`/coach/rencontres/${R.enfant}`)
    await expect(page.locator('li', { hasText: 'Noé Cadet' }).last()).toBeVisible()
    await expect(page.getByText('Surclassé', { exact: true })).toHaveCount(0)
    expect((await page.locator('select[name="grimpeurId"] option').allInnerTexts()).join('|')).not.toContain(
      'surclassé',
    )
  })

  test('CT-10 · le coach n’a pas accès à l’écran Grimpeurs (R1)', async ({ page }) => {
    await commeCoach(page)
    expect((await page.goto('/admin/grimpeurs'))?.status()).toBe(404)
    await page.goto(`/coach/rencontres/${R.adoA}`)
    await expect(page.getByRole('button', { name: /Surclasser|Révoquer le surclassement/ })).toHaveCount(0)
  })
})
