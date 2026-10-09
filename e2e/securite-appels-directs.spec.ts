import type { APIRequestContext, APIResponse } from '@playwright/test'

import { infosApi } from './helpers/api'
import { COMPTES, CLUB_A, JETON, RENCONTRE_PILOTE_DATE } from './helpers/donnees'
import { expect, test } from './helpers/fixtures'
import { execSql, nettoyerSessionsQr, poserDate, poserPhase } from './helpers/sql'

// Cahier 28 — sécurité en base, appels PostgREST DIRECTS (revue du 2026-10-03,
// lot 1, migration 202610031100_durcissement_securite). Aucun écran : chaque cas
// appelle l'API avec la clé anon publique ou le jeton d'un compte non habilité,
// et vérifie que la BASE refuse ou neutralise. Pré-conditions et contrôles en SQL
// (docker exec), comme le cahier en SQL Editor.

const DATE_TEST = '2026-12-01' // date réservée au cas : aucune rencontre seed ce jour-là
const RENCONTRE_ADO = 'adadadad-adad-adad-adad-adadadadadad'
const EPREUVE_VITESSE = '88888888-8888-8888-8888-888888888803'
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COACH_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const RPC_ANON = [
  'contexte_coach_temporaire',
  'contexte_juge',
  'liste_grimpeurs_vitesse',
  'ouvrir_session_qr',
]

type Entetes = Record<string, string>

function entetes(jeton?: string, ecriture = false): Entetes {
  const { anon } = infosApi()
  return {
    apikey: anon,
    ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    [ecriture ? 'Content-Profile' : 'Accept-Profile']: 'interclub',
    'Content-Type': 'application/json',
  }
}

async function jetonDe(request: APIRequestContext, email: string, mdp: string) {
  const { url, anon } = infosApi()
  const rep = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    data: { email, password: mdp },
  })
  expect(rep.ok()).toBe(true)
  return (await rep.json()).access_token as string
}

async function appelerRpc(
  request: APIRequestContext,
  fonction: string,
  corps: object,
  jeton?: string,
): Promise<APIResponse> {
  return request.post(`${infosApi().url}/rest/v1/rpc/${fonction}`, {
    headers: entetes(jeton, true),
    data: corps,
  })
}

/** Refus de PRIVILÈGE (42501) : la fonction n'a pas été exécutée. */
async function attendrePermissionRefusee(rep: APIResponse, fonction: string) {
  expect([401, 403]).toContain(rep.status())
  const corps = await rep.json()
  expect(corps.code).toBe('42501')
  expect(corps.message).toContain(`permission denied for function ${fonction}`)
}

const nbRencontresDuJourTest = () =>
  Number(
    execSql(`select count(*) from interclub.rencontre where date_rencontre = '${DATE_TEST}';`),
  )

const supprimerRencontresDuJourTest = () =>
  execSql(`delete from interclub.rencontre where date_rencontre = '${DATE_TEST}';`)

const corpsCreation = {
  p_date: DATE_TEST,
  p_club_porteur: CLUB_A,
  p_categorie: 'ado',
}

test.describe.configure({ mode: 'serial' })

test.describe('Cahier 28 — sécurité en base, appels PostgREST directs', () => {
  let jetonCoach: string
  let jetonAdmin: string

  test.beforeAll(async ({ request }) => {
    supprimerRencontresDuJourTest()
    jetonCoach = await jetonDe(request, COMPTES.coach.email, COMPTES.coach.mdp)
    jetonAdmin = await jetonDe(request, COMPTES.admin.email, COMPTES.admin.mdp)
  })

  test.afterAll(() => {
    supprimerRencontresDuJourTest()
  })

  test('CT-01 — aucune fonction ouverte à PUBLIC ; anon limité aux RPC QR', () => {
    const ouvertesPublic = execSql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'interclub'
          and (p.proacl is null
               or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
        order by 1;`,
    )
    expect(ouvertesPublic).toBe('')

    const anon = execSql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'interclub' and has_function_privilege('anon', p.oid, 'execute')
        order by 1;`,
    )
    expect(anon.split('\n')).toEqual(RPC_ANON)
  })

  test('CT-02 — création de rencontre refusée sans compte (C1, spec #3 R12)', async ({
    request,
  }) => {
    const rep = await appelerRpc(request, 'creer_rencontre_avec_gabarit', corpsCreation)
    await attendrePermissionRefusee(rep, 'creer_rencontre_avec_gabarit')
    expect(nbRencontresDuJourTest()).toBe(0)
  })

  test('CT-03 — création de rencontre refusée à un coach (C1, spec #3 R12)', async ({
    request,
  }) => {
    const rep = await appelerRpc(
      request,
      'creer_rencontre_avec_gabarit',
      corpsCreation,
      jetonCoach,
    )
    expect(rep.status()).toBe(403)
    const corps = await rep.json()
    expect(corps.code).toBe('42501')
    expect(corps.message).toBe('acces_refuse')
    expect(nbRencontresDuJourTest()).toBe(0)
  })

  test('CT-04 — création de rencontre par l’admin, structure copiée (C1, spec #3 R12/R30)', async ({
    request,
  }) => {
    const rep = await appelerRpc(
      request,
      'creer_rencontre_avec_gabarit',
      corpsCreation,
      jetonAdmin,
    )
    expect(rep.ok()).toBe(true)
    const id = (await rep.json()) as string

    // Structure copiée du gabarit ado : 3 épreuves, voies, blocs + paliers,
    // voies de vitesse et barème.
    const structure = execSql(
      `select (select count(*) from interclub.epreuve where rencontre_id = '${id}')
         || ',' || (select count(*) > 0 from interclub.voie_difficulte vd
                      join interclub.epreuve e on e.id = vd.epreuve_id where e.rencontre_id = '${id}')
         || ',' || (select count(*) > 0 from interclub.bloc_palier bp
                      join interclub.bloc b on b.id = bp.bloc_id
                      join interclub.epreuve e on e.id = b.epreuve_id where e.rencontre_id = '${id}')
         || ',' || (select count(*) > 0 from interclub.voie_vitesse where rencontre_id = '${id}')
         || ',' || (select count(*) > 0 from interclub.bareme_vitesse_echelon be
                      join interclub.epreuve e on e.id = be.epreuve_id where e.rencontre_id = '${id}');`,
    )
    expect(structure).toBe('3,true,true,true,true')
  })

  test('CT-05 — finalisation d’inscription coach refusée hors serveur (M1, spec #2 R30–R33)', async ({
    request,
  }) => {
    const corps = {
      p_valeur: '00000000-0000-0000-0000-000000000000',
      p_utilisateur_id: '00000000-0000-0000-0000-000000000000',
    }
    // Un refus de privilège (et non `invitation_inconnue`) prouve que la
    // fonction n'a pas été exécutée.
    for (const jeton of [undefined, jetonCoach]) {
      const rep = await appelerRpc(request, 'finaliser_inscription_coach', corps, jeton)
      await attendrePermissionRefusee(rep, 'finaliser_inscription_coach')
    }
  })

  test('CT-05b — finalisation d’inscription admin refusée hors serveur (spec #2 R36–R38)', async ({
    request,
  }) => {
    const corps = {
      p_valeur: '00000000-0000-0000-0000-000000000000',
      p_utilisateur_id: '00000000-0000-0000-0000-000000000000',
    }
    // Même un admin connecté ne l'exécute pas : seul le serveur (service_role)
    // consomme une invitation administrateur.
    for (const jeton of [undefined, jetonCoach, jetonAdmin]) {
      const rep = await appelerRpc(request, 'finaliser_inscription_admin', corps, jeton)
      await attendrePermissionRefusee(rep, 'finaliser_inscription_admin')
    }
  })

  test('CT-06 — une fonction future naît fermée (privilèges par défaut)', () => {
    // La fonction est créée par `postgres` (comme une migration) puis annulée :
    // l'exception finale fait reculer le bloc DO, aucune trace en base.
    let sortie = ''
    try {
      execSql(
        `do $$ begin
           create function interclub.zz_test_defaut() returns int language sql as 'select 1';
           raise exception 'verdict anon=% authentifie=%',
             has_function_privilege('anon', 'interclub.zz_test_defaut()', 'execute'),
             has_function_privilege('authenticated', 'interclub.zz_test_defaut()', 'execute');
         end $$;`,
      )
    } catch (e) {
      sortie = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(sortie).toContain('verdict anon=f authentifie=f')
    expect(
      execSql(`select count(*) from pg_proc where proname = 'zz_test_defaut';`),
    ).toBe('0')
  })

  test.describe('CT-07 — coche de contrôle et auteur non falsifiables par un coach (M2)', () => {
    let voie: string
    let grimpeur: string

    const purger = () =>
      execSql(
        `delete from interclub.resultat_voie
          where voie_difficulte_id = '${voie}' and grimpeur_id = '${grimpeur}';`,
      )

    test.beforeAll(() => {
      // Une voie de la rencontre ado (③) et un grimpeur Club A engagé dessus.
      ;[voie, grimpeur] = execSql(
        `select vd.id || '|' || c.grimpeur_id
           from interclub.composition c
           join interclub.equipe e on e.id = c.equipe_id
           join interclub.epreuve ep on ep.rencontre_id = c.rencontre_id and ep.type = 'voie'
           join interclub.voie_difficulte vd on vd.epreuve_id = ep.id
          where c.rencontre_id = '${RENCONTRE_ADO}' and e.club_id = '${CLUB_A}'
          order by vd.ordre, c.grimpeur_id limit 1;`,
      ).split('|')
      execSql(`update interclub.rencontre set phase = 'competition' where id = '${RENCONTRE_ADO}';`)
      purger()
    })

    test.afterAll(() => purger())

    test('insertion puis mise à jour forgées → coche nulle, auteur = coach (spec #16 R11/R13, spec #9 R14)', async ({
      request,
    }) => {
      const forge = {
        controle_le: '2026-10-03T10:00:00Z',
        controle_par: ADMIN_ID,
        auteur_utilisateur_id: ADMIN_ID,
        auteur_role: 'admin',
      }
      const attendu = {
        controle_le: null,
        controle_par: null,
        auteur_utilisateur_id: COACH_ID,
        auteur_role: 'coach',
      }
      const { url } = infosApi()

      const insertion = await request.post(`${url}/rest/v1/resultat_voie`, {
        headers: { ...entetes(jetonCoach, true), Prefer: 'return=representation' },
        data: { voie_difficulte_id: voie, grimpeur_id: grimpeur, issue: 'echec', ...forge },
      })
      expect(insertion.status()).toBe(201)
      const [ligne] = await insertion.json()
      expect(ligne).toMatchObject(attendu)

      const maj = await request.patch(`${url}/rest/v1/resultat_voie?id=eq.${ligne.id}`, {
        headers: { ...entetes(jetonCoach, true), Prefer: 'return=representation' },
        data: forge,
      })
      expect(maj.status()).toBe(200)
      expect((await maj.json())[0]).toMatchObject(attendu)
    })

    test('coche admin conservée quand le coach corrige ensuite (spec #16 R14)', async ({
      request,
    }) => {
      const { url } = infosApi()
      const filtre = `voie_difficulte_id=eq.${voie}&grimpeur_id=eq.${grimpeur}`

      const coche = await request.patch(`${url}/rest/v1/resultat_voie?${filtre}`, {
        headers: { ...entetes(jetonAdmin, true), Prefer: 'return=representation' },
        data: { controle_le: new Date().toISOString(), controle_par: ADMIN_ID },
      })
      expect(coche.status()).toBe(200)
      expect((await coche.json())[0].controle_par).toBe(ADMIN_ID)

      // Correction du coach qui tente au passage d'effacer la coche.
      const correction = await request.patch(`${url}/rest/v1/resultat_voie?${filtre}`, {
        headers: { ...entetes(jetonCoach, true), Prefer: 'return=representation' },
        data: { issue: 'top', controle_le: null, controle_par: null },
      })
      expect(correction.status()).toBe(200)
      expect((await correction.json())[0]).toMatchObject({
        issue: 'top',
        controle_par: ADMIN_ID,
        auteur_utilisateur_id: COACH_ID,
        auteur_role: 'coach',
      })
    })
  })

  test.describe('CT-09 — auteur d’un temps de vitesse non falsifiable par le juge (M2, spec #10)', () => {
    let grimpeur: string

    test.beforeAll(() => {
      nettoyerSessionsQr()
      poserPhase('competition')
      poserDate('today')
      grimpeur = execSql(
        `select c.grimpeur_id from interclub.composition c
          where c.rencontre_id = (select rencontre_id from interclub.epreuve
                                   where id = '${EPREUVE_VITESSE}')
          order by c.grimpeur_id limit 1;`,
      )
      execSql(
        `delete from interclub.temps_vitesse
          where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${grimpeur}';`,
      )
    })

    test.afterAll(() => {
      execSql(
        `delete from interclub.temps_vitesse
          where epreuve_id = '${EPREUVE_VITESSE}' and grimpeur_id = '${grimpeur}';`,
      )
      nettoyerSessionsQr()
      poserPhase('pre_competition')
      poserDate(RENCONTRE_PILOTE_DATE)
    })

    test('le juge forge auteur admin → auteur = juge', async ({ request }) => {
      const { url, anon } = infosApi()

      // Session juge : utilisateur anonyme + scan du jeton juge du seed.
      const inscription = await request.post(`${url}/auth/v1/signup`, {
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        data: {},
      })
      expect(inscription.ok()).toBe(true)
      const { access_token: jetonJuge, user } = await inscription.json()
      const session = await appelerRpc(
        request,
        'ouvrir_session_qr',
        { p_valeur: JETON.juge },
        jetonJuge,
      )
      expect(session.ok()).toBe(true)

      const rep = await request.post(`${url}/rest/v1/temps_vitesse`, {
        headers: { ...entetes(jetonJuge, true), Prefer: 'return=representation' },
        data: {
          epreuve_id: EPREUVE_VITESSE,
          grimpeur_id: grimpeur,
          issue: 'temps',
          temps: 9.5,
          auteur_utilisateur_id: ADMIN_ID,
          auteur_role: 'admin',
        },
      })
      expect(rep.status()).toBe(201)
      expect((await rep.json())[0]).toMatchObject({
        auteur_utilisateur_id: user.id,
        auteur_role: 'juge',
      })
    })
  })

  test('CT-10 — lecture réservée aux acteurs identifiés (spec #1 R8, rév. 2026-10-03, D-D)', async ({
    request,
  }) => {
    const { url, anon } = infosApi()
    const inscription = await request.post(`${url}/auth/v1/signup`, {
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      data: {},
    })
    expect(inscription.ok()).toBe(true)
    const jetonAnonyme = (await inscription.json()).access_token as string
    const jetonSansRole = await jetonDe(
      request,
      COMPTES.sansMapping.email,
      COMPTES.sansMapping.mdp,
    )

    const nbLignes = async (jeton: string, table: string) => {
      const rep = await request.get(`${url}/rest/v1/${table}?select=id`, {
        headers: entetes(jeton),
      })
      expect(rep.ok()).toBe(true)
      return ((await rep.json()) as unknown[]).length
    }

    for (const table of ['club', 'rencontre', 'gabarit_epreuve']) {
      expect(await nbLignes(jetonAnonyme, table)).toBe(0)
      expect(await nbLignes(jetonSansRole, table)).toBe(0)
      expect(await nbLignes(jetonCoach, table)).toBeGreaterThan(0)
    }
  })

  test.describe('Cahier 04 CT-11 — révocation définitive pour le coach (D-E, spec #2 R20–R23)', () => {
    const JETON_COACH_A = '55555555-5555-5555-5555-555555555551'
    const actif = () =>
      execSql(`select actif from interclub.jeton_qr where id = '${JETON_COACH_A}';`)

    test.afterAll(() => {
      execSql(`update interclub.jeton_qr set actif = true where id = '${JETON_COACH_A}';`)
    })

    test('le coach révoque, ne réactive pas, ne change pas la rencontre ; l’admin réactive', async ({
      request,
    }) => {
      const { url } = infosApi()
      const patch = (jeton: string, data: object) =>
        request.patch(`${url}/rest/v1/jeton_qr?id=eq.${JETON_COACH_A}`, {
          headers: { ...entetes(jeton, true), Prefer: 'return=minimal' },
          data,
        })

      expect((await patch(jetonCoach, { actif: false })).status()).toBe(204)
      expect(actif()).toBe('f')

      const reactivation = await patch(jetonCoach, { actif: true })
      expect(reactivation.status()).toBe(403)
      expect((await reactivation.json()).message).toBe('reactivation_jeton_interdite')
      expect(actif()).toBe('f')

      const autreRencontre = await patch(jetonCoach, { rencontre_id: RENCONTRE_ADO })
      expect([401, 403]).toContain(autreRencontre.status())
      expect((await autreRencontre.json()).code).toBe('42501')

      expect((await patch(jetonAdmin, { actif: true })).status()).toBe(204)
      expect(actif()).toBe('t')
    })
  })
})
