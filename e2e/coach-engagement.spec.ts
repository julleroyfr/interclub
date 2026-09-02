import { expect, test, type Page } from '@playwright/test'

import { commeCoach, commeSansMapping } from './helpers/auth'
import { POOL_LIBRES, RENCONTRE_PILOTE } from './helpers/donnees'
import { poserPhase, reinitialiserEngagement } from './helpers/sql'

const URL_RENCONTRE = `/coach/rencontres/${RENCONTRE_PILOTE}`

/** Carte (li) d'une équipe, repérée par son titre exact. */
const carteEquipe = (page: Page, nom: string) =>
  page.locator('li', {
    has: page.getByRole('heading', { name: nom, exact: true }),
  })

/** Crée une équipe via le formulaire « Nouvelle équipe ». */
async function creerEquipe(page: Page, nom: string) {
  await page.getByLabel('Nouvelle équipe').fill(nom)
  await page.getByRole('button', { name: /Créer l.équipe/ }).click()
  await expect(page.getByRole('heading', { name: nom, exact: true })).toBeVisible()
}

/** Ajoute un grimpeur (par libellé) à une équipe donnée, groupe optionnel. */
async function ajouterGrimpeur(
  page: Page,
  equipe: string,
  labelGrimpeur: string,
  groupe?: string,
) {
  const carte = carteEquipe(page, equipe)
  await carte.locator('select[name="grimpeurId"]').selectOption({ label: labelGrimpeur })
  if (groupe) {
    await carte
      .getByLabel('Groupe de départ (optionnel)')
      .selectOption({ label: `Groupe ${groupe}` })
  }
  await carte.getByRole('button', { name: /Ajouter à l.équipe/ }).click()
  // Confirmer via la LIGNE de composition (li), pas le texte brut : le libellé
  // existe aussi comme <option> caché dans les sélecteurs de roster.
  await expect(carte.locator('li', { hasText: labelGrimpeur })).toBeVisible()
}

/**
 * Exécution automatisée des cas `[auto]` du cahier
 * docs/tests/13-espace-coach.cahier.md (pilote de l'ADR 0004).
 *
 * Pré-requis : stack Supabase LOCALE up (`supabase start` + seed 01) et app dev
 * sur le port 3011. Ce fichier NE couvre PAS les résidus `[manuel]` (CT-05 :
 * couleur du badge « Prêté ») — ceux-là restent au testeur humain.
 *
 * Chaque `test` cite son `CT-xx` et les règles `Rn` couvertes, comme le cahier.
 */

test.describe('Cahier 13 — Espace coach : engagement', () => {
  // Ces tests mutent TOUS la même rencontre pilote en base : ils doivent
  // s'exécuter en série (un seul worker, un seul profil). Cf. `test:cahier:coach`
  // (--project=chromium --workers=1).
  test.describe.configure({ mode: 'serial' })

  // Baseline garantie avant chaque test : A1 = {Ana, Bob}, A2 vide, B1 = {Cléo},
  // aucune équipe surnuméraire (idempotence, y compris après un test échoué).
  test.beforeEach(() => {
    reinitialiserEngagement()
  })

  test('CT-01 — Accueil coach : liste, badge de phase, effectif, lien (R6, R7, R8)', async ({
    page,
  }) => {
    // Pré-condition : phase pré-compétition (cahier CT-01).
    poserPhase('pre_competition')

    await commeCoach(page)
    await page.goto('/coach')

    // La carte de la rencontre pilote : date + club porteur, badge de phase,
    // effectif du club, et lien vers l'écran d'engagement.
    const carte = page.getByRole('link', {
      name: new RegExp(`19 septembre 2026`),
    })
    await expect(carte).toBeVisible()
    await expect(carte).toContainText('Club A')
    await expect(carte).toContainText(/pré-compétition/i)
    await expect(carte).toContainText('2 équipe(s) · 2 grimpeur(s)')
    await expect(carte).toHaveAttribute(
      'href',
      `/coach/rencontres/${RENCONTRE_PILOTE}`,
    )
  })

  test('CT-01 (négatif) — /coach interdit hors coach : 404 (RLS/garde)', async ({
    page,
    browser,
  }) => {
    // Compte sans mapping → 404.
    await commeSansMapping(page)
    const reponseSansRole = await page.goto('/coach')
    expect(reponseSansRole?.status()).toBe(404)

    // Visiteur non connecté (contexte vierge) → 404.
    const contexteAnonyme = await browser.newContext()
    const pageAnonyme = await contexteAnonyme.newPage()
    const reponseAnonyme = await pageAnonyme.goto('/coach')
    expect(reponseAnonyme?.status()).toBe(404)
    await contexteAnonyme.close()
  })

  test('CT-02 — Créer une équipe et composer (R9, R10, R11, R12, R15)', async ({
    page,
  }) => {
    poserPhase('pre_competition')
    await commeCoach(page)
    await page.goto(URL_RENCONTRE)

    // Créer A3 puis y ajouter un grimpeur libre du pool.
    await creerEquipe(page, 'A3')
    await ajouterGrimpeur(page, 'A3', POOL_LIBRES[0].label) // Chloé Alpha

    const carteA3 = carteEquipe(page, 'A3')
    await expect(carteA3.locator('li', { hasText: 'Chloé Alpha' })).toBeVisible()

    // Le roster ne propose pas les grimpeurs déjà engagés (Ana/Bob en A1, R14).
    const options = await carteA3.locator('select[name="grimpeurId"] option').allInnerTexts()
    expect(options).not.toContain('Ana Alpha')
    expect(options).not.toContain('Bob Alpha')

    // Recréer « A3 » (même nom) → refusé, nom unique par rencontre (R10).
    await page.getByLabel('Nouvelle équipe').fill('A3')
    await page.getByRole('button', { name: /Créer l.équipe/ }).click()
    await expect(page.getByText('Une équipe « A3 » existe déjà.')).toBeVisible()
  })

  test('CT-03 — Groupe de départ, rencontre enfant (R19, R20, R21)', async ({
    page,
  }) => {
    poserPhase('pre_competition')
    await commeCoach(page)
    await page.goto(URL_RENCONTRE)

    // Le formulaire d'ajout de A2 (vide) porte le sélecteur de groupe (enfant).
    const carteA2 = carteEquipe(page, 'Équipe A2')
    const selectGroupe = carteA2.getByLabel('Groupe de départ (optionnel)')

    // R19 : la liste des groupes s'arrête à T8 (ni T9 ni T10).
    const groupes = await selectGroupe.locator('option').allInnerTexts()
    expect(groupes).toContain('Groupe T8')
    expect(groupes).not.toContain('Groupe T9')
    expect(groupes).not.toContain('Groupe T10')

    // R20 : choisir M2 affiche l'indice « M2 · M3 · M4 » (3 voies croissantes).
    await selectGroupe.selectOption({ label: 'Groupe M2' })
    await expect(carteA2.getByText('M2 · M3 · M4')).toBeVisible()

    // R21 : après ajout avec le groupe M2, la ligne du membre reflète M2.
    await ajouterGrimpeur(page, 'Équipe A2', POOL_LIBRES[2].label, 'M2') // Emma
    const ligneEmma = carteA2.locator('li', { hasText: 'Emma Alpha' })
    await expect(ligneEmma.locator('select[name="groupeDepart"]')).toHaveValue('M2')
  })

  test('CT-04 — Refus double engagement + plafond 8 (R14, R15)', async ({ page }) => {
    poserPhase('pre_competition')
    await commeCoach(page)
    await page.goto(URL_RENCONTRE)

    // R14 : le roster de A2 ne propose ni Ana ni Bob (déjà engagés en A1).
    const carteA2 = carteEquipe(page, 'Équipe A2')
    const rosterA2 = await carteA2.locator('select[name="grimpeurId"] option').allInnerTexts()
    expect(rosterA2).not.toContain('Ana Alpha')
    expect(rosterA2).not.toContain('Bob Alpha')

    // R15 : remplir une équipe à 8/8 avec le pool libre, puis constater le plafond.
    await creerEquipe(page, 'PLEIN')
    for (const g of POOL_LIBRES) {
      await ajouterGrimpeur(page, 'PLEIN', g.label)
    }
    const cartePlein = carteEquipe(page, 'PLEIN')
    await expect(
      cartePlein.getByText(/Équipe complète — plafond de 8 atteint/),
    ).toBeVisible()
    // Le formulaire d'ajout a disparu (aucun 9ᵉ possible).
    await expect(cartePlein.locator('select[name="grimpeurId"]')).toHaveCount(0)
  })
  // CT-05 est `[mixte]` : le cœur (roster, badge « Prêté », retrait) est auto ;
  // la couleur violette du badge reste `[manuel]` (hors E2E).
  test.fixme('CT-05 — Grimpeur prêté : rattachement admin, gestion coach (R13, R35, R36)', async () => {})
  test.fixme('CT-06 — Garde-fou date : préparation jour J seulement (spec #1 R5)', async () => {})
  test.fixme('CT-07 — Ouverture session QR coach temp en préparation (spec #2 R12)', async () => {})
  test.fixme('CT-08 — Coach temporaire édite en préparation (R16 ; spec #1 R6, R27)', async () => {})
  test.fixme('CT-09 — Coach temporaire borné à SA rencontre (spec #1 R27)', async () => {})
  test.fixme('CT-10 — Gel de l’engagement en compétition (R16, R17)', async () => {})
  test.fixme('CT-11 — Gel dès la pré-compétition pour le coach temp (R16 ; spec #1 R28)', async () => {})
  test.fixme('CT-12 — Lecture seule : rencontre terminée (R17)', async () => {})
  test.fixme('CT-13 — Périmètre inter-club interdit (R2 ; spec #1 R16)', async () => {})
})
