import { expect, test, type Locator, type Page } from '@playwright/test'

import { commeAdmin, commeCoach, commeCoachTemporaire, commeSansMapping } from './helpers/auth'
import {
  EQUIPES,
  GRIMPEURS,
  POOL_LIBRES,
  RENCONTRE_PILOTE,
  RENCONTRE_PILOTE_DATE,
} from './helpers/donnees'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Cahier 17 — saisie des résultats voie & bloc par le coach (spec #6).
 * Rejoue la part IHM automatisable : accès (R1), deux vues (R24), navigation ‹/›
 * (R25), voies enfant + groupe à définir (R8/R9/R20), issues par type de voie
 * (R10), correction (R13), ado : choix libre / plafond / retrait (R11/R12/R14),
 * blocs (R15–R17), coach temporaire (R5/R7), saisie fermée hors ③ (R5), NP à la
 * clôture (R18/R19), vitesse en lecture seule (R22). Les règles enforcées en base
 * restent couvertes par `npm run test:resultats` (CT-13 inclus).
 *
 * Série + un seul worker : mute les résultats et la phase des deux rencontres seed.
 */

const ENFANT = RENCONTRE_PILOTE
const ADO = 'adadadad-adad-adad-adad-adadadadadad'
const URL_ENFANT = `/coach/rencontres/${ENFANT}/resultats`
const URL_ADO = `/coach/rencontres/${ADO}/resultats`

const NORA = 'adadadad-0000-0000-0000-0000000000c1'
const CHLOE = POOL_LIBRES[0] // libre au seed : ajoutée en A2 SANS groupe (R9)
const VOIE_ADO = {
  T4: 'adadadad-0000-0000-0000-000000000004',
  T5: 'adadadad-0000-0000-0000-000000000005',
  T5bis: 'adadadad-0000-0000-0000-000000000015',
  T6: 'adadadad-0000-0000-0000-000000000006',
  T7: 'adadadad-0000-0000-0000-000000000007',
  T8: 'adadadad-0000-0000-0000-000000000008',
} as const
const VOIE_M2 = '99999999-9999-9999-9999-999999999912'
const VITESSE_ENFANT = '88888888-8888-8888-8888-888888888803'

/** Efface tous les résultats (voie, bloc, vitesse) des deux rencontres seed. */
function purgerResultats(): void {
  execSql(
    `delete from interclub.resultat_voie where voie_difficulte_id in (
       select v.id from interclub.voie_difficulte v join interclub.epreuve e on e.id = v.epreuve_id
        where e.rencontre_id in ('${ENFANT}','${ADO}'));
     delete from interclub.resultat_bloc where bloc_id in (
       select b.id from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
        where e.rencontre_id in ('${ENFANT}','${ADO}'));
     delete from interclub.temps_vitesse where epreuve_id in (
       select id from interclub.epreuve where rencontre_id in ('${ENFANT}','${ADO}'));`,
  )
}

function poserPhaseAdo(phase: 'competition' | 'cloture'): void {
  execSql(`update interclub.rencontre set phase = '${phase}' where id = '${ADO}';`)
}

/** Ouvre le détail d'un grimpeur depuis la liste (libellé « Prénom Nom »). */
async function ouvrirGrimpeur(page: Page, url: string, nom: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: new RegExp(`^${nom}`) }).click()
  await expect(page.getByRole('button', { name: '← Liste des grimpeurs' })).toBeVisible()
}

/** Ligne (li) d'une voie ou d'un bloc dans la section donnée, repérée par son code. */
function ligne(page: Page, section: 'Voie de difficulté' | 'Bloc', code: string): Locator {
  return page
    .locator('div.rounded-2xl', { has: page.getByRole('heading', { name: section, exact: true }) })
    .locator('li')
    .filter({ has: page.locator('span.min-w-9', { hasText: new RegExp(`^${code}$`) }) })
}

/** Compteur « faites/total » affiché dans l'en-tête d'une section. */
function compteur(page: Page, section: 'Voie de difficulté' | 'Bloc'): Locator {
  return page
    .locator('div.rounded-2xl', { has: page.getByRole('heading', { name: section, exact: true }) })
    .locator('span.text-\\[11px\\]')
    .first()
}

/** Pastille d'issue courante d'une ligne. */
const pastille = (l: Locator) => l.locator('span.rounded-full')

/** Libellés des boutons d'issue d'une ligne. */
const boutonsIssue = (l: Locator) => l.locator('form button').allInnerTexts()

test.describe('Cahier 17 — saisie des résultats voie & bloc (spec #6)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    reinitialiserEngagement()
    // Chloé en A2 sans groupe de départ (R9) : 3 grimpeurs Club A sur l'enfant.
    execSql(
      `insert into interclub.composition (equipe_id, grimpeur_id) values
         ('${EQUIPES.A2}','${CHLOE.id}') on conflict do nothing;`,
    )
    purgerResultats()
    nettoyerSessionsQr()
    poserPhase('competition')
    poserDate('today')
    poserPhaseAdo('competition')
  })

  test.afterAll(() => {
    purgerResultats()
    nettoyerSessionsQr()
    reinitialiserEngagement()
    poserPhase('pre_competition')
    poserDate(RENCONTRE_PILOTE_DATE)
    poserPhaseAdo('competition')
  })

  test('CT-01 · écran réservé au coach (R1)', async ({ page, browser }) => {
    await commeCoach(page)
    await page.goto(URL_ENFANT)
    await expect(page.getByText(/Saisie des résultats · catégorie/)).toBeVisible()

    // Non connecté → /connexion (spec #12 R2).
    const anonyme = await browser.newContext()
    const pAnonyme = await anonyme.newPage()
    await pAnonyme.goto(URL_ENFANT)
    await expect(pAnonyme).toHaveURL(/\/connexion/)
    await anonyme.close()

    // Mauvais rôle (admin, sans rôle) → 404 (spec #12 R3).
    for (const connecter of [commeAdmin, commeSansMapping]) {
      const ctx = await browser.newContext()
      const p = await ctx.newPage()
      await connecter(p)
      expect((await p.goto(URL_ENFANT))?.status()).toBe(404)
      await ctx.close()
    }
  })

  test('CT-02 · deux vues : par équipe / alphabétique (R24)', async ({ page }) => {
    await commeCoach(page)
    await page.goto(URL_ENFANT)
    // Par équipe : grimpeurs regroupés sous leur équipe, avec l'effectif.
    await expect(page.getByText(/^Équipe A1\s*· 2$/)).toBeVisible()
    await expect(page.getByText(/^Équipe A2\s*· 1$/)).toBeVisible()

    await page.getByRole('button', { name: 'Alphabétique' }).click()
    const lignes = page.locator('li > button')
    // À plat, « Nom Prénom », tri nom puis prénom, tag d'équipe sur chaque ligne.
    await expect(lignes).toHaveCount(3)
    await expect(lignes.nth(0)).toContainText('Alpha Ana')
    await expect(lignes.nth(0)).toContainText('Équipe A1')
    await expect(lignes.nth(1)).toContainText('Alpha Bob')
    await expect(lignes.nth(2)).toContainText('Alpha Chloé')
    await expect(lignes.nth(2)).toContainText('Équipe A2')
  })

  test('CT-03 · navigation ‹ / › dans l’ordre de la vue (R25)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Ana Alpha')
    const prec = page.getByRole('button', { name: 'Grimpeur précédent' })
    const suiv = page.getByRole('button', { name: 'Grimpeur suivant' })
    await expect(page.getByText(/^1 \/ 3 · Équipe A1$/)).toBeVisible()
    await expect(prec).toBeDisabled()

    await suiv.click()
    await expect(page.getByText(/^2 \/ 3 · Équipe A1$/)).toBeVisible()
    await suiv.click()
    await expect(page.getByText(/^3 \/ 3 · Équipe A2$/)).toBeVisible()
    await expect(suiv).toBeDisabled()
    await prec.click()
    await expect(page.getByText(/^2 \/ 3 · Équipe A1$/)).toBeVisible()
  })

  test('CT-04 · voies enfant du groupe + groupe à définir (R8, R9, R20)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
    // Groupe T1 → exactement T1, T2, T3.
    const voies = page
      .locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Voie de difficulté' }) })
      .locator('li span.min-w-9')
    await expect(voies).toHaveText(['T1', 'T2', 'T3'])
    await expect(compteur(page, 'Voie de difficulté')).toHaveText('0/3')

    await ligne(page, 'Voie de difficulté', 'T1').getByRole('button', { name: 'Top' }).click()
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T1'))).toHaveText('Top')
    await ligne(page, 'Voie de difficulté', 'T2').getByRole('button', { name: 'Prise valorisée' }).click()
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T2'))).toHaveText('Prise valorisée')
    await ligne(page, 'Voie de difficulté', 'T3').getByRole('button', { name: 'Échec' }).click()
    await expect(pastille(ligne(page, 'Voie de difficulté', 'T3'))).toHaveText('Échec')
    await expect(compteur(page, 'Voie de difficulté')).toHaveText('3/3')

    // Chloé, sans groupe de départ : aucune voie, invite à définir le groupe (R9).
    await ouvrirGrimpeur(page, URL_ENFANT, 'Chloé Alpha')
    await expect(page.getByText(/Groupe de départ à définir/)).toBeVisible()
    await expect(voies).toHaveCount(0)
  })

  test('CT-05 · moulinette sans prise valorisée, tête avec (R10)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Ana Alpha')
    expect(await boutonsIssue(ligne(page, 'Voie de difficulté', 'M2'))).toEqual(['Top', 'Échec'])
    await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
    expect(await boutonsIssue(ligne(page, 'Voie de difficulté', 'T1'))).toEqual([
      'Top',
      'Prise valorisée',
      'Échec',
    ])
  })

  test('CT-06 · correction d’une issue = remplacement (R13)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
    const t2 = ligne(page, 'Voie de difficulté', 'T2')
    await expect(pastille(t2)).toHaveText('Prise valorisée')
    await t2.getByRole('button', { name: 'Top' }).click()
    await expect(pastille(t2)).toHaveText('Top')
    await expect(compteur(page, 'Voie de difficulté')).toHaveText('3/3')
    expect(
      execSql(
        `select count(*) from interclub.resultat_voie
          where grimpeur_id = '${GRIMPEURS.bob}' and voie_difficulte_id = '99999999-9999-9999-9999-999999999921';`,
      ),
    ).toBe('1')
  })

  test('CT-07 · ado : choix libre, deux T5, plafond 6 (R11, R12, R14)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ADO, 'Nora Delta')
    const formAjout = page.locator('form', { has: page.getByText(/Ajouter une voie/) })
    // Issues ado proposées (R12).
    expect(await formAjout.locator('button').allInnerTexts()).toEqual([
      'Top',
      'Zone 2',
      'Zone 1',
      'Échec',
    ])

    const saisies: [string, string][] = [
      [VOIE_ADO.T6, 'Top'],
      [VOIE_ADO.T5, 'Zone 2'],
      [VOIE_ADO.T5bis, 'Zone 1'], // 2ᵉ voie de même niveau, distincte (R11)
      [VOIE_ADO.T7, 'Échec'],
      [VOIE_ADO.T8, 'Top'],
      [VOIE_ADO.T4, 'Zone 2'],
    ]
    for (const [i, [voie, issue]] of saisies.entries()) {
      await expect(formAjout).toContainText(`Ajouter une voie (${i}/6)`)
      await formAjout.locator('select[name="voieDifficulteId"]').selectOption(voie)
      await formAjout.getByRole('button', { name: issue, exact: true }).click()
      await expect(compteur(page, 'Voie de difficulté')).toHaveText(`${i + 1}/6`)
    }
    // Deux T5 distinctes enregistrées ; plafond atteint → plus d'ajout (R14).
    await expect(ligne(page, 'Voie de difficulté', 'T5')).toHaveCount(2)
    await expect(page.getByText(/Ajouter une voie/)).toHaveCount(0)
  })

  test('CT-08 · retrait d’une voie ado libère un emplacement (R11, R14)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ADO, 'Nora Delta')
    await page.getByRole('button', { name: 'Retirer la voie T4' }).click()
    await expect(ligne(page, 'Voie de difficulté', 'T4')).toHaveCount(0)
    await expect(compteur(page, 'Voie de difficulté')).toHaveText('5/6')
    await expect(page.getByText('Ajouter une voie (5/6)')).toBeVisible()
  })

  test('CT-09 · blocs : palier, échec, re-saisie (R15, R16, R17)', async ({ page }) => {
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
    const b1 = ligne(page, 'Bloc', 'B1')
    const b2 = ligne(page, 'Bloc', 'B2')
    // Seuls les paliers DU bloc sont proposés (R16) : B1 n'a pas de « 3e essai ».
    expect(await boutonsIssue(b1)).toEqual(['1er essai', '2e essai', 'Échec'])

    await b1.getByRole('button', { name: '1er essai' }).click()
    await expect(pastille(b1)).toHaveText('1er essai')
    await b2.getByRole('button', { name: 'Échec' }).click()
    await expect(pastille(b2)).toHaveText('Échec')
    await expect(compteur(page, 'Bloc')).toHaveText('2/2')

    // Re-saisie : remplace (un seul résultat par bloc, R17).
    await b1.getByRole('button', { name: '2e essai' }).click()
    await expect(pastille(b1)).toHaveText('2e essai')
    expect(
      execSql(
        `select count(*) from interclub.resultat_bloc
          where grimpeur_id = '${GRIMPEURS.bob}' and bloc_id = '99999999-9999-9999-9999-999999999902';`,
      ),
    ).toBe('1')
  })

  test('CT-14 · vitesse en lecture seule (R22)', async ({ page }) => {
    await commeCoach(page)
    // Sans temps : « en attente ».
    await ouvrirGrimpeur(page, URL_ENFANT, 'Ana Alpha')
    const vitesse = page.locator('div', { has: page.getByRole('heading', { name: '⚡ Vitesse' }) }).last()
    await expect(vitesse).toContainText('en attente')

    // Le juge saisit un temps (pré-condition SQL, parcours juge = cahier 20).
    execSql(
      `insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, temps, issue)
       values ('${VITESSE_ENFANT}','${GRIMPEURS.ana}',7.5,'temps');`,
    )
    await ouvrirGrimpeur(page, URL_ENFANT, 'Ana Alpha')
    await expect(vitesse).toContainText('7,500 s')
    await expect(vitesse).toContainText('lecture (juge)')
    await expect(vitesse.getByRole('button')).toHaveCount(0)
  })

  test('CT-10 · coach temporaire : saisie en ③, borné à sa rencontre (R5, R7)', async ({ page }) => {
    await commeCoachTemporaire(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Ana Alpha')
    const m3 = ligne(page, 'Voie de difficulté', 'M3')
    await m3.getByRole('button', { name: 'Échec' }).click()
    await expect(pastille(m3)).toHaveText('Échec')

    // Une autre rencontre (ado) lui est fermée (R2).
    expect((await page.goto(URL_ADO))?.status()).toBe(404)
  })

  test('CT-11 · saisie fermée en préparation (R5)', async ({ page }) => {
    poserPhase('preparation')
    try {
      await commeCoach(page)
      await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
      await expect(page.getByText(/n’est ouverte qu’en phase compétition/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Top' })).toHaveCount(0)
      // L'écran reste consultable (contenu avant la ③ : cf. CT-15, R21bis).
      await expect(page.getByText('Bob Alpha')).toBeVisible()
    } finally {
      poserPhase('competition')
    }
  })

  test('CT-15 · avant la ③ : voies et blocs annoncés, pas de « groupe à définir » (R21bis)', async ({
    page,
  }) => {
    poserPhase('preparation')
    try {
      await commeCoach(page)
      await page.goto(URL_ENFANT)
      // Liste : aucun compteur de progression voies/blocs.
      await expect(page.locator('li > button').first()).toBeVisible()
      await expect(page.getByText(/🧗|🧱/)).toHaveCount(0)

      // Bob a un groupe (T1) : message unique, ni « à définir » ni « 0/0 ».
      await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
      await expect(
        page.getByText('Les voies et blocs seront visibles à l’ouverture de la compétition.'),
      ).toBeVisible()
      await expect(page.getByText(/Groupe de départ à définir/)).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Voie de difficulté' })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Bloc', exact: true })).toHaveCount(0)
      // Vitesse et score restent affichés.
      await expect(page.getByRole('heading', { name: '⚡ Vitesse' })).toBeVisible()
      await expect(page.getByText('Score (voie + bloc + vitesse)')).toBeVisible()
    } finally {
      poserPhase('competition')
    }
  })

  test('CT-12 · NP automatique à la clôture, enfant seulement (R18, R19)', async ({
    page,
    browser,
  }) => {
    // Pré-conditions : Ana n'a que M2 = Top ; Nora (ado) est à 4/6 (CT-07/08 : 5).
    execSql(
      `delete from interclub.resultat_voie where grimpeur_id = '${GRIMPEURS.ana}';
       delete from interclub.resultat_bloc where grimpeur_id = '${GRIMPEURS.ana}';
       insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
         values ('${VOIE_M2}','${GRIMPEURS.ana}','top');
       delete from interclub.resultat_voie
        where grimpeur_id = '${NORA}' and voie_difficulte_id = '${VOIE_ADO.T8}';`,
    )

    // L'admin passe les deux rencontres en clôture via le pilotage.
    const ctxAdmin = await browser.newContext()
    const admin = await ctxAdmin.newPage()
    await commeAdmin(admin)
    for (const id of [ENFANT, ADO]) {
      await admin.goto(`/admin/rencontres/${id}`)
      await admin.getByRole('button', { name: 'Avancer à la phase suivante' }).click()
      await expect(admin.getByRole('button', { name: 'Avancer à la phase suivante' })).toContainText(
        /Résultats publics/,
      )
    }
    await ctxAdmin.close()

    // Enfant : M3, M4, B1, B2 d'Ana en NP ; M2 reste Top ; saisie fermée (R19).
    await commeCoach(page)
    await ouvrirGrimpeur(page, URL_ENFANT, 'Ana Alpha')
    await expect(pastille(ligne(page, 'Voie de difficulté', 'M2'))).toHaveText('Top')
    await expect(pastille(ligne(page, 'Voie de difficulté', 'M3'))).toHaveText('NP')
    await expect(pastille(ligne(page, 'Voie de difficulté', 'M4'))).toHaveText('NP')
    await expect(pastille(ligne(page, 'Bloc', 'B1'))).toHaveText('NP')
    await expect(pastille(ligne(page, 'Bloc', 'B2'))).toHaveText('NP')
    await expect(page.getByRole('button', { name: 'Top' })).toHaveCount(0)

    // Ado : aucune voie NP créée, compteur inchangé (décision 2026-09-08).
    await ouvrirGrimpeur(page, URL_ADO, 'Nora Delta')
    await expect(compteur(page, 'Voie de difficulté')).toHaveText('4/6')
    expect(
      execSql(
        `select count(*) from interclub.resultat_voie where grimpeur_id = '${NORA}' and issue = 'np';`,
      ),
    ).toBe('0')
  })

  test('CT-11 · saisie fermée en clôture et résultats publics (R5)', async ({ page }) => {
    await commeCoach(page)
    for (const phase of ['cloture', 'resultats_publics'] as const) {
      poserPhase(phase)
      await ouvrirGrimpeur(page, URL_ENFANT, 'Bob Alpha')
      await expect(page.getByText(/n’est ouverte qu’en phase compétition/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Échec' })).toHaveCount(0)
    }
  })
})
