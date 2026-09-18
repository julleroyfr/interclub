# Cahier de test : Saisie des résultats — voie & bloc (spec #6)

> Couvre la **saisie des résultats** par le coach (permanent et temporaire) sur
> l'écran `/coach/rencontres/[id]/resultats` : voies de difficulté (enfant : 3
> voies du groupe de départ ; ado : jusqu'à 6 au choix) et blocs (B1/B2), issues
> par catégorie, plafond ado, correction, **NP automatique à la clôture**,
> **lecture au fil de l'eau dès la ③** (tous clubs), **vitesse en lecture seule**,
> deux vues (par équipe / alphabétique) et navigation ‹/› + balayage.
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** :
  `docs/specs/06-saisie-des-resultats.md` (R1–R25) ;
  `docs/specs/01-roles-et-autorisations.md` (R6/R7/R8 rév. 2026-09-08, R19, R30) ;
  `docs/specs/05-espace-coach.md` (groupe de départ R19/R20).
- **Pré-requis** :
  - Migrations appliquées jusqu'à **`202609081000_saisie_resultats_voie_bloc`**
    incluse — en local : `supabase db reset` (migrations + seed).
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true`.
  - App lancée : `npm run dev` → port **3011**.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Le seed `01-jeu-de-test.sql` fournit la rencontre **ENFANT** `33333333-…-3333`
(compétition) **entièrement structurée** — barème « Matin » du gabarit : voies
moulinette **M1–M4** + tête **T1–T10**, blocs **B1** (2 paliers) et **B2** (3
paliers), et l'équipe **A1** déjà composée avec un **groupe de départ** :
**Ana** (M2 → M2·M3·M4) et **Bob** (T1 → T1·T2·T3). Le parcours enfant est donc
jouable directement, sans passer par l'admin.

La rencontre **ADO** `adadadad-…-adad` (compétition) est **aussi seedée** — barème
« Après-midi » : voies **tête T1–T10** (dont un **2ᵉ T5** pour tester le choix
libre de deux voies de même niveau, R11) avec zones, blocs **B1/B2** à paliers ado
(Zone / Zone 1 / Zone 2 / Bloc complet), et l'équipe **« Ados A1 »** composée de
**Nora** et **Owen** (nés 2011, sans groupe de départ : choix libre de 6 voies).
Les deux parcours sont donc jouables directement, sans passer par l'admin.

Cas particuliers à préparer à la main :

1. Pour le cas **R9** (enfant, « groupe à définir »), connecté **coach** Club A
   (`coach@test.local`) en pré-compétition : ajouter un grimpeur libre (ex. Chloé)
   à l'équipe A1 **sans** lui fixer de groupe.
2. Faire **rattacher un prêté** par l'admin sur l'enfant (Devi, Club B → Club A)
   et l'ajouter à A1 depuis le roster (badge « Prêté »).
3. (Option) Créer une rencontre ado via `/admin/rencontres` pour tester en plus la
   **RPC de copie du gabarit** elle-même.

> **Basculer la phase** (SQL Editor) :
> `update interclub.rencontre set phase = '<phase>' where id = '<id>';`
> phases : `pre_competition` → `preparation` → `competition` → `cloture` →
> `resultats_publics`.
>
> Les rencontres de test étant datées **d'aujourd'hui**, l'admin peut activer
> `preparation` puis `competition` depuis `/admin/rencontres` (garde-fou jour J).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Crée les rencontres, change la phase, corrige en clôture |
| `coach@test.local` | coach permanent (Club A) | Acteur principal de la saisie |
| *(anonyme via scan)* | coach temporaire (Club A) | Saisie jour J en compétition |
| `sansmapping@test.local` | aucun rôle | Négatif : pas d'accès ; lecture RLS dès ③ |

## Cas de test

> **Marquage** (cf. [convention 06 §3.1](../conventions/06-cahier-de-test.md), [ADR 0004](../decisions/0004-agent-execution-cahiers-de-test.md)) :
> `[auto]` (Playwright + scripts API/RLS), `[manuel]` (jugement de rendu), `[mixte]`.

### CT-01 — Accès à l'écran de saisie réservé au coach `[mixte]`   (couvre : R1)

- **Rôle / compte** : coach permanent Club A, puis admin / juge / non connecté / sans rôle.
- **Pré-condition** : rencontre enfant en **compétition**.
- **Étapes** :
  1. Coach A : ouvrir `/coach/rencontres/<enfant>/resultats`.
  2. Se déconnecter, tenter la même URL **non connecté**.
  3. Connecté **admin**, puis **`sansmapping@test.local`**, tenter la même URL.
- **Résultat attendu** : l'écran s'affiche (1) pour le coach ; **404** en (2) et (3)
  — l'espace est masqué (R1).

### CT-02 — Deux vues : par équipe / alphabétique `[manuel]`   (couvre : R24, R21)

- **Rôle / compte** : coach permanent Club A.
- **Pré-condition** : rencontre enfant en compétition, ≥ 2 équipes ou ≥ 3 grimpeurs.
- **Étapes** :
  1. Ouvrir l'écran ; onglet **Par équipe** actif : grimpeurs regroupés sous leur équipe.
  2. Basculer sur **Alphabétique**.
- **Résultat attendu** : en alphabétique, **tous** les grimpeurs du club à plat,
  triés par **nom de famille** (A→Z), chacun avec son **tag d'équipe** ; les
  compteurs 🧗/🧱 et l'état ⚡ sont identiques dans les deux vues (même donnée, R24).

### CT-03 — Navigation grimpeur ‹ / › + balayage `[manuel]`   (couvre : R25)

- **Rôle / compte** : coach permanent Club A.
- **Étapes** :
  1. Ouvrir un grimpeur ; noter le compteur **« i / n »**.
  2. Cliquer **›** puis **‹** ; sur mobile, **glisser** vers la gauche/droite.
- **Résultat attendu** : on passe au grimpeur suivant/précédent **dans l'ordre de la
  vue courante**, sans repasser par la liste ; le compteur se met à jour ; ‹ est
  désactivé sur le 1ᵉʳ, › sur le dernier (R25).

### CT-04 — Saisie voie enfant : Top / Prise valorisée / Échec `[mixte]`   (couvre : R8, R9, R10, R20)

- **Rôle / compte** : coach permanent Club A.
- **Pré-condition** : rencontre **enfant** en compétition ; **Ana** (groupe M2).
- **Étapes** :
  1. Ouvrir Ana : la section **Voie** liste **exactement 3 voies** (M2, M3, M4).
  2. M2 → **Top** ; M3 → **Prise valorisée** ; M4 → **Échec**.
- **Résultat attendu** : chaque issue s'affiche en pastille (Top vert, Prise
  valorisée cyan, Échec rouge) ; le compteur passe à **3/3** (R20). Sur un grimpeur
  **sans groupe** : « Groupe de départ à définir » et aucune voie (R9).

### CT-05 — Voie moulinette : pas de prise valorisée `[mixte]`   (couvre : R10)

- **Rôle / compte** : coach permanent Club A.
- **Pré-condition** : Ana (groupe M2 → M2 moulinette dans la liste).
- **Étapes** : ouvrir Ana ; observer les boutons d'issue proposés sur **M2**.
- **Résultat attendu** : sur une voie **moulinette** (M1–M4), seuls **Top** et
  **Échec** sont proposés (pas de « Prise valorisée ») ; sur une voie **tête**
  (T1…), « Prise valorisée » apparaît (R10).

### CT-06 — Correction d'une issue (remplacement) `[mixte]`   (couvre : R13)

- **Rôle / compte** : coach permanent Club A.
- **Étapes** : sur Ana / M3 déjà « Prise valorisée », cliquer **Top**.
- **Résultat attendu** : l'issue de M3 devient **Top** (remplacement) ; il n'y a
  **pas** deux résultats pour M3 (R13). Le compteur reste 3/3.

### CT-07 — Saisie ado : choix libre, 2 voies de même niveau, plafond 6 `[mixte]`   (couvre : R11, R12, R14)

- **Rôle / compte** : coach permanent Club A.
- **Pré-condition** : rencontre **ado** en compétition ; un grimpeur ado.
- **Étapes** :
  1. Ajouter T6 → **Top** ; T5 → **Zone 2** ; **T5** (2ᵉ voie même niveau) → **Zone 1** ;
     T7 → **Échec** ; T8 → **Top** ; T4 → **Zone 2** (⇒ 6 voies).
  2. Tenter d'ajouter une **7ᵉ** voie.
- **Résultat attendu** : les 6 issues s'enregistrent (deux T5 **distinctes**
  autorisées, R11) ; le compteur affiche **6/6** ; l'ajout d'une 7ᵉ voie est
  **refusé** avec message « au plus 6 voies » (R14). Les issues ado proposées sont
  Top / Zone 2 / Zone 1 / Échec (R12).

### CT-08 — Retrait d'une voie ado `[mixte]`   (couvre : R11, R14)

- **Rôle / compte** : coach permanent Club A.
- **Étapes** : sur le grimpeur ado à 6/6, **retirer** (×) la voie T4.
- **Résultat attendu** : la voie disparaît, compteur **5/6** ; l'ajout d'une voie
  redevient possible (emplacement libéré).

### CT-09 — Saisie bloc : palier / échec `[mixte]`   (couvre : R15, R16, R17)

- **Rôle / compte** : coach permanent Club A.
- **Étapes** :
  1. Section **Bloc** : B1 → choisir un **palier** (ex. enfant « 1er essai » /
     ado « Bloc complet ») → **Valider** ; B2 → **Échec**.
  2. Re-saisir B1 avec un autre palier.
- **Résultat attendu** : B1 affiche le palier, B2 « Échec » ; compteur **2/2** ; la
  re-saisie **remplace** (un seul résultat par bloc, R17). Un palier étranger au
  bloc n'est jamais proposé (R16).

### CT-10 — Saisie par le coach temporaire (jour J, compétition) `[mixte]`   (couvre : R5, R7)

- **Rôle / compte** : coach **temporaire** Club A (scan du jeton QR).
- **Pré-condition** : rencontre enfant **en compétition** ; scanner
  `http://localhost:3011/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
- **Étapes** : ouvrir `/coach/rencontres/<enfant>/resultats`, saisir une issue de voie.
- **Résultat attendu** : la saisie est **acceptée** (mêmes droits que le permanent
  en ③, R7). Le coach temporaire n'accède pas à une **autre** rencontre (404, R2).

### CT-11 — Saisie interdite hors compétition `[mixte]`   (couvre : R5)

- **Rôle / compte** : coach permanent Club A.
- **Étapes** :
  1. Basculer la rencontre en **préparation** (SQL) ; ouvrir l'écran de saisie.
  2. Idem en **clôture** puis **résultats publics**.
- **Résultat attendu** : hors **compétition**, **aucun formulaire de saisie** n'est
  affiché (bandeau « ouverte qu'en compétition ») ; l'écran reste **consultable**
  (R5). Une tentative d'écriture directe (API) est refusée par la RLS.

### CT-12 — NP automatique à la clôture `[mixte]`   (couvre : R18, R19)

- **Rôle / compte** : admin, puis coach permanent Club A.
- **Pré-condition** : rencontre **enfant** en compétition ; Ana a **M2 = Top**, mais
  **M3/M4 non saisies** et **B1/B2 non saisis** ; un grimpeur ado à **4/6**.
- **Étapes** :
  1. Admin : passer la rencontre enfant en **clôture** (`/admin/rencontres`).
  2. Coach : rouvrir l'écran (consultation).
- **Résultat attendu** : M3, M4, B1, B2 d'Ana passent en **NP** automatiquement
  (R18) ; M2 reste **Top** (inchangé, idempotent). Pour l'**ado**, **aucune ligne
  NP** n'est créée : le compteur reste **4/6** (décision 2026-09-08). Après clôture,
  le coach **ne peut plus** saisir ; seul l'admin corrige (R19).

### CT-13 — Lecture au fil de l'eau, tous clubs, dès la ③ `[auto]`   (couvre : R6, R8)

- **Rôle / compte** : `sansmapping@test.local` (authentifié, hors club), via SQL/API.
- **Pré-condition** : des résultats saisis sur la rencontre enfant en **compétition**.
- **Étapes** (SQL, rôle `authenticated` avec le `sub` de sansmapping) :
  1. En **compétition** : `select count(*) from interclub.resultat_voie …` (voies de
     la rencontre) et idem `resultat_bloc`.
  2. Repasser la rencontre en **pré-compétition** puis relire.
- **Résultat attendu** : en **③+**, l'utilisateur hors club **voit** les résultats
  (lecture ouverte à tout authentifié, R6/R8) ; il ne peut **pas** écrire
  (`insert` refusé, RLS). *(La surface publique `anon` — visiteur non connecté —
  est une itération dédiée, hors de ce cahier.)*

### CT-14 — Vitesse en lecture seule `[mixte]`   (couvre : R22, R23)

- **Rôle / compte** : coach permanent Club A ; juge (scan) pour alimenter.
- **Étapes** :
  1. Juge : saisir un **temps** de vitesse pour un grimpeur (écran juge).
  2. Coach : ouvrir le grimpeur sur l'écran de saisie.
- **Résultat attendu** : la section **⚡ Vitesse** affiche le **temps** en **lecture
  seule** (« lecture (juge) ») — le coach ne peut pas le modifier (R22) ; sans temps,
  « en attente ». Le **score** affiche « à venir (classement) » (R23, calcul hors
  périmètre).

## Registre d'exécution

> **Couverture automatique** (2026-09-18, stack locale, branche `develop` WIP) :
> les règles **enforçables en base** sont vérifiées par `npm run test:resultats`
> (`scripts/test-resultats.sh`, 21/21 assertions) ; les règles **applicatives**
> (R9, R11, R14, R18, R20) par le **domaine pur** `src/domaine/resultat.test.ts`
> (Vitest, suite 168/168). Reste **manuel** : le rendu et les parcours IHM
> (pastilles, deux vues, navigation ‹/›/balayage, formulaire par phase, flux scan,
> vitesse en lecture seule).

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-09-18 | auto+manuel | develop (WIP) | CT-01 | ⚠️ partiel | 404 non-connecté vérifié (HTTP) ; vue coach = manuel |
| | | | CT-02 | ✅ / ❌ | manuel (rendu deux vues) |
| | | | CT-03 | ✅ / ❌ | manuel (navigation ‹/›, balayage) |
| 2026-09-18 | auto | develop (WIP) | CT-04 | ⚠️ partiel | R10 (BDD) ✅ `test:resultats` ; 3 voies/compteur/R9 = domaine + manuel |
| 2026-09-18 | auto | develop (WIP) | CT-05 | ⚠️ partiel | R10 moulinette (BDD) ✅ ; boutons d'issue = manuel |
| 2026-09-18 | auto | develop (WIP) | CT-06 | ✅ | R13 unicité + correction (BDD) ✅ `test:resultats` |
| 2026-09-18 | auto | develop (WIP) | CT-07 | ⚠️ partiel | R12 zones ado (BDD) ✅ ; R11/R14 = domaine (Vitest) ; ajout/plafond = manuel |
| 2026-09-18 | auto | develop (WIP) | CT-08 | ✅ (domaine) | R11/R14 retrait couverts par `resultat.test.ts` ; geste ×  = manuel |
| 2026-09-18 | auto | develop (WIP) | CT-09 | ✅ | R16 (palier↔bloc, palier⇔id) + R17 unicité (BDD) ✅ `test:resultats` |
| | | | CT-10 | ✅ / ❌ | manuel (flux scan coach temporaire) |
| 2026-09-18 | auto | develop (WIP) | CT-11 | ✅ (BDD) | R5 : écriture refusée hors ③ ✅ `test:resultats` ; « pas de formulaire » = manuel |
| 2026-09-18 | auto | develop (WIP) | CT-12 | ✅ (domaine) | R18/R19 NP à la clôture couverts par `resultat.test.ts` ; bout-en-bout via IHM = manuel |
| 2026-09-18 | auto | develop (WIP) | CT-13 | ✅ | R6/R8 lecture ③+ tous clubs + écriture refusée (RLS) ✅ `test:resultats` |
| | | | CT-14 | ✅ / ❌ | manuel (vitesse lecture seule) |
