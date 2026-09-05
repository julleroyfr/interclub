# Cahier de test : Invitation coach permanent — onboarding (spec #2 R26–R33)

> Couvre l'**onboarding par invitation** : affichage d'une invitation par club
> (`/admin/clubs`), écran d'inscription public (`/inscription?invitation=…`),
> création automatique du compte coach rattaché au club.
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R26–R33) ; `docs/specs/01-roles-et-autorisations.md` (R23–R25).
- **Migration** : `202609051000_invitation_coach` (table `invitation_coach`,
  RLS admin, RPC `finaliser_inscription_coach`).
- **Pré-requis** :
  - Stack Supabase **locale** démarrée, migrations jouées (`supabase db reset`,
    dont **`202609051000`**), **le seed `01-jeu-de-test.sql`** chargé.
  - `.env.local` local avec **`SUPABASE_SERVICE_ROLE_KEY`** renseigné.
  - Provider **Email** activé (Authentication → Providers) ; confirmation d'e-mail
    non requise (le compte est créé `email_confirm`).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Seed `01-jeu-de-test.sql` :

- Clubs : **Club A**, **Club B**.
- Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
  (coach Club A), `sansmapping@test.local` (aucun rôle).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Génère / révoque / régénère les invitations |
| `coach@test.local` | coach (Club A) | Négatif : n'accède pas à la gestion (R29) |
| `sansmapping@test.local` | (aucun) | Négatif : aucun accès (R5, R29) |

## Automatisation partielle

Les cas exigeant un **contournement de l'écran** (appel API direct) sont
automatisés par `scripts/test-invitation.sh` contre la stack **locale** :

```bash
npm run test:invitation        # (ou : bash scripts/test-invitation.sh)
```

Couvre **CT-06** (doublon e-mail, R32), **CT-07** (unicité, R28), **CT-08** (RLS
admin, R29) et **CT-09** (fail-closed RPC, R30/R33). Les cas nominaux
(CT-01..05, CT-10) restent à dérouler à la main.

## Cas de test

### CT-01 — Admin génère et affiche l'invitation d'un club   (couvre : R26, R28 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. `/admin/clubs` → section « Invitations coach permanent ».
  2. Sur **Club A**, cliquer « Générer l’invitation ».
- **Résultat attendu** : un **QR** s'affiche pour Club A, avec l'**URL**
  `…/inscription?invitation=<uuid>` et les actions Régénérer / Révoquer.

### CT-02 — Onboarding nominal : inscription via invitation active   (couvre : R30, R31 ; nominal)

- **Rôle / compte** : anonyme (nouvel arrivant), puis le nouveau compte.
- **Étapes** :
  1. Ouvrir l'URL de l'invitation de Club A (ou scanner le QR).
  2. L'écran d'inscription indique « Vous rejoindrez le club Club A ».
  3. Saisir un e-mail neuf (`coach2@test.local`) + mot de passe (≥ 6 car.), valider.
  4. À l'arrivée sur `/connexion` (message « compte créé »), se connecter.
- **Résultat attendu** : redirection vers `/coach` ; le nouveau compte est
  **coach permanent du Club A** (vérifiable dans `/admin/mapping`).

### CT-03 — Invitation multi-usage   (couvre : R27 ; nominal)

- **Rôle / compte** : anonyme.
- **Étapes** : réutiliser la **même** URL d'invitation Club A pour créer un
  **second** compte (`coach3@test.local`).
- **Résultat attendu** : l'inscription **réussit** aussi → second coach Club A.
  L'invitation reste active (aucune consommation).

### CT-04 — Révocation de l'invitation   (couvre : R29, R30 ; négatif)

- **Rôle / compte** : `admin@test.local`, puis anonyme.
- **Étapes** :
  1. Sur l'invitation Club A affichée, cliquer « Révoquer ».
  2. Rouvrir l'**ancienne** URL d'invitation.
- **Résultat attendu** : le QR disparaît côté admin (repropose « Générer ») ;
  l'ancienne URL affiche « Invitation invalide », **aucun** formulaire, **aucun**
  compte créé.

### CT-05 — Régénération   (couvre : R29 ; négatif sur l'ancienne valeur)

- **Rôle / compte** : `admin@test.local`, puis anonyme.
- **Étapes** :
  1. Générer une invitation Club A, noter l'URL, cliquer « Régénérer ».
  2. Ouvrir l'**ancienne** URL, puis la **nouvelle**.
- **Résultat attendu** : l'ancienne URL → « Invitation invalide » ; la nouvelle
  URL (valeur distincte) → formulaire d'inscription valide.

### CT-06 — E-mail déjà utilisé : pas de doublon   (couvre : R32 ; négatif)

- **Rôle / compte** : anonyme.
- **Étapes** : via une invitation active, tenter de s'inscrire avec
  `coach@test.local` (déjà existant).
- **Résultat attendu** : inscription **refusée** avec message invitant à se
  connecter ; **aucun** second compte, mapping de `coach@test.local` inchangé.

### CT-07 — Au plus une invitation active par club   (couvre : R28 ; négatif)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** (contournement) : `insert` d'une seconde `invitation_coach` active
  pour Club A (SQL Editor / API service_role, hors écran).
- **Résultat attendu** : **refusé** (violation de l'index unique
  `uq_invitation_active_par_club`).

### CT-08 — Gestion réservée à l'admin   (couvre : R29 ; négatif)

- **Rôle / compte** : `coach@test.local`, puis `sansmapping@test.local`.
- **Étapes** :
  1. En tant que coach : ouvrir `/admin/clubs`.
  2. Contournement : `insert`/`update` direct sur `invitation_coach` via le client
     `authenticated` du coach.
- **Résultat attendu** : écran `/admin/clubs` en **404** ; écriture directe
  **refusée** par la RLS (policy admin). Idem `sansmapping`.

### CT-09 — Fail-closed : invitation inexistante   (couvre : R30, R33 ; négatif)

- **Rôle / compte** : anonyme.
- **Étapes** : ouvrir `/inscription?invitation=<uuid aléatoire non existant>` et
  `/inscription` (sans paramètre).
- **Résultat attendu** : « Invitation invalide », **aucun** formulaire, **aucun**
  compte créé.

### CT-10 — Régénérer ne déconnecte pas les coachs déjà créés   (couvre : R31, R33)

- **Rôle / compte** : `admin@test.local`, puis un coach créé en CT-02.
- **Étapes** : régénérer l'invitation Club A, puis le coach créé se connecte.
- **Résultat attendu** : la connexion du coach **fonctionne** toujours (l'invitation
  ne sert qu'à l'onboarding, pas à la session).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | IHM |
| | | | CT-02 | ✅ / ❌ | IHM + auth |
| | | | CT-03 | ✅ / ❌ | IHM + auth |
| | | | CT-04 | ✅ / ❌ | IHM |
| | | | CT-05 | ✅ / ❌ | IHM |
| 2026-09-05 | agent | `local` | CT-06 | ✅ | `test:invitation` (local, 422) |
| 2026-09-05 | agent | `local` | CT-07 | ✅ | `test:invitation` (local, 201/409) |
| 2026-09-05 | agent | `local` | CT-08 | ✅ | `test:invitation` (local, 403) |
| 2026-09-05 | agent | `local` | CT-09 | ✅ | `test:invitation` (local, RPC ≠ 200) |
| | | | CT-10 | ✅ / ❌ | auth |
