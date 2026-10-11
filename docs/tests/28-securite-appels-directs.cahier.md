# Cahier de test : Sécurité en base — appels PostgREST directs (revue 2026-10-03, lot 1)

> Vérifie que la base refuse ce que l'interface n'expose pas : appels **directs**
> à l'API PostgREST avec la clé `anon` publique (présente dans le bundle JS) ou
> le jeton d'un compte non habilité. Couvre la migration
> `202610031100_durcissement_securite` : fonctions fermées par défaut, garde
> admin de `creer_rencontre_avec_gabarit` (C1), `finaliser_inscription_coach`
> réservée à `service_role` (M1), colonnes de contrôle et d'auteur protégées
> (M2). Constats et plan : [revue](../revues/2026-10-03-revue-globale.md),
> [plan d'action](../revues/2026-10-03-plan-action.md).
> **Automatisé** : `npm run test:cahier:securite` (`e2e/securite-appels-directs.spec.ts`, stack locale) rejoue CT-01 → CT-07, CT-09 et CT-10 ; CT-08 = suites E2E existantes. En recette, les appels `curl` ci-dessous restent le mode d'exécution.
> Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md` (R12),
  `docs/specs/02-authentification-et-sessions-qr.md` (R30–R33),
  `docs/specs/16-controle-resultats-fiches-juges.md` (R11, R13, R14),
  `docs/specs/09-saisie-admin-resultats.md` (R14),
  `docs/specs/10-saisie-vitesse-juge.md` (auteur juge/admin) ;
  convention `03-base-de-donnees-supabase.md` §3 (la sécurité vit dans la base).
- **Pré-requis** :
  - Migrations appliquées **jusqu'à `202610031100_durcissement_securite`
    incluse**. En local : `npm run db:reset` (rejoue + `db:verifier`).
  - Seed `01-jeu-de-test.sql` chargé.
  - Un terminal avec `curl` et les variables :

    ```bash
    URL=<API_URL du projet>        # local : http://127.0.0.1:54321
    ANON=<clé anon publique>       # local : npx supabase status
    jeton() {                      # jeton d'accès d'un compte permanent
      curl -s "$URL/auth/v1/token?grant_type=password" \
        -H "apikey: $ANON" -H "Content-Type: application/json" \
        -d "{\"email\":\"$1\",\"password\":\"interclub\"}" \
        | sed -E 's/.*"access_token":"([^"]+)".*/\1/'
    }
    COACH=$(jeton coach@test.local)
    ```

- **Environnement** : local (stack Docker) puis recette — version/commit :
  `______`

## Jeu de données initial

Réutilise le seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-CLUB-A** (`11111111-…`), **JD-RENCONTRE-ADO** (`adadadad-…`, phase
  `competition`), **JD-STRUCTURE-ADO**, **JD-EQUIPE-ADO** (Nora, Owen).

Aucune donnée durable n'est créée : le CT d'écriture (CT-07) porte sur une
ligne de résultat créée puis supprimée dans le cas.

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| aucun (clé `anon` seule) | non authentifié | Appels directs refusés (CT-02, CT-05) |
| JD-COACH-A (`coach@test.local`) | coach permanent Club A | Appels directs refusés, falsification neutralisée (CT-03, CT-05, CT-07) |
| JD-ADMIN (`admin@test.local`) | admin | Non-régression (CT-04, CT-08) |

## Cas de test

### CT-01 `[auto]` — Aucune fonction ouverte à PUBLIC ; anon limité aux RPC QR   (couvre : C1, M1, fermeture par défaut)

- **Rôle / compte** : SQL Editor (recette) ou `npm run db:verifier` (local).
- **Pré-condition** : migration `202610031100` appliquée.
- **Étapes** :
  1. En local : `npm run db:verifier`.
  2. En recette (SQL Editor) :

     ```sql
     select p.proname,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            p.proacl is null
              or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as public
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'interclub'
       and (has_function_privilege('anon', p.oid, 'execute')
            or p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
     order by 1;
     ```

- **Résultat attendu** :
  1. Les deux contrôles affichent ✓ ; code de sortie 0.
  2. Exactement 4 lignes, toutes `anon = true` et `public = false` :
     `contexte_coach_temporaire`, `contexte_juge`, `liste_grimpeurs_vitesse`,
     `ouvrir_session_qr`.
- **RLS / sécurité** : toute autre fonction listée est une régression.

### CT-02 `[auto]` — Création de rencontre refusée sans compte   (couvre : C1, spec #3 R12)

- **Rôle / compte** : clé `anon` seule.
- **Étapes** :
  1. Appeler la RPC :

     ```bash
     curl -s -X POST "$URL/rest/v1/rpc/creer_rencontre_avec_gabarit" \
       -H "apikey: $ANON" -H "Content-Profile: interclub" \
       -H "Content-Type: application/json" \
       -d '{"p_date":"2026-12-01","p_club_porteur":"11111111-1111-1111-1111-111111111111","p_categorie":"ado"}'
     ```

  2. Vérifier la liste des rencontres admin.
- **Résultat attendu** : erreur `42501` (« permission denied for function
  creer_rencontre_avec_gabarit ») ; aucune rencontre du 01/12/2026 créée.

### CT-03 `[auto]` — Création de rencontre refusée à un coach   (couvre : C1, spec #3 R12)

- **Rôle / compte** : JD-COACH-A (jeton `$COACH`).
- **Étapes** :
  1. Même appel qu'au CT-02, avec en plus `-H "Authorization: Bearer $COACH"`.
- **Résultat attendu** : erreur `42501` avec le message `acces_refuse` ;
  aucune rencontre créée.

### CT-04 `[auto]` — Création de rencontre par l'admin (non-régression)   (couvre : C1, spec #3 R12/R30)

- **Rôle / compte** : JD-ADMIN.
- **Étapes** :
  1. Dans l'app, `/admin/rencontres` : créer une rencontre **ado** au
     01/12/2026 pour le Club A.
  2. Ouvrir sa configuration, puis la supprimer.
- **Résultat attendu** : rencontre créée avec sa structure copiée du gabarit
  (voies, blocs, vitesse, barème) ; suppression OK.

### CT-05 `[auto]` — Finalisation d'inscription coach refusée hors serveur   (couvre : M1, spec #2 R30–R33)

- **Rôle / compte** : clé `anon` seule, puis JD-COACH-A.
- **Étapes** :
  1. Appeler la RPC sans compte :

     ```bash
     curl -s -X POST "$URL/rest/v1/rpc/finaliser_inscription_coach" \
       -H "apikey: $ANON" -H "Content-Profile: interclub" \
       -H "Content-Type: application/json" \
       -d '{"p_valeur":"00000000-0000-0000-0000-000000000000","p_utilisateur_id":"00000000-0000-0000-0000-000000000000"}'
     ```

  2. Même appel avec `-H "Authorization: Bearer $COACH"`.
- **Résultat attendu** : les deux appels renvoient `42501` (« permission denied
  for function finaliser_inscription_coach »), et **non**
  `invitation_inconnue`, qui prouverait que la fonction a été exécutée.
- **Non-régression** : dérouler le parcours nominal du cahier
  [16-invitation-coach](16-invitation-coach.cahier.md) (inscription par
  QR/URL) : il passe par `service_role` et doit toujours aboutir.

### CT-05b `[auto]` — Finalisation d'inscription admin refusée hors serveur   (couvre : spec #2 R36–R38, rév. 2026-10-09)

- **Rôle / compte** : clé `anon` seule, puis JD-COACH-A, puis JD-ADMIN.
- **Étapes** : appeler `POST /rest/v1/rpc/finaliser_inscription_admin` avec
  `{"p_valeur":"00000000-0000-0000-0000-000000000000","p_utilisateur_id":"00000000-0000-0000-0000-000000000000"}`.
- **Résultat attendu** : **refus de privilège** (`42501`) dans les trois cas,
  même pour l'admin. Détail : cahier 30 CT-09.
- **Automatisé** : `e2e/securite-appels-directs.spec.ts` (CT-05b).

### CT-06 `[auto]` — Fonction future fermée par défaut   (couvre : fermeture par défaut)

- **Rôle / compte** : SQL Editor.
- **Étapes** :
  1. Exécuter :

     ```sql
     begin;
     create function interclub.zz_test_defaut() returns int language sql as 'select 1';
     select has_function_privilege('anon', 'interclub.zz_test_defaut()', 'execute') as anon,
            has_function_privilege('authenticated', 'interclub.zz_test_defaut()', 'execute') as authentifie;
     rollback;
     ```

- **Résultat attendu** : `anon = false` et `authentifie = false`.

### CT-07 `[auto]` — Coche de contrôle et auteur non falsifiables par un coach   (couvre : M2, spec #16 R11/R13, spec #9 R14)

- **Rôle / compte** : JD-COACH-A (jeton `$COACH`).
- **Pré-condition** : JD-RENCONTRE-ADO en `competition` (③) ; noter l'`id`
  d'une voie de JD-STRUCTURE-ADO (`VOIE`) et celui de Nora (`NORA`).
- **Étapes** :
  1. Insertion forgée :

     ```bash
     curl -s -X POST "$URL/rest/v1/resultat_voie" \
       -H "apikey: $ANON" -H "Authorization: Bearer $COACH" \
       -H "Content-Profile: interclub" -H "Content-Type: application/json" \
       -H "Prefer: return=representation" \
       -d "{\"voie_difficulte_id\":\"$VOIE\",\"grimpeur_id\":\"$NORA\",\"issue\":\"echec\",
            \"controle_le\":\"2026-10-03T10:00:00Z\",
            \"controle_par\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",
            \"auteur_utilisateur_id\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",
            \"auteur_role\":\"admin\"}"
     ```

  2. Mise à jour forgée de la même ligne (`PATCH …/resultat_voie?id=eq.<id>`)
     avec les mêmes quatre colonnes.
  3. Supprimer la ligne (SQL Editor) pour rendre le cas rejouable.
- **Résultat attendu** : aux étapes 1 et 2, la ligne renvoyée a
  `controle_le = null`, `controle_par = null`,
  `auteur_utilisateur_id = cccccccc-…-cccccccccccc` et `auteur_role = coach`.
- **RLS / sécurité** : la ligne n'apparaît pas « contrôlée » sur l'écran de
  contrôle admin (spec #16).

### CT-08 `[auto]` — Coche admin et auteurs réels (non-régression)   (couvre : M2, spec #16 R11/R14, spec #9 R14, spec #10)

- **Rôle / compte** : JD-ADMIN, JD-COACH-A, un juge (session QR).
- **Étapes** :
  1. En local, dérouler les E2E `npm run test:cahier:resultats`,
     `npm run test:cahier:saisie-admin`, `npm run test:cahier:juge` et
     `npx playwright test admin-controle --project=chromium --workers=1`.
  2. En recette, à la main : un coach saisit une voie en ③ ; l'admin la coche
     en ④ ; repasser en ③, le coach corrige l'issue ; revenir en ④.
- **Résultat attendu** :
  1. Les quatre suites sont vertes.
  2. La coche est **conservée** après la correction du coach (R14), avec son
     auteur admin ; l'auteur de saisie devient le coach (`auteur_role = coach`).

### CT-09 `[auto]` — Auteur d'un temps de vitesse non falsifiable par le juge   (couvre : M2, spec #10)

- **Rôle / compte** : juge (session QR anonyme, jeton juge du seed).
- **Pré-condition** : JD-RENCONTRE-ENFANT en `competition` (③), datée du jour.
- **Étapes** :
  1. Ouvrir une session anonyme (`POST $URL/auth/v1/signup` avec `{}`), puis
     `rpc/ouvrir_session_qr` avec la valeur du jeton juge.
  2. Avec ce jeton, `POST …/temps_vitesse` (épreuve vitesse `…8803`, un
     grimpeur engagé, `issue = temps`, `temps = 9.5`) en forgeant
     `auteur_utilisateur_id = aaaaaaaa-…` et `auteur_role = admin`.
  3. Supprimer la ligne (SQL Editor) pour rendre le cas rejouable.
- **Résultat attendu** : la ligne renvoyée a `auteur_utilisateur_id` = l'id de
  l'utilisateur anonyme du juge et `auteur_role = juge`.

### CT-10 `[auto]` — Lecture réservée aux acteurs identifiés   (couvre : spec #1 Vocabulaire « acteur identifié » et R8, rév. 2026-10-03 ; décision D-D)

- **Rôle / compte** : session **anonyme** ouverte sans QR (`POST
  $URL/auth/v1/signup` avec `{}`), `sansmapping@test.local` (compte sans rôle),
  puis `coach@test.local`.
- **Pré-condition** : migration `202610031400_lecture_acteur_identifie`
  appliquée.
- **Étapes** : avec chaque jeton, `GET …/club`, `GET …/rencontre` et
  `GET …/gabarit_epreuve` (en-tête `Accept-Profile: interclub`).
- **Résultat attendu** : session anonyme sans QR et compte sans rôle → **listes
  vides** pour les trois tables ; coach → listes **non vides**.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | |
| | | | CT-02 | ✅ / ❌ | |
| | | | CT-03 | ✅ / ❌ | |
| | | | CT-04 | ✅ / ❌ | |
| | | | CT-05 | ✅ / ❌ | |
| | | | CT-06 | ✅ / ❌ | |
| | | | CT-07 | ✅ / ❌ | |
| | | | CT-08 | ✅ / ❌ | |
| | | | CT-09 | ✅ / ❌ | |
| | | | CT-10 | ✅ / ❌ | |
