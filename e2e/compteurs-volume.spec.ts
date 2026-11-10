import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { execSql } from './helpers/sql'

/**
 * Compteurs au-delà du plafond de l'API (liste des clubs, liste des rencontres,
 * tableau de bord admin). L'API renvoie au plus 1000 lignes par lecture : un
 * comptage fait en lisant les lignes serait faux SANS erreur. Les compteurs
 * sont donc faits par la base (`count`).
 *
 * Un club dédié « Club Volume » reçoit 1100 grimpeurs et porte une rencontre de
 * la saison à 1100 équipes. Attendu : « 1100 grimpeurs » sur la liste des clubs,
 * « 1100 équipes » sur la liste des rencontres, et partout le compte réel en
 * base. Un club sans grimpeur ni rencontre (« Club Vide ») reste listé, à 0, et
 * supprimable.
 *
 * Série + un seul worker : ajoute des données visibles de tous les écrans.
 */

const CLUB_VOLUME = 'c1c1c1c1-0000-0000-0000-000000000001'
const CLUB_VIDE = 'c1c1c1c1-0000-0000-0000-000000000002'
const RENCONTRE_VOLUME = 'c1c1c1c1-0000-0000-0000-0000000000a1'
const NB_GRIMPEURS = 1100
const NB_EQUIPES = 1100

function purgerVolume(): void {
  execSql(
    `delete from interclub.rencontre where id = '${RENCONTRE_VOLUME}';
     delete from interclub.grimpeur where club_id = '${CLUB_VOLUME}';
     delete from interclub.club where id in ('${CLUB_VOLUME}', '${CLUB_VIDE}');`,
  )
}

test.describe('Compteurs au-delà de 1000 lignes', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    purgerVolume()
    execSql(
      `insert into interclub.club (id, nom) values ('${CLUB_VOLUME}', 'Club Volume'), ('${CLUB_VIDE}', 'Club Vide');
       insert into interclub.grimpeur (club_id, nom, prenom, annee_naissance, sexe, licence)
         select '${CLUB_VOLUME}', 'Volume' || lpad(i::text, 4, '0'), 'Léo', 2014, 'H', 9990000 + i
           from generate_series(1, ${NB_GRIMPEURS}) i;
       insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie)
         values ('${RENCONTRE_VOLUME}', current_date, '${CLUB_VOLUME}', 'enfant');
       insert into interclub.equipe (rencontre_id, club_id, nom)
         select '${RENCONTRE_VOLUME}', '${CLUB_VOLUME}', 'Équipe ' || lpad(i::text, 4, '0')
           from generate_series(1, ${NB_EQUIPES}) i;`,
    )
  })

  test.afterAll(() => {
    purgerVolume()
  })

  test('le jeu dépasse bien le plafond de l’API', () => {
    expect(Number(execSql('select count(*) from interclub.grimpeur;'))).toBeGreaterThan(1000)
    expect(Number(execSql('select count(*) from interclub.equipe;'))).toBeGreaterThan(1000)
  })

  test('la liste des clubs compte tous les grimpeurs de chaque club', async ({ page }) => {
    const attendus = execSql(
      `select c.nom || '|' || count(g.id) from interclub.club c
         left join interclub.grimpeur g on g.club_id = c.id
        group by c.id, c.nom;`,
    )
      .split('\n')
      .map((l) => l.split('|') as [string, string])

    await commeAdmin(page)
    await page.goto('/admin/clubs')

    for (const [nom, nb] of attendus) {
      const club = page.getByText(nom, { exact: true }).locator('..')
      await expect(club).toContainText(`${nb} grimpeur`)
    }
    await expect(page.getByText('Club Volume', { exact: true }).locator('..')).toContainText(
      `${NB_GRIMPEURS} grimpeurs`,
    )
  })

  test('un club sans grimpeur est listé à 0 et supprimable', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/clubs')

    // Carte du club : le plus petit bloc qui contient son nom et ses actions.
    const carte = (nom: string) =>
      page
        .locator('div', { has: page.getByText(nom, { exact: true }) })
        .filter({ has: page.getByRole('button', { name: 'Supprimer' }) })
        .last()

    await expect(carte('Club Vide')).toContainText('0 rencontre · 0 grimpeur')
    await expect(carte('Club Vide').getByRole('button', { name: 'Supprimer' })).toBeEnabled()
    await expect(carte('Club Volume').getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  })

  test('la liste des rencontres compte toutes les équipes', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/rencontres')

    const carte = page.locator('div.min-w-0', { hasText: 'Club Volume' })
    await expect(carte).toContainText(`${NB_EQUIPES} équipes · 0 épreuve`)
  })

  test('le tableau de bord affiche les comptes réels', async ({ page }) => {
    const [clubs, rencontres, grimpeurs, competition] = execSql(
      `select (select count(*) from interclub.club) || '|' ||
              (select count(*) from interclub.rencontre) || '|' ||
              (select count(*) from interclub.grimpeur) || '|' ||
              (select count(*) from interclub.rencontre where phase = 'competition');`,
    ).split('|')

    await commeAdmin(page)
    await page.goto('/admin')

    // Carte statistique : le libellé est un <p> sous la valeur.
    const stat = (libelle: string) =>
      page.locator('main p', { hasText: new RegExp(`^${libelle}$`) }).first().locator('..')
    await expect(stat('Clubs')).toContainText(clubs!)
    await expect(stat('Rencontres')).toContainText(rencontres!)
    await expect(stat('Grimpeurs')).toContainText(grimpeurs!)
    await expect(stat('En compétition')).toContainText(competition!)
    // La rencontre de la saison la plus récente remonte, club porteur embarqué.
    await expect(page.getByText('Club Volume').first()).toBeVisible()
  })
})
