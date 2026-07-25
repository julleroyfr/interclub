# Cahier de test : Sessions QR éphémères — scan & ouverture de session (T5d)

> Couvre la tranche **T5d** : scan d'un jeton QR → `signInAnonymously()` → RPC
> `ouvrir_session_qr` → session éphémère ouverte (ou erreur). Page `/scan`.
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** :
  `docs/specs/02-authentification-et-sessions-qr.md` (R6–R14, R22–R25) ;
  [ADR 0001](../decisions/0001-authentification-sessions-ephemeres-qr.md)
  (connexions anonymes + table `session_qr` + RPC `ouvrir_session_qr`).
- **Pré-requis** :
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true` (déjà versionnée).
  - Migration **`202607231000`** appliquée — lancer `supabase db reset` en local
    (applique migrations + seeds 01, 02, 03 dans l'ordre).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Seeds `01`, `02`, `03` appliqués via `supabase db reset` :

- Clubs : **Club A**, **Club B**.
- Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
  (coach Club A).
- Rencontre du 2026-09-19 (enfant), portée par Club A, 2 voies de vitesse,
  **phase `competition`** (seed 03).
- Jetons QR à UUIDs fixes (seed 03) :

| Nature | Club / Voie | Valeur (secret QR) | URL de scan locale |
|--------|-------------|--------------------|--------------------|
| `coach_temporaire` | Club A | `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa` | `http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa` |
| `juge` | Voie 1 | `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb` | `http://localhost:3000/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb` |

> CT-03 (hors phase) : passer la rencontre en `pre_competition` via SQL Editor ou
> `update interclub.rencontre set phase = 'pre_competition' where id = '33333333-3333-3333-3333-333333333333';`
> puis la repasser en `competition` avant CT-04.

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Génère jetons, modifie la phase |
| `coach@test.local` | coach (Club A) | Témoin de la session coach temp. |
| *(anonyme via scan)* | coach temp. / juge | Acteur principal de ce cahier |

## Cas de test

### CT-01 — Scan jeton coach temporaire en phase ②   (couvre : R6, R7, R8, R10, R12 ; nominal)

- **Rôle / compte** : navigateur anonyme (pas de compte).
- **Pré-condition** : rencontre en phase `competition` (seed 03) ; jeton coach
  temp. Club A actif (seed 03 : `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`).
- **Étapes** :
  1. Accéder à
     `http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
  2. Ouvrir l'URL dans un navigateur sans session.
- **Résultat attendu** :
  - La page `/scan` affiche « Connexion en cours… » puis « Session ouverte —
    redirection… ».
  - L'app redirige vers `/coach`.
  - Dans `auth.users` : un nouvel utilisateur **anonyme** est créé.
  - Dans `interclub.session_qr` : une ligne lie cet utilisateur au jeton.
- **RLS / sécurité** : un utilisateur sans jeton ne peut pas insérer directement
  dans `session_qr` (aucune policy `insert`).

### CT-02 — Scan jeton juge en phase ②   (couvre : R6, R9b, R11 ; nominal)

- **Rôle / compte** : navigateur anonyme.
- **Pré-condition** : rencontre en phase `competition` (seed 03) ; jeton juge
  Voie 1 actif (seed 03 : `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`).
- **Étapes** :
  1. Accéder à
     `http://localhost:3000/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`.
- **Résultat attendu** :
  - Redirection vers `/juge` (et non `/coach`).
  - Ligne `session_qr` créée avec `jeton_qr_id` pointant sur le jeton juge.

### CT-03 — Scan hors phase ②   (couvre : R12 ; cas limite)

- **Rôle / compte** : navigateur anonyme.
- **Pré-condition** : remettre la rencontre en phase `pre_competition` (SQL :
  `update interclub.rencontre set phase = 'pre_competition'`).
- **Étapes** :
  1. Accéder à `/scan?jeton=<uuid-d-un-jeton-actif>`.
- **Résultat attendu** :
  - La page `/scan` affiche : « La rencontre n'est pas encore en cours (ou est
    terminée). »
  - Aucune ligne créée dans `session_qr`.
  - Aucun utilisateur anonyme supplémentaire dans `auth.users` (ou utilisateur
    anonyme créé mais sans session_qr liée — la RPC a refusé).

### CT-04 — Scan d'un jeton révoqué   (couvre : R22 ; cas limite)

- **Rôle / compte** : navigateur anonyme.
- **Pré-condition** : rencontre en phase `competition` ; révoquer le jeton coach
  temp. (`aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`) depuis `/admin/jetons`.
- **Étapes** :
  1. Accéder à
     `http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
- **Résultat attendu** :
  - La page `/scan` affiche : « Ce QR a été révoqué. Demandez un nouveau QR à
    votre responsable. »
  - Aucune ligne créée dans `session_qr`.

### CT-05 — Coupure immédiate après révocation   (couvre : R22, R13 ; coupure immédiate)

> **Objectif** : vérifier que la révocation coupe l'accès **à la prochaine
> requête** sans déconnexion explicite (recalcul RLS sur `jeton_qr.actif`).

- **Pré-condition** : rencontre en phase `competition` ; deux navigateurs (A et B)
  ont scanné le même jeton coach temp. et ont une session ouverte (CT-01 × 2
  appareils ou 2 onglets).
- **Étapes** :
  1. Dans navigateur A, effectuer une action qui déclenche une requête (ex.
     rafraîchir `/coach`).  Confirmer que la page est accessible.
  2. Dans `/admin/jetons`, **révoquer** le jeton.
  3. Dans navigateur A, rafraîchir `/coach` ou déclencher une nouvelle requête.
  4. Idem dans navigateur B.
- **Résultat attendu** :
  - Après l'étape 3 : la page `/coach` (et toute requête filtrée par la session)
    renvoie une erreur d'accès ou une page vide/403 — **sans que l'utilisateur ait
    eu à se reconnecter**.
  - Même comportement dans navigateur B.
  - Dans `session_qr` : les lignes existent toujours (elles ne sont pas supprimées)
    mais `jeton_qr.actif = false` coupe la policy RLS.
- **Note** : ce cas ne peut être vérifié qu'une fois les pages métier (T8) ou les
  policies RLS (T6) en place — prévu ici pour mémoire, à compléter lors de T6/T8.

### CT-06 — Multi-usage : deux sessions simultanées   (couvre : R8 ; nominal)

- **Pré-condition** : rencontre en phase `competition` ; jeton coach temp. actif
  (`aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`).
- **Étapes** :
  1. Ouvrir `http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`
     dans un navigateur A → session ouverte.
  2. Ouvrir la même URL dans un navigateur B (ou onglet privé) → session ouverte.
- **Résultat attendu** :
  - **Deux** lignes distinctes dans `session_qr` (deux `utilisateur_id` différents,
    même `jeton_qr_id`).
  - Les deux navigateurs atterrissent sur `/coach`.

### CT-07 — Régénération : ancien QR coupé, nouveau fonctionne   (couvre : R23, R22 ; cas limite)

- **Pré-condition** : rencontre en phase `competition` ; jeton coach temp. actif
  (valeur seed : `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`).
- **Étapes** :
  1. Noter l'UUID de l'ancien jeton : `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
  2. Dans `/admin/jetons`, **régénérer** le jeton coach temp. → un nouveau QR
     s'affiche avec un UUID différent. Copier ce nouvel UUID.
  3. Accéder à
     `http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
  4. Accéder à `http://localhost:3000/scan?jeton=<nouvel-uuid>`.
- **Résultat attendu** :
  - Étape 3 : erreur « Ce QR a été révoqué. »
  - Étape 4 : session ouverte, redirect `/coach`.

### CT-08 — URL sans paramètre `jeton`   (couvre : cas d'erreur)

- **Étapes** :
  1. Accéder à `/scan` (sans `?jeton=`).
- **Résultat attendu** :
  - Page affiche : « QR invalide — paramètre manquant. »

### CT-09 — Valeur `jeton` inconnue (UUID inexistant)   (couvre : ADR 0001 §1 ; négatif)

- **Étapes** :
  1. Accéder à `/scan?jeton=00000000-0000-0000-0000-000000000000`.
- **Résultat attendu** :
  - Page affiche : « Ce QR n'est pas reconnu. »
  - Aucune ligne créée dans `session_qr`.

### CT-10 — Insert direct dans `session_qr` refusé   (couvre : ADR 0001 §2 ; RLS négative)

- **Rôle / compte** : utilisateur anonyme (après `signInAnonymously()`).
- **Étapes** (contournement API) :

  ```bash
  # Depuis un client avec la clé anon et un Bearer token anonyme :
  curl -X POST "$SUPABASE_URL/rest/v1/session_qr" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer <token-anonyme>" \
    -H "Content-Type: application/json" \
    -d '{"utilisateur_id":"<uid>","jeton_qr_id":"<uuid-jeton>"}'
  ```

- **Résultat attendu** : **HTTP 403** — aucune policy `insert` sur `session_qr`.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | IHM |
| | | | CT-02 | ✅ / ❌ | IHM |
| | | | CT-03 | ✅ / ❌ | IHM |
| | | | CT-04 | ✅ / ❌ | IHM |
| | | | CT-05 | ✅ / ❌ | À compléter en T6/T8 |
| | | | CT-06 | ✅ / ❌ | IHM |
| | | | CT-07 | ✅ / ❌ | IHM |
| | | | CT-08 | ✅ / ❌ | IHM |
| | | | CT-09 | ✅ / ❌ | IHM |
| | | | CT-10 | ✅ / ❌ | contournement API |
