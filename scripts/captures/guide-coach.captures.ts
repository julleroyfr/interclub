import { test, expect, type Locator, type Page } from '@playwright/test'

import { commeCoach } from '../../e2e/helpers/auth'
import { CLUB_A, JETON, RENCONTRE_PILOTE, RENCONTRE_PILOTE_DATE } from '../../e2e/helpers/donnees'
import {
  execSql,
  nettoyerSessionsQr,
  poserDate,
  poserPhase,
  reinitialiserEngagement,
} from '../../e2e/helpers/sql'

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

/** Masque l'indicateur de dev Next.js (bouton « N ») sur toutes les pages. */
async function masquerOutilsDev(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.head.appendChild(style)
    })
  })
}

/**
 * Entoure chaque cible et lui accole un numéro (1, 2, …) repris dans le guide.
 * Les repères sont posés en coordonnées de document : ils restent en place sur
 * une capture pleine page.
 */
async function numeroter(page: Page, cibles: Locator[]): Promise<void> {
  await effacerReperes(page)
  for (const [i, cible] of cibles.entries()) {
    await cible.evaluate((el, numero) => {
      const r = el.getBoundingClientRect()
      const x = r.left + window.scrollX
      const y = r.top + window.scrollY
      const cadre = document.createElement('div')
      cadre.dataset.repere = ''
      Object.assign(cadre.style, {
        position: 'absolute', left: `${x - 4}px`, top: `${y - 4}px`,
        width: `${r.width + 8}px`, height: `${r.height + 8}px`,
        border: '3px solid #ff3d7f', borderRadius: '12px',
        pointerEvents: 'none', zIndex: '9998',
      })
      const pastille = document.createElement('div')
      pastille.dataset.repere = ''
      pastille.textContent = String(numero)
      Object.assign(pastille.style, {
        position: 'absolute', left: `${Math.max(2, x - 14)}px`, top: `${Math.max(2, y - 14)}px`,
        width: '24px', height: '24px', borderRadius: '50%',
        background: '#ff3d7f', color: '#fff', font: 'bold 14px/24px sans-serif',
        textAlign: 'center', boxShadow: '0 0 0 2px #fff',
        pointerEvents: 'none', zIndex: '9999',
      })
      document.body.append(cadre, pastille)
    }, i + 1)
  }
}

async function effacerReperes(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('[data-repere]').forEach((n) => n.remove()))
}

async function capturer(page: Page, nom: string, options: { pleinePage?: boolean } = {}): Promise<void> {
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: options.pleinePage ?? true })
}

/** Capture recadrée sur un bloc de la page (repères compris, marge de 16 px). */
async function capturerBloc(page: Page, bloc: Locator, nom: string): Promise<void> {
  const b = await bloc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
  })
  const marge = 16
  const largeur = page.viewportSize()!.width
  const x = Math.max(0, b.x - marge)
  await page.screenshot({
    path: `${DOSSIER}/${nom}.png`,
    fullPage: true,
    clip: { x, y: Math.max(0, b.y - marge), width: Math.min(largeur - x, b.width + 2 * marge), height: b.height + 2 * marge },
  })
}

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
