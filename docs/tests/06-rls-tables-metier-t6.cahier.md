# Cahier de test : Policies RLS des tables métier (T6)

> Couvre la tranche **T6** : les policies RLS des 9 tables métier implémentant la
> matrice rôles × actions de la spec #1 et les deux chemins d'acteur de l'ADR
> 0001 (permanent via `compte`, éphémère via `session_qr → jeton_qr → rencontre`),
> avec gating de phase. Aucun écran n'est encore livré (T8) : la vérification se
> fait au niveau **accès données** (SQL Editor par impersonation, ou REST avec
> jetons). Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/01-roles-et-autorisations.md` (R5–R36 +
  matrice ; précisions du 2026-07-25 sur R6 et R30) ;
  [ADR 0001](../decisions/0001-authentification-sessions-ephemeres-qr.md) (§3).
- **Migration** : **`202607251000_rls_tables_metier`** (helpers de périmètre
  `SECURITY DEFINER` + grants + policies par opération).
- **Pré-requis** :
  - Migration `202607251000` appliquée (local : `supabase db reset` ; recette :
    SQL Editor). Dépend des migrations socle/voie/auth/session déjà présentes.
  - Seeds `01`, `02`, `03` chargés (clubs A/B, comptes, rencontre 33…33, jetons).
- **Environnement** : local (stack Docker) et/ou recette — version/commit : `______`

## Automatisation (local)

L'essentiel des cas ci-dessous est **rejoué automatiquement** par
`npm run test:t6` (script `scripts/test-t6.sh`) contre la stack **locale** :
impersonation en base (`set role authenticated` + claim `sub`) dans une
transaction annulée, 17 assertions positives/négatives, sortie
`T6 RESULT: 17 OK / 0 KO`. Le cahier reste requis pour la **validation sur base
réelle** (recette) et pour les cas non couverts par le script.

## Jeu de données initial

Seeds `01`/`02`/`03` :

- Clubs : **Club A** (`11…11`), **Club B** (`22…22`).
- Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
  (coach permanent Club A), `sansmapping@test.local` (aucun mapping).
- Rencontre `33…33` (2026-09-19, enfant), portée par Club A, 2 voies de vitesse,
  2 équipes (A1 `66…66` club A, B1 `77…77` club B), **phase `competition`**
  (seed 03).
- Jetons QR (seed 03) : coach temp. Club A (`aaaaaaaa-aaaa-4aaa-…`), juge Voie 1
  (`bbbbbbbb-bbbb-4bbb-…`).

> Pour les cas exigeant des grimpeurs/épreuves/compositions et des sessions
> éphémères ouvertes, créer les fixtures décrites dans chaque cas (ou s'appuyer
> sur le futur seed **T7**). Basculer la phase via
> `update interclub.rencontre set phase='…' where id='33333333-3333-3333-3333-333333333333';`.

## Comment impersoner un rôle (SQL Editor / psql)

Dans une transaction, avant chaque groupe d'assertions :

```sql
select set_config('request.jwt.claims', '{"sub":"<UUID du compte/session>"}', true);
set local role authenticated;   -- la RLS s'applique alors comme pour l'utilisateur
-- … tenter les opérations …
reset role;
```

- Admin : `sub` = `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`.
- Coach permanent Club A : `sub` = `cccccccc-cccc-cccc-cccc-cccccccccccc`.
- Sans mapping : `sub` = `55555555-5555-5555-5555-555555555555`.
- Coach temp. / juge : `sub` = l'`utilisateur_id` d'une ligne `session_qr` liée au
  jeton correspondant (créée par la RPC `ouvrir_session_qr` au scan, ou insérée
  pour le test).

## Cas de test

### CT-01 — Admin : CRUD complet (couvre R10, R11, R12, R13)

- **Rôle** : admin.
- **Étapes** : insérer un `club`, une `rencontre`, une `epreuve`, une
  `voie_vitesse`.
- **Résultat attendu** : toutes les écritures **acceptées**.

### CT-02 — Compte sans mapping : aucun droit (couvre R5 fail-closed, spec #2)

- **Rôle** : `sansmapping@test.local`.
- **Étapes** : tenter d'insérer un `club` et une `equipe`.
- **Résultat attendu** : **refus** (`row-level security`) sur toutes les tables.

### CT-03 — Coach : CRUD club/rencontre interdit (couvre R22, R11, R12)

- **Rôle** : coach permanent Club A.
- **Étapes** : tenter d'insérer/modifier un `club` et une `rencontre`.
- **Résultat attendu** : **refus** (réservé à l'admin).

### CT-04 — Coach : roster grimpeur de son club, hors phase (couvre R18, R20 ; précision R6)

- **Rôle** : coach permanent Club A ; rencontre en **`pre_competition`** puis
  **`competition`** (le roster est indépendant de la phase).
- **Étapes** :
  1. Insérer un `grimpeur` avec `club_id` = Club A → **accepté** (dans les deux
     phases).
  2. Insérer un `grimpeur` avec `club_id` = Club B → **refusé** (R20).
- **Résultat attendu** : conforme ci-dessus.

### CT-05 — Coach permanent : pré-saisie équipe en phase ① seulement (couvre R6, R17, R25)

- **Rôle** : coach permanent Club A.
- **Étapes** :
  1. Rencontre en **`pre_competition`** : insérer une `equipe` (Club A,
     rencontre 33) → **accepté**.
  2. Rencontre en **`competition`** : insérer une `equipe` (Club A) → **refusé**
     (R6 : plus de pré-saisie en phase ②).
  3. Toute phase : insérer une `equipe` **Club B** → **refusé** (R20).

### CT-06 — Coach : saisie des résultats en phase ② seulement (couvre R7, R19)

- **Rôle** : coach permanent Club A ; grimpeur de Club A composé dans l'équipe A1
  (`66…66`) ; une `epreuve` `voie` sur la rencontre 33.
- **Étapes** :
  1. Phase **`pre_competition`** : insérer un `resultat` du grimpeur → **refusé**
     (R7).
  2. Phase **`competition`** : insérer/modifier le `resultat` → **accepté** (R19).

### CT-07 — Grimpeur prêté : rattachement admin, saisie coach d'accueil (couvre R35, R36)

- **Pré-condition** : grimpeur de **Club B**, phase `competition`, épreuve `voie`.
- **Étapes** :
  1. **Coach A** tente d'insérer une `composition` (équipe A, grimpeur de Club B)
     → **refusé** (R35 : le prêt est réservé à l'admin).
  2. **Admin** insère cette `composition` (grimpeur de Club B dans l'équipe A) →
     **accepté** (R35).
  3. **Coach A** insère le `resultat` de ce grimpeur prêté → **accepté** (R36 :
     via la composition, pas via le club d'origine).

### CT-08 — Coach temporaire : périmètre club, phase ② (couvre R27, R9, R20, R28)

- **Pré-condition** : session `session_qr` ouverte sur le jeton coach temp. Club A
  (`sub` = `utilisateur_id` de la session) ; jeton **actif**.
- **Étapes** :
  1. Phase **`competition`** : insérer une `equipe` Club A → **accepté** (R27).
  2. Phase **`competition`** : insérer une `equipe` Club B → **refusé** (R20).
  3. Phase **`pre_competition`** (hors fenêtre) : toute écriture → **refusé** (R28,
     la session n'est plus valide).

### CT-09 — Coupure immédiate : révocation du jeton (couvre R13, R22, R23 ; ADR 0001)

- **Pré-condition** : comme CT-08, phase `competition`, session coach temp. Club A.
- **Étapes** :
  1. Vérifier qu'une écriture équipe Club A est **acceptée**.
  2. `update interclub.jeton_qr set actif=false where id='55555555-5555-5555-5555-555555555551';`
  3. Re-tenter la **même** écriture → **refusée** au **prochain appel** (sans
     reconnexion : la RLS relit `jeton_qr.actif`).
- **Résultat attendu** : coupure immédiate sans expiration.

### CT-10 — Juge : temps de vitesse uniquement (couvre R30, R32 ; précision R30)

- **Pré-condition** : session `session_qr` ouverte sur le jeton juge Voie 1 ;
  phase `competition` ; une `epreuve` `vitesse` et une `epreuve` `voie` sur la
  rencontre 33 ; un grimpeur composé.
- **Étapes** :
  1. Insérer un `temps_vitesse` sur l'épreuve **vitesse** → **accepté** (R30).
  2. Insérer un `resultat` sur l'épreuve **voie** → **refusé** (R32).
  3. Insérer un `temps_vitesse` en pointant l'épreuve **voie** → **refusé** (R30 :
     périmètre = épreuve de vitesse).

### CT-11 — Juge d'une autre rencontre : aucun accès (couvre R30, R33)

- **Pré-condition** : session juge liée à une **autre** rencontre (ou jeton d'une
  rencontre hors phase ②).
- **Étapes** : tenter d'insérer un `temps_vitesse` sur l'épreuve vitesse de la
  rencontre 33 → **refusé**.

### CT-12 — Lecture croisée (couvre R20, R21 partiel)

- **Rôle** : coach permanent Club A.
- **Étapes** :
  1. `select` sur ses `equipe`/`grimpeur`/`resultat` (périmètre Club A) →
     **visibles**.
  2. `select` sur les `grimpeur`/`resultat` de Club B → **non visibles** (R20).
  3. `select` sur `club`/`rencontre` → **visibles** (référence/calendrier public).

> La lecture publique **cross-club** des résultats en phase ③ (R8/R21) relève du
> modèle « infos publiques » (spec dédiée, hors périmètre T6) et n'est pas testée
> ici au-delà du calendrier/référence.

## Registre d'exécution

| Cas | Environnement | Date | Testeur | Verdict | Notes |
|-----|---------------|------|---------|---------|-------|
| CT-01 | | | | ⬜ | |
| CT-02 | | | | ⬜ | |
| CT-03 | | | | ⬜ | |
| CT-04 | | | | ⬜ | |
| CT-05 | | | | ⬜ | |
| CT-06 | | | | ⬜ | |
| CT-07 | | | | ⬜ | |
| CT-08 | | | | ⬜ | |
| CT-09 | | | | ⬜ | |
| CT-10 | | | | ⬜ | |
| CT-11 | | | | ⬜ | |
| CT-12 | | | | ⬜ | |

> **Note (local)** : CT-01..CT-10 sont couverts automatiquement par
> `npm run test:t6` (17/17). Le registre ci-dessus sert à tracer la validation
> **sur base réelle (recette)**.
