import { expect, test } from '@playwright/test'

import { commeCoach, commeSansMapping } from './helpers/auth'
import { RENCONTRE_PILOTE } from './helpers/donnees'
import { poserPhase } from './helpers/sql'

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

  // ── Cartographie du reste du cahier (à implémenter incrémentalement) ──────────
  // Chaque fixme = un cas `[auto]` du cahier, prêt à être décroché un par un.

  test.fixme(
    'CT-02 — Créer une équipe et composer (R9, R10, R11, R12, R15)',
    async () => {},
  )
  test.fixme('CT-03 — Groupe de départ, rencontre enfant (R19, R20, R21)', async () => {})
  test.fixme('CT-04 — Refus double engagement + plafond 8 (R14, R15)', async () => {})
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
