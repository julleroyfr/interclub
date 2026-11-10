import type { Page } from '@playwright/test'

import { expect, test } from './helpers/fixtures'
import { commeAdmin } from './helpers/auth'
import { CLUB_A, CLUB_B, RENCONTRE_PILOTE } from './helpers/donnees'
import { execSql, poserPhase, reinitialiserEngagement } from './helpers/sql'

/**
 * Lectures vérifiées dans les Server Actions (constat B3 de l'analyse du
 * 2026-11-10, lot 9 ; convention 02 §7). Une lecture en ÉCHEC ne doit jamais
 * passer pour « aucune donnée » : l'action lève une erreur (écran d'erreur) et
 * n'écrit RIEN. Avant correction, l'échec passait pour « introuvable », voire
 * levait une garde (« déjà engagé », plafond de l'équipe) et l'écriture avait
 * lieu.
 *
 * Panne SIMULÉE : le droit `select` d'`authenticated` sur la table lue est
 * retiré juste avant l'action (la page est déjà chargée), puis rétabli quoi
 * qu'il arrive (même procédé que le cahier 23 CT-14).
 *
 * Série + un seul worker : retire des droits et mute la rencontre pilote.
 */

const DEVI = 'Devi Bravo'
const ADULTE = 'adadad00-0000-0000-0000-0000000000b3'
const EQUIPE_ADULTE = 'adadad00-0000-0000-0000-0000000000e3'
const ENFANT = 'b3b3b3b3-0000-0000-0000-0000000000a1'
const CLUB_CSV = 'b3b3b3b3-0000-0000-0000-0000000000c1'

async function sansDroitDeLecture(table: string, action: () => Promise<void>): Promise<void> {
  execSql(`revoke select on interclub.${table} from authenticated;`)
  try {
    await action()
  } finally {
    execSql(`grant select on interclub.${table} to authenticated;`)
  }
}

async function ecranErreur(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Une erreur est survenue' })).toBeVisible()
}

const compter = (sql: string) => execSql(sql)

function nettoyer(): void {
  execSql(
    `delete from interclub.rencontre where id = '${ADULTE}';
     delete from interclub.grimpeur where id = '${ENFANT}' or club_id = '${CLUB_CSV}';
     delete from interclub.club where id = '${CLUB_CSV}';`,
  )
}

test.describe('Lectures vérifiées dans les actions (B3)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    nettoyer()
    execSql(
      `insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
         values ('${ENFANT}', '${CLUB_A}', 'Lecture', 'Nina', 2015, 'F', 921301);
       insert into interclub.club (id, nom) values ('${CLUB_CSV}', 'Club E2E lectures');
       insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
         values ('${ADULTE}', '2027-03-06', '${CLUB_B}', 'adulte', 'pre_competition');
       insert into interclub.equipe (id, rencontre_id, club_id, nom)
         values ('${EQUIPE_ADULTE}', '${ADULTE}', null, 'Adultes lecture');`,
    )
  })

  test.beforeEach(() => {
    reinitialiserEngagement()
    poserPhase('pre_competition')
  })

  test.afterAll(() => {
    nettoyer()
    reinitialiserEngagement()
  })

  test('prêt : compositions illisibles → erreur, aucun prêt créé', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
    const formPret = page.locator('form', { has: page.getByLabel('Club du grimpeur') })
    await formPret.getByLabel('Club du grimpeur').selectOption({ label: 'Club B' })
    await formPret.getByLabel(/Rechercher un grimpeur/).fill('Devi')
    await formPret.locator('select[name="grimpeurId"]').selectOption({ label: DEVI })
    await formPret.locator('select[name="clubAccueilId"]').selectOption({ label: 'Club A' })

    await sansDroitDeLecture('composition', async () => {
      await formPret.getByRole('button', { name: /Créer le prêt/ }).click()
      await ecranErreur(page)
    })
    expect(compter(`select count(*) from interclub.pret where rencontre_id = '${RENCONTRE_PILOTE}';`)).toBe('0')
  })

  test('équipe (admin) : compositions illisibles → erreur, aucun ajout', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${RENCONTRE_PILOTE}`)
    const clubB = page.locator('details[data-club="Club B"]')
    await clubB.locator('summary').first().click()
    const equipe = clubB.locator('[data-equipe="Équipe B1"]')
    await equipe.locator('select[name="grimpeurId"]').selectOption({ label: DEVI })

    await sansDroitDeLecture('composition', async () => {
      await equipe.getByRole('button', { name: /Ajouter/ }).click()
      await ecranErreur(page)
    })
    expect(
      compter(
        `select count(*) from interclub.composition c join interclub.grimpeur g on g.id = c.grimpeur_id
          where c.rencontre_id = '${RENCONTRE_PILOTE}' and g.prenom = 'Devi';`,
      ),
    ).toBe('0')
  })

  test('équipe adulte : compositions illisibles → erreur, aucun ajout', async ({ page }) => {
    await commeAdmin(page)
    await page.goto(`/admin/rencontres/${ADULTE}`)
    const equipe = page.locator('[data-equipe="Adultes lecture"]')
    await equipe.getByLabel('Ajouter un grimpeur (tous clubs, 16 ans et plus)').fill('Lucie')

    await sansDroitDeLecture('composition', async () => {
      await equipe.getByRole('button', { name: 'Ajouter' }).click()
      await ecranErreur(page)
    })
    expect(compter(`select count(*) from interclub.composition where equipe_id = '${EQUIPE_ADULTE}';`)).toBe('0')
  })

  test('modification d’un grimpeur : fiche illisible → erreur, rien modifié', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs?recherche=Lecture')
    const ligne = page.locator('li', { hasText: 'Lecture' })
    await ligne.getByRole('button', { name: 'Modifier' }).click()
    await ligne.getByLabel('Prénom').fill('Ninon')

    await sansDroitDeLecture('grimpeur', async () => {
      await ligne.getByRole('button', { name: 'Enregistrer' }).click()
      await ecranErreur(page)
    })
    expect(compter(`select prenom from interclub.grimpeur where id = '${ENFANT}';`)).toBe('Nina')
  })

  test('surclassement : fiche illisible → erreur, aucun accord', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs?recherche=Lecture')
    const ligne = page.locator('li', { hasText: 'Lecture' })
    await ligne.getByRole('button', { name: 'Surclasser' }).click()

    await sansDroitDeLecture('grimpeur', async () => {
      await ligne.getByRole('button', { name: 'Confirmer le surclassement' }).click()
      await ecranErreur(page)
    })
    expect(compter(`select count(*) from interclub.surclassement where grimpeur_id = '${ENFANT}';`)).toBe('0')
  })

  test('révocation de surclassement : fiche illisible → erreur, toujours surclassé', async ({ page }) => {
    execSql(`insert into interclub.surclassement (grimpeur_id, saison) values ('${ENFANT}', 2026);`)
    try {
      await commeAdmin(page)
      await page.goto('/admin/grimpeurs?recherche=Lecture')
      const ligne = page.locator('li', { hasText: 'Lecture' })
      await ligne.getByRole('button', { name: 'Révoquer le surclassement' }).click()

      await sansDroitDeLecture('grimpeur', async () => {
        await ligne.getByRole('button', { name: 'Oui, révoquer' }).click()
        await ecranErreur(page)
      })
      expect(
        compter(
          `select count(*) from interclub.surclassement
            where grimpeur_id = '${ENFANT}' and revoque_le is null;`,
        ),
      ).toBe('1')
    } finally {
      execSql(`delete from interclub.surclassement where grimpeur_id = '${ENFANT}';`)
    }
  })

  test('import CSV : club illisible → erreur, aucun grimpeur importé', async ({ page }) => {
    await commeAdmin(page)
    await page.goto('/admin/grimpeurs/import-csv')
    await page.getByLabel('Club cible').selectOption({ label: 'Club E2E lectures' })
    await page.getByLabel(/Fichier des grimpeurs/).setInputFiles({
      name: 'liste.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('QUALITE,NOM,PRENOM,DATNAISS\nMME,LECTURE,ZOE,2015-03-03', 'utf8'),
    })

    await sansDroitDeLecture('club', async () => {
      await page.getByRole('button', { name: /Lancer l’import/ }).click()
      await ecranErreur(page)
    })
    expect(compter(`select count(*) from interclub.grimpeur where club_id = '${CLUB_CSV}';`)).toBe('0')
  })
})
