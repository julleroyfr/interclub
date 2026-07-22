# Cahier de test : Mapping de rôle — écran admin (T5b)

> Couvre la tranche **T5b** : l'écran d'administration `/admin/mapping` où l'admin
> attribue un rôle applicatif (et un club pour un coach) à un compte existant.
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R1–R5 : mapping de rôle) ; `docs/specs/01-roles-et-autorisations.md` (R4, R10).
- **Décision d'architecture** :
  [ADR 0002](../decisions/0002-liste-des-comptes-via-cle-service.md) — lecture des
  comptes / clubs via la clé `service_role`, écriture via RLS.
- **Pré-requis** :
  - Stack Supabase **locale** démarrée (`supabase start`) migrations jouées
    (`supabase db reset`, dont `202607221200`, `202607221300` et
    **`202607221400`** — grants `service_role` sans lesquels l'écran renvoie
    `42501 permission denied`).
  - `.env.local` pointant sur la stack locale, avec **`SUPABASE_SERVICE_ROLE_KEY`**
    renseigné (valeur `service_role` de `supabase status`). Sans cette clé,
    l'écran `/admin/mapping` renvoie une erreur (lecture des comptes indisponible).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Fourni par le **seed** `supabase/seed/01-utilisateurs-de-test.sql`, chargé par
`supabase db reset` :

- Club « Club A ».
- 3 comptes Auth confirmés, **mot de passe commun : `interclub`** :
  `admin@test.local` (rôle admin), `coach@test.local` (coach, Club A),
  `sansmapping@test.local` (**aucun mapping** → cible des attributions ci-dessous).

> Certains cas **modifient** le mapping de `sansmapping@test.local`. Pour rejouer
> le cahier à l'identique, relancer `supabase db reset` avant une nouvelle passe
> (ou supprimer manuellement la ligne créée dans `interclub.compte`).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Accède à `/admin/mapping`, attribue les rôles |
| `coach@test.local` | coach (Club A) | Non-admin : doit être refusé sur l'écran (négatif) |
| `sansmapping@test.local` | (aucun) | Compte **cible** des attributions (R5 → rôle) |

## Cas de test

### CT-01 — L'admin voit l'écran de mapping   (couvre : R4 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : connecté ; `SUPABASE_SERVICE_ROLE_KEY` renseigné.
- **Étapes** :
  1. Depuis l'accueil, cliquer « Administrer les rôles » (ou aller `/admin/mapping`).
- **Résultat attendu** : l'écran s'affiche ; le sélecteur **Compte** liste les
  3 comptes de test (par e-mail) ; le sélecteur **Club** liste « Club A » ; le
  tableau « Mappings existants » montre `admin@test.local` (admin) et
  `coach@test.local` (coach / Club A).
- **RLS / sécurité** : la liste des comptes provient du client `service_role`
  côté serveur (ADR 0002), jamais exposé au navigateur.

### CT-02 — Attribuer le rôle coach + club   (couvre : R1, R3, R4 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : `sansmapping@test.local` sans mapping.
- **Étapes** :
  1. Sur `/admin/mapping`, choisir le compte `sansmapping@test.local`.
  2. Sélectionner le rôle **Coach**.
  3. Choisir le club **Club A**, valider « Attribuer ».
- **Résultat attendu** : message « Rôle attribué. » ; le tableau « Mappings
  existants » affiche désormais `sansmapping@test.local` → coach / Club A.
- **Vérif base** (facultatif) :
  `select role, club_id from interclub.compte where utilisateur_id = (select id from auth.users where email='sansmapping@test.local');`
  → `role = coach`, `club_id` = id de Club A.

### CT-03 — Attribuer le rôle admin (sans club)   (couvre : R1, R3 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : rejouer sur `sansmapping@test.local` (après `db reset` ou en
  ré-attribuant).
- **Étapes** :
  1. Choisir `sansmapping@test.local`, rôle **Admin**.
  2. Constater que **le sélecteur Club disparaît** (un admin n'a pas de club, R3).
  3. Valider.
- **Résultat attendu** : « Rôle attribué. » ; le tableau montre le compte en
  **admin** avec club « — ». En base, `club_id is null` (contrainte
  `chk_compte_role_club`).

### CT-04 — Changer un mapping existant   (couvre : R4 ; nominal, mise à jour)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Re-sélectionner un compte **déjà mappé** (p. ex. celui de CT-02), changer son
     rôle/club, valider.
- **Résultat attendu** : le mapping est **mis à jour** (pas de doublon) ; une seule
  ligne pour ce compte dans `interclub.compte` (upsert sur `utilisateur_id`).

### CT-05 — Coach sans club refusé   (couvre : R3 ; cas erreur)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Choisir un compte, rôle **Coach**, **ne pas** choisir de club.
  2. Tenter de valider.
- **Résultat attendu** : la soumission est **bloquée** (champ Club requis). Si
  contournée (POST direct sans club), la Server Action répond « Un coach doit être
  rattaché à un club (R3). » et **aucune** ligne n'est écrite.

### CT-06 — Un non-admin ne peut pas ouvrir l'écran   (couvre : R4 ; négatif)

- **Rôle / compte** : `coach@test.local` (puis `sansmapping@test.local`).
- **Étapes** :
  1. Connecté en coach, aller directement sur `/admin/mapping`.
- **Résultat attendu** : page **introuvable (404)** — l'existence de l'écran n'est
  pas révélée (`notFound()`). L'accueil du coach n'affiche pas « Administrer les
  rôles ».

### CT-07 — RLS : un non-admin ne peut pas écrire un mapping   (couvre : R4 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** (contournement de l'UI) :
  1. Avec le jeton du coach, tenter un `upsert`/`insert` sur `interclub.compte`
     (POST direct de la Server Action, ou appel `/rest/v1/compte`).
- **Résultat attendu** : **refusé**. Côté Server Action : « Seul un administrateur
  peut attribuer un rôle (R4). » Côté base : la policy admin rejette l'écriture même
  si la garde applicative était contournée (défense en profondeur, ADR 0002).

### CT-08 — Le compte mappé obtient ses droits   (couvre : R5 → attribution)

- **Rôle / compte** : le compte cible de CT-02 (`sansmapping@test.local` devenu
  coach).
- **Étapes** :
  1. Se déconnecter, se reconnecter avec ce compte.
- **Résultat attendu** : l'accueil affiche « Rôle : coach » (avant l'attribution il
  affichait « aucun rôle attribué », R5 fail-closed). Le mapping prend effet.

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
