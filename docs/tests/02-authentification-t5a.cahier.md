# Cahier de test : Authentification permanente (T5a)

> Couvre la tranche **T5a** : connexion/déconnexion d'un compte permanent,
> lecture du rôle courant, et RLS de `interclub.compte`. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R1–R5) et `docs/specs/01-roles-et-autorisations.md` (R4, R10).
- **Pré-requis** :
  - Stack Supabase **locale** démarrée (`supabase start`) avec les migrations
    jouées (`supabase db reset`), dont `202607221300_rls_compte_et_role_courant`.
  - `.env.local` pointant sur la stack locale
    (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `..._ANON_KEY` via
    `supabase status`).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Fourni par le **seed** `supabase/seed/01-utilisateurs-de-test.sql`, chargé
**automatiquement** par `supabase db reset` (aucune manip Studio nécessaire) :

- Club « Club A ».
- 3 comptes Auth confirmés, **mot de passe commun : `interclub`** :
  `admin@test.local` (rôle admin), `coach@test.local` (coach, Club A),
  `sansmapping@test.local` (aucun mapping → cas R5).

> Vérifier après `db reset` :
> `select u.email, c.role from auth.users u left join interclub.compte c on c.utilisateur_id = u.id order by u.email;`

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Voit tout, administre les mappings |
| `coach@test.local` | coach (Club A) | Périmètre club, ne voit que sa ligne `compte` |
| `sansmapping@test.local` | (aucun) | Compte permanent sans mapping (R5, fail-closed) |

## Automatisation partielle

Les cas **non-UI** (connexions, CT-03, CT-04, CT-05, CT-06, CT-07) sont
automatisés par `scripts/test-t5a.sh` (auth + RLS via l'API locale) :

```bash
npm run test:t5a        # (ou : bash scripts/test-t5a.sh)
```

Pré-requis : `supabase start` puis `supabase db reset` (charge le seed). Le
script sort en erreur si un cas échoue. Les cas **UI** (CT-01, CT-02, CT-08 :
affichage du rôle, déconnexion) restent à dérouler à la main dans l'app.

## Cas de test

### CT-01 — Connexion admin   (couvre : R1, R10 ; scénario nominal)

- **Rôle / compte** : `admin@test.local`
- **Pré-condition** : déconnecté.
- **Étapes** :
  1. Aller sur `/connexion`.
  2. Saisir e-mail + mot de passe de l'admin, valider.
- **Résultat attendu** : redirection vers `/` ; l'accueil affiche l'e-mail et
  « Rôle : admin ».
- **RLS / sécurité** : aucune donnée d'un autre compte n'est exposée à l'écran.

### CT-02 — Connexion coach   (couvre : R1, R16 ; scénario nominal)

- **Rôle / compte** : `coach@test.local`
- **Pré-condition** : déconnecté.
- **Étapes** :
  1. Se connecter avec les identifiants du coach.
- **Résultat attendu** : accueil affiche « Rôle : coach ».

### CT-03 — Identifiants invalides   (couvre : R1 ; cas erreur)

- **Rôle / compte** : n'importe lequel, mauvais mot de passe.
- **Étapes** :
  1. Sur `/connexion`, saisir un e-mail connu avec un mauvais mot de passe.
- **Résultat attendu** : message « Identifiants invalides. », **aucune** session
  ouverte (l'accueil reste en état « Se connecter »).

### CT-04 — Compte sans mapping   (couvre : R5, fail-closed)

- **Rôle / compte** : `sansmapping@test.local`
- **Étapes** :
  1. Se connecter.
- **Résultat attendu** : accueil affiche « Rôle : aucun rôle attribué ». Le
  compte est authentifié mais **sans droit applicatif**.

### CT-05 — RLS : un coach ne lit que sa ligne `compte`   (couvre : R4 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** (SQL, en simulant le rôle `authenticated` + le JWT du coach dans le
  SQL Editor local, ou via un appel API `/rest/v1/compte` avec son jeton) :
  1. `select * from interclub.compte;`
- **Résultat attendu** : **une seule** ligne renvoyée (celle du coach). Les lignes
  admin / autres comptes ne sont **pas** visibles.

### CT-06 — RLS : l'admin lit tous les `compte`   (couvre : R4, R10)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. `select * from interclub.compte;` (dans le contexte du jeton admin).
- **Résultat attendu** : **toutes** les lignes de `compte` sont renvoyées.

### CT-07 — RLS : un coach ne peut pas écrire un mapping   (couvre : R4 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** :
  1. Tenter `insert into interclub.compte (...) values (...)` (contexte coach).
- **Résultat attendu** : **refusé** (violation de policy) — seul l'admin crée un
  mapping.

### CT-08 — Déconnexion   (couvre : gestion de session)

- **Rôle / compte** : n'importe quel compte connecté.
- **Étapes** :
  1. Depuis l'accueil, cliquer « Se déconnecter ».
- **Résultat attendu** : redirection vers `/connexion` ; l'accueil ne montre plus
  de rôle et propose « Se connecter ».

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
