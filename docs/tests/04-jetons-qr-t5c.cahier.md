# Cahier de test : Jetons QR — génération / affichage / révocation (T5c)

> Couvre la tranche **T5c** : écrans `/admin/jetons` (admin, tout périmètre) et
> `/coach/jetons` (coach permanent, jeton « coach temporaire » de son club).
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R14–R23) ; `docs/specs/01-roles-et-autorisations.md` (R14, R26, R29).
- **Décision d'architecture** :
  [ADR 0003](../decisions/0003-affichage-qr-et-lecture-catalogues.md) — vrai QR
  côté serveur ; catalogues lus via `service_role`, jetons/écritures via RLS.
- **Pré-requis** :
  - Stack Supabase **locale** démarrée, migrations jouées (`supabase db reset`,
    dont **`202607230900`**), **seeds 01 + 02** chargés.
  - `.env.local` local avec **`SUPABASE_SERVICE_ROLE_KEY`** renseigné.
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Seeds `01-utilisateurs-de-test.sql` + `02-jetons-de-test.sql` (via `db reset`) :

- Clubs : **Club A**, **Club B**.
- Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
  (coach Club A), `sansmapping@test.local` (aucun rôle).
- **Rencontre** du 2026-09-19 (enfant), portée par Club A, **phase préparation**
  (teste R14 : jeton générable hors phase ②).
- **2 voies** de vitesse (1 et 2). **Club A** et **Club B** engagés (équipes).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Génère/révoque tout jeton, affecte les juges |
| `coach@test.local` | coach (Club A) | Gère le jeton coach temp. de Club A uniquement |
| `sansmapping@test.local` | (aucun) | Négatif : aucun accès (R5) |

## Automatisation partielle

Les cas exigeant un **contournement de l'écran** (appel API direct) sont
automatisés par `scripts/test-t5c.sh` :

```bash
npm run test:t5c        # (ou : bash scripts/test-t5c.sh)
```

Couvre **CT-06** (coach → autre club, R16), **CT-07** (coach → jeton juge, R17),
**CT-09** (sans rôle, R5) et **CT-08** (unicité R19). Les cas UI (CT-01..05, CT-10)
restent à dérouler à la main.

## Cas de test

### CT-01 — Admin génère un jeton coach temporaire   (couvre : R15 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. `/admin/jetons` → choisir la rencontre → section « Coach temporaire ».
  2. Sur Club A, cliquer « Générer le jeton ».
- **Résultat attendu** : un **QR** s'affiche pour Club A, avec sa valeur et les
  actions Régénérer / Révoquer.

### CT-02 — Admin affecte un juge (jeton juge d'une voie)   (couvre : R17 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Section « Juge » → sur Voie 1, « Générer le jeton ».
- **Résultat attendu** : un **QR** juge s'affiche pour Voie 1 (= affectation du
  juge à cette voie). Idem possible sur Voie 2 (un juge par voie, R18).

### CT-03 — Révocation   (couvre : R22)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Sur un jeton affiché, cliquer « Révoquer ».
- **Résultat attendu** : le QR disparaît, le périmètre repropose « Générer le
  jeton ». (Coupure d'accès effective vérifiée en T5d.)

### CT-04 — Régénération   (couvre : R23)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Sur un jeton affiché, cliquer « Régénérer ».
- **Résultat attendu** : un **nouveau** QR s'affiche, de **valeur distincte** ;
  l'ancienne valeur n'est plus active.

### CT-05 — Coach gère le jeton de SON club   (couvre : R16, R21 ; nominal)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** :
  1. Depuis l'accueil, « Mes jetons QR » → `/coach/jetons`.
  2. Générer, puis régénérer, puis révoquer le jeton coach temporaire de Club A.
- **Résultat attendu** : les trois actions réussissent, **uniquement** pour Club A.
  Aucune section « Juge » ni autre club n'est présentée.

### CT-06 — Coach ne gère pas un autre club   (couvre : R16 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** (contournement) : POST `jeton_qr` `coach_temporaire` avec le club B.
- **Résultat attendu** : **refusé** (HTTP 403). Automatisé : `npm run test:t5c`.

### CT-07 — Coach ne peut pas générer un jeton juge   (couvre : R17 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** (contournement) : POST `jeton_qr` `juge` sur une voie.
- **Résultat attendu** : **refusé** (HTTP 403). Automatisé : `npm run test:t5c`.

### CT-08 — Un seul jeton actif par périmètre   (couvre : R18, R19 ; négatif)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** (contournement) : créer deux jetons `coach_temporaire` actifs pour le
  même (club, rencontre).
- **Résultat attendu** : le second est **refusé** (HTTP 409, index unique).
  Automatisé : `npm run test:t5c`.

### CT-09 — Compte sans rôle : aucun jeton   (couvre : R5 ; négatif)

- **Rôle / compte** : `sansmapping@test.local`.
- **Étapes** : accéder à `/admin/jetons` et `/coach/jetons` ; contournement POST.
- **Résultat attendu** : écrans **404** ; écriture API **refusée** (403).
  Automatisé (POST) : `npm run test:t5c`.

### CT-10 — Génération hors phase ②   (couvre : R14)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : la rencontre de test est en **préparation** (pas phase ②).
- **Étapes** : générer un jeton (coach temp. ou juge).
- **Résultat attendu** : la génération **réussit** — un jeton est générable avant
  la phase ② (son ouverture de session, elle, sera bornée à la phase ② en T5d).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | IHM |
| | | | CT-02 | ✅ / ❌ | IHM |
| | | | CT-03 | ✅ / ❌ | IHM |
| | | | CT-04 | ✅ / ❌ | IHM |
| | | | CT-05 | ✅ / ❌ | IHM |
| | | | CT-06 | ✅ / ❌ | `test:t5c` |
| | | | CT-07 | ✅ / ❌ | `test:t5c` |
| | | | CT-08 | ✅ / ❌ | `test:t5c` |
| | | | CT-09 | ✅ / ❌ | IHM + `test:t5c` |
| | | | CT-10 | ✅ / ❌ | IHM |
