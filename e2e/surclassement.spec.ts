import { expect, test } from './helpers/fixtures'
import { commeAdmin, commeCoach } from './helpers/auth'
import { CLUB_A } from './helpers/donnees'
import { execSql } from './helpers/sql'

/**
 * Surclassement enfant → ado (spec #21), cahier docs/tests/34-surclassement.cahier.md
 * CT-01 à CT-05 : l'admin surclasse un enfant (R2, R18) → le coach le voit et
 * l'engage en ado, badge « Surclassé » (R7, R20) → l'admin révoque, la
 * confirmation annonce le retrait (R15) → retiré de la rencontre ado ① (R12) et
 * plus proposé au coach (R21).
 *
 * Données dédiées (grimpeur, rencontre ado ①, équipe), créées et nettoyées ici.
 * Saison 2026–2027 : à rejouer avant le 1er septembre 2027 (date de rencontre).
 */
const GRIMPEUR = '21e2e000-0000-0000-0000-0000000000a1'
const RENCONTRE = '21e2e000-0000-0000-0000-000000000001'
const EQUIPE = '21e2e000-0000-0000-0000-0000000000e1'

function nettoyer() {
  execSql(
    `delete from interclub.rencontre where id = '${RENCONTRE}';
     delete from interclub.grimpeur where id = '${GRIMPEUR}';`,
  )
}

test.describe('Surclassement enfant → ado (spec #21)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    nettoyer()
    execSql(
      `insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
         values ('${GRIMPEUR}', '${CLUB_A}', 'Surclasse', 'Tom', 2015, 'H', 921101);
       insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
         values ('${RENCONTRE}', '2026-12-05', '${CLUB_A}', 'ado', 'pre_competition');
       insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${EQUIPE}', '${RENCONTRE}', '${CLUB_A}', 'Surclassement A');`,
    )
  })
  test.afterAll(nettoyer)

  test('surclasser → engager en ado → révoquer → retiré', async ({ page, browser }) => {
    const ctxCoach = await browser.newContext()
    const pageCoach = await ctxCoach.newPage()
    await commeCoach(pageCoach)
    const optionsCoach = async () => {
      await pageCoach.goto(`/coach/rencontres/${RENCONTRE}`)
      return pageCoach.locator('select[name="grimpeurId"] option').allInnerTexts()
    }

    // Avant : un enfant de 11 ans n'est pas proposé en ado (spec #1 R34).
    expect((await optionsCoach()).join('|')).not.toContain('Tom Surclasse')

    // CT-01 — L'admin surclasse pour la saison courante (R2, R18).
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs?recherche=Surclasse')
    const ligne = page.locator('li', { hasText: 'Surclasse' })
    await ligne.getByRole('button', { name: 'Surclasser' }).click()
    await expect(ligne.getByLabel('Saison')).toHaveValue('2026')
    await ligne.getByRole('button', { name: 'Confirmer le surclassement' }).click()
    await expect(
      ligne.getByRole('status').filter({ hasText: 'Tom SURCLASSE est surclassé en ado pour la saison 2026–2027.' }),
    ).toBeVisible()
    await expect(ligne.getByText('Surclassé ado 2026–2027')).toBeVisible()
    await expect(ligne.getByRole('button', { name: 'Surclasser' })).toHaveCount(0)

    // CT-02 — Le coach le voit et l'engage en ado, badge « Surclassé » (R7, R20).
    expect(await optionsCoach()).toContain('Tom Surclasse · surclassé')
    await pageCoach.locator('select[name="grimpeurId"]').selectOption({ label: 'Tom Surclasse · surclassé' })
    await pageCoach.getByRole('button', { name: 'Ajouter à l’équipe' }).click()
    const membre = pageCoach.locator('li', { hasText: 'Tom Surclasse' })
    await expect(membre.getByText('Surclassé', { exact: true })).toBeVisible()

    // CT-03 — Confirmation de révocation : la rencontre ① est annoncée (R15).
    await page.reload()
    await ligne.getByRole('button', { name: 'Révoquer le surclassement' }).click()
    await expect(ligne.getByText('05/12/2026 — Club A, équipe « Surclassement A »')).toBeVisible()
    await ligne.getByRole('button', { name: 'Oui, révoquer' }).click()
    await expect(
      ligne.getByRole('status').filter({ hasText: 'Tom SURCLASSE a été retiré de 1 rencontre ado à venir.' }),
    ).toBeVisible()
    await expect(ligne.getByText('Surclassé ado 2026–2027')).toHaveCount(0)

    // CT-04 — Retiré de la rencontre ado ① (R12), historique conservé (R11, R19).
    expect(
      execSql(`select count(*) from interclub.composition where grimpeur_id = '${GRIMPEUR}';`),
    ).toBe('0')
    await ligne.getByText(/Historique des surclassements \(1\)/).click()
    await expect(ligne.getByRole('cell', { name: '2026–2027' })).toBeVisible()

    // CT-05 — Plus proposé au coach (R21) ; l'admin peut surclasser à nouveau (R11).
    expect((await optionsCoach()).join('|')).not.toContain('Tom Surclasse')
    await expect(ligne.getByRole('button', { name: 'Surclasser' })).toBeVisible()
    await ctxCoach.close()
  })
})
