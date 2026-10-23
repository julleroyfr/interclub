# Cahier de test : Catégorie adulte (spec #20)

- **Spec de référence** : `docs/specs/20-categorie-adulte.md`
- **Périmètre actuel** : **lot 1** — catégorie et gabarit (R1–R4, R6–R9,
  R9bis, R22, R24, R26 côté base, R33, R34/R35). Les lots suivants (import,
  équipes adultes, moulinette, capitaine, classement) compléteront ce cahier.
- **Pré-requis** :
  - Migration **`202610231000_categorie_adulte`** appliquée à la main (recette
    seulement tant que la branche n'est pas fusionnée).
  - Script de retour arrière disponible :
    `supabase/retours-arriere/202610231000_categorie_adulte_retour_arriere.sql`.
- **Environnement** : local, puis recette (preview `feature/categorie-adulte`) —
  version/commit : `______`
- **Validé en local le 2026-10-23** : aller → retour → aller sur base neuve
  (définitions de fonctions, droits, contraintes, triggers, policies identiques
  à la référence après retour), migration rejouée deux fois sans doublon,
  `db:verifier`, suites SQL existantes, `npm run test:adulte` 11/11, E2E
  `categorie-adulte.spec.ts` 4/4.

Légende : `[auto]` rejoué par un test automatisé, `[manuel]` à dérouler à la
main, `[mixte]` partie automatisée + vérification à l'œil.

## Jeu de données initial

- Recette : le seed (`JD-ADMIN`, `JD-COACH-A`, `JD-CLUB-A`). Local : seed `01`.
- Aucune rencontre adulte au départ. Le gabarit adulte est créé par la
  migration.

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` (`JD-ADMIN`) | administrateur | crée la rencontre adulte, modifie libellés et gabarit |
| `coach@test.local` (`JD-COACH-A`) | coach permanent Club A | négatif : aucun accès au gabarit ni à la structure |
| `postgres` (SQL Editor) | administrateur base | contrôles SQL, retour arrière |

## Cas de test

### CT-01 — Migration appliquée : contraintes et gabarit adulte (couvre : R1, R6–R9, R34) `[manuel]`

- **Rôle / compte** : `postgres` (SQL Editor recette).
- **Étapes** :
  1. Appliquer `202610231000_categorie_adulte.sql`.
  2. Exécuter :

     ```sql
     select conname, pg_get_constraintdef(oid) from pg_constraint
      where conname in ('rencontre_categorie_check', 'gabarit_epreuve_categorie_check');
     select type, points_chute, points_non_presentation
       from interclub.gabarit_epreuve where categorie = 'adulte' order by type;
     select version from interclub.version where version = '202610231000_categorie_adulte';
     ```

- **Résultat attendu** : les deux contraintes listent `'enfant', 'ado',
  'adulte'` ; trois épreuves adultes (`bloc`, `vitesse` avec chute 5 et NP 0,
  `voie`) ; la ligne de version est présente. Les écrans enfant et ado
  fonctionnent comme avant (ouvrir une rencontre ado existante).

### CT-02 — Créer une rencontre adulte (couvre : R1, R6–R9) `[auto]`

- **Rôle / compte** : `JD-ADMIN`.
- **Étapes** :
  1. `/admin/rencontres` → date, club porteur, catégorie **« Adulte (16 ans et
     plus) »** → **Créer la rencontre**.
  2. Ouvrir la rencontre créée.
- **Résultat attendu** : message « Rencontre créée. » ; la liste affiche la
  catégorie « Adulte ».

### CT-03 — Structure copiée depuis le gabarit adulte (couvre : R7–R9) `[mixte]`

- **Rôle / compte** : `JD-ADMIN`, rencontre de CT-02.
- **Étapes** : onglets **Voies de difficulté**, **Blocs**, **Vitesse**.
- **Résultat attendu** :
  - voies T1 (4c) à T10 (7c), toutes en tête, points zone 1 / zone 2 / top de
    l'addendum (T1 1/2/4 … T10 19/20/22) ; aucune voie M1–M4 ;
  - B1 : Zone 15, Bloc complet 30 ; B2 : Zone 1 20, Zone 2 50, Bloc complet 70 ;
  - vitesse : « Voie 1 », « Voie 2 », aucune mention de sexe ; barème 1–5 :
    100 (−5), 6–10 : 75, 11–15 : 60, 16–20 : 45, 21–25 : 30, 26–30 : 15,
    31+ : 10 ; chute 5, non-présentation 0.

### CT-04 — Renommer une voie de vitesse dans la rencontre (couvre : R9bis) `[auto]`

- **Rôle / compte** : `JD-ADMIN`, rencontre de CT-02 en ① pré-compétition.
- **Étapes** : onglet **Vitesse** → champ « Libellé (voie 1) » → saisir
  « Voie 1 — dalle » précédé et suivi d'espaces, avec des espaces doublés →
  **Enregistrer**.
- **Résultat attendu** : « Libellé enregistré. » ; libellé affiché et stocké
  `Voie 1 — dalle` (espaces normalisés).
- **Variante** : passer la rencontre en ② ou ③ → le libellé s'affiche en
  lecture seule, sans champ (même règle que le reste de la structure).

### CT-05 — Libellé blanc refusé (couvre : R9bis) `[auto]`

- **Étapes** : champ « Libellé (voie 2) » → saisir des espaces → **Enregistrer**.
- **Résultat attendu** : message « Le libellé de la voie de vitesse est
  obligatoire. » ; le libellé reste « Voie 2 ».

### CT-06 — Gabarit adulte et libellé de vitesse modifiable, toutes catégories (couvre : R6, R9bis) `[mixte]`

- **Rôle / compte** : `JD-ADMIN`.
- **Étapes** :
  1. `/admin/gabarit` : repérer la carte **« Gabarit Adulte »**.
  2. Renommer « Voie 2 » en « Voie 2 — dévers » → **Enregistrer**.
  3. Dans la carte **« Gabarit Ado »**, renommer une voie de vitesse, puis
     rétablir son libellé.
- **Résultat attendu** : trois cartes (Enfant, Ado, Adulte) ; « Libellé
  enregistré. » à chaque fois ; une nouvelle rencontre adulte reprend le libellé
  modifié du gabarit ; les rencontres existantes ne changent pas.
- **RLS / sécurité** : `JD-COACH-A` n'accède ni à `/admin/gabarit` ni à la
  structure d'une rencontre (redirection, aucune action possible).

### CT-07 — Zones admises, prise valorisée refusée en adulte (couvre : R24, R26) `[auto]`

- **Étapes** : `npm run test:adulte` (local), assertions `R26-*`.
- **Résultat attendu** : une issue `zone2` est acceptée sur une voie adulte ;
  `prise_valorisee` est refusée par la base.

### CT-08 — Plafond de 6 voies en adulte (couvre : R22) `[auto]`

- **Étapes** : `npm run test:adulte`, assertions `R22-*`.
- **Résultat attendu** : la 7ᵉ voie d'un grimpeur est refusée ; la correction
  d'une voie déjà saisie reste possible.

### CT-09 — Non-régression enfant et ado (couvre : R34) `[mixte]`

- **Étapes** :
  1. Créer une rencontre **ado** : sa structure est celle du gabarit ado
     (vitesse « Filles », « Garçons », barème 60 → 10).
  2. Saisir une zone sur une voie ado (admin ou coach) : acceptée ; une 7ᵉ voie
     ado : refusée.
  3. Local : suites `test:resultats`, `test:enregistrement`, `test:points-vitesse`
     et E2E complète.
- **Résultat attendu** : comportement inchangé.

### CT-10 — Retour arrière en recette (couvre : R35) `[manuel]`

- **Rôle / compte** : `postgres` (SQL Editor recette).
- **Pré-condition** : au moins une rencontre adulte créée (CT-02).
- **Étapes** :
  1. Exécuter
     `supabase/retours-arriere/202610231000_categorie_adulte_retour_arriere.sql`.
  2. Contrôler :

     ```sql
     select count(*) from interclub.rencontre where categorie = 'adulte';
     select count(*) from interclub.gabarit_epreuve where categorie = 'adulte';
     select pg_get_constraintdef(oid) from pg_constraint where conname = 'rencontre_categorie_check';
     select count(*) from interclub.version where version = '202610231000_categorie_adulte';
     ```

  3. Ouvrir une rencontre enfant et une rencontre ado, saisir un résultat.
  4. Réappliquer la migration (CT-01) pour poursuivre la recette.
- **Résultat attendu** : 0 rencontre adulte, 0 épreuve de gabarit adulte,
  contrainte `('enfant', 'ado')`, 0 ligne de version ; enfant et ado
  fonctionnent normalement. Avec le code de `develop` (sans la catégorie adulte),
  l'application fonctionne aussi sur la base migrée (R34).

## Couverture hors cahier

- R2, R3 (éligibilité dès 16 ans), R23 (issues proposées), R33 (rapport) et la
  normalisation du libellé (R9bis) : Vitest (`rencontre.test.ts`,
  `resultat.test.ts`, `rapport.test.ts`, `voie.test.ts`).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-02, CT-04, CT-05, CT-06 (étapes 1–2) | ✅ | E2E `categorie-adulte.spec.ts` 4/4 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-07, CT-08 | ✅ | `npm run test:adulte` 11/11 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-01, CT-10 (base locale) | ✅ | aller → retour → aller identique à la référence |
| | | | CT-01 → CT-10 (recette) | | |
