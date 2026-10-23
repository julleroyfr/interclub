# Cahier de test : Catégorie adulte (spec #20)

- **Spec de référence** : `docs/specs/20-categorie-adulte.md`
- **Périmètre actuel** : **lot 1** — catégorie et gabarit (R1–R4, R6–R9,
  R9bis, R22, R24, R26 côté base, R33, R34/R35) ; **lot 2** — import sans
  limite d'âge (R5) ; **lot 3** — équipes adultes (R10–R15, R28 côté écran
  juge) ; **lot 4** — top en moulinette (R23, R25, R26) ; **lot 5** — jeton
  capitaine (R16–R21, R20bis) et libellé de voie sur l'écran juge (R9bis). Le
  lot 6 (classement sans club) complétera ce cahier.
- **Pré-requis** :
  - Migrations **`202610231000_categorie_adulte`**,
    **`202610231100_equipes_adultes`**, **`202610231200_top_moulinette`** puis
    **`202610231300_jeton_capitaine`** appliquées à la main, dans cet ordre
    (recette seulement tant que la branche n'est pas fusionnée).
  - Scripts de retour arrière disponibles dans `supabase/retours-arriere/`, à
    exécuter dans l'**ordre inverse** (lot 5, lot 4, lot 3, puis lot 1).
- **Environnement** : local, puis recette (preview `feature/categorie-adulte`) —
  version/commit : `______`
- **Validé en local le 2026-10-23** : `npm run db:verifier-retours --
  202610231000_categorie_adulte 202610231100_equipes_adultes
  202610231200_top_moulinette` — chaque retour arrière (ordre inverse) ramène
  à l'état antérieur exact (empreinte du schéma, aux fins de ligne près), rejeu
  idempotent, `db reset` final identique ; `db:verifier`, suites SQL,
  `npm run test:adulte` 24/24, E2E `categorie-adulte.spec.ts` 8/8.

Légende : `[auto]` rejoué par un test automatisé, `[manuel]` à dérouler à la
main, `[mixte]` partie automatisée + vérification à l'œil.

## Jeu de données initial

- Recette : le seed (`JD-ADMIN`, `JD-COACH-A`, `JD-CLUB-A`, `JD-CLUB-B`,
  `JD-ADULTES`). Local : seed `01`.
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

### CT-11 — Import des licenciés FFME sans limite d'âge (couvre : R5) `[manuel]`

- **Rôle / compte** : `JD-ADMIN`.
- **Étapes** : `/admin/grimpeurs/import`, déposer un export FFME contenant au
  moins un adulte (né avant 2000) et un enfant.
- **Résultat attendu** : les deux sont créés ; le compte-rendu affiche Créés,
  Mis à jour, Lignes en erreur, sans « Ignorés (hors âge) » ni année de
  référence. Détail : cahier 24 CT-04/CT-05.

### CT-12 — Import CSV sans licence, sans limite d'âge (couvre : R5) `[auto]`

- **Étapes** : E2E `import-csv-sans-licence.spec.ts` (CT-04/05 du cahier 31).
- **Résultat attendu** : le grimpeur né en 2001 du fichier est créé ; aucun
  compteur « ignorés ».

### CT-13 — L'admin compose une équipe adulte inter-clubs (couvre : R10, R11, R12, R14) `[auto]`

- **Rôle / compte** : `JD-ADMIN`, rencontre adulte de CT-02 en ①.
- **Étapes** :
  1. Tableau de bord de la rencontre : panneau **« Équipes adultes »** ; le
     panneau **Prêts** et le compteur « Prêts » sont absents.
  2. Nouvelle équipe : le nom proposé est **« Équipe 1 »** → **Créer**.
  3. Ajouter Lucie Echo et Karim Echo (Club A), Sarah Foxtrot et Emma Foxtrot
     (Club B).
- **Résultat attendu** : chaque membre affiche son club ; compteur **4/4** et
  « Équipe complète » ; plus de formulaire d'ajout. En base, l'équipe n'a pas de
  club.

### CT-14 — 5ᵉ grimpeur, moins de 16 ans, double composition refusés (couvre : R2, R12, R13) `[mixte]`

- **Étapes** :
  1. Local : `npm run test:adulte`, assertions `R12-*` (5ᵉ grimpeur refusé en
     base).
  2. Recette : dans « Équipe 2 », chercher un enfant du seed (ex. « Ana ») :
     il n'est pas proposé (roster des 16 ans et plus).
  3. Un grimpeur déjà dans « Équipe 1 » n'est pas proposé pour « Équipe 2 ».
- **Résultat attendu** : refus en base ; aucun grimpeur de moins de 16 ans ni
  déjà composé dans la liste.

### CT-15 — Changer un grimpeur d'équipe adulte (couvre : R11, R12) `[auto]`

- **Étapes** : créer « Équipe 2 », y ajouter Inès Foxtrot ; dans « Équipe 1 »,
  « Changer Karim Echo d'équipe » → « Équipe 2 ».
- **Résultat attendu** : Karim apparaît dans « Équipe 2 » ; « Équipe 1 » passe à
  3/4. Une équipe complète est proposée mais désactivée.

### CT-16 — Le coach n'a aucun droit sur les équipes adultes (couvre : R10) `[mixte]`

- **Rôle / compte** : `JD-COACH-A`.
- **Étapes** :
  1. Ouvrir la rencontre adulte depuis « Mes rencontres ».
  2. Local : `npm run test:adulte`, assertions `R10-*`.
- **Résultat attendu** : message « Rencontre adulte : les équipes […] sont
  créées et composées par l'administrateur » ; aucun formulaire. En base, le
  coach ne peut ni créer d'équipe (avec ou sans club) ni composer.

### CT-17 — Écran juge : les adultes apparaissent avec leur club (couvre : R28) `[mixte]`

- **Pré-condition** : rencontre adulte en ③, équipes de CT-13/CT-15, jeton
  juge de la « Voie 1 ».
- **Étapes** : scanner le jeton juge, consulter la liste des grimpeurs.
- **Résultat attendu** : les grimpeurs adultes sont listés, chacun avec son
  club d'origine (Club A ou Club B). Local : `npm run test:adulte`, assertion
  `R28-*`.

### CT-18 — Saisir un top en moulinette (couvre : R23, R25) `[auto]`

- **Rôle / compte** : `JD-ADMIN`, rencontre adulte en ③, équipes de CT-13.
- **Étapes** : saisie admin → Lucie Echo → « Ajouter une voie » T5 (6a) →
  bouton **Top en moulinette**.
- **Résultat attendu** : les issues proposées sont Top, Top en moulinette,
  Zone 2, Zone 1, Échec ; la voie affiche la pastille ambre « Top en
  moulinette » ; le score de Lucie vaut **6** (top 12 ÷ 2).

### CT-19 — Top en moulinette refusé hors adulte (couvre : R26) `[auto]`

- **Étapes** : `npm run test:adulte`, assertions `R26-top-moulinette-*` et
  `R23-*` ; à l'écran, une rencontre ado ne propose pas « Top en moulinette ».
- **Résultat attendu** : la base refuse `top_moulinette` sur une voie enfant
  ou ado et toute issue inconnue.

### CT-20 — L'admin génère le jeton capitaine d'une équipe (couvre : R16, R20) `[auto]`

- **Rôle / compte** : `JD-ADMIN`, rencontre adulte avec « Équipe 1 ».
- **Étapes** : Jetons QR → la rencontre adulte → section **« Capitaines
  d'équipe »** → carte « Équipe 1 » → **Générer le jeton**.
- **Résultat attendu** : QR affiché, avec **Régénérer** et **Révoquer** ; la
  section « Coach temporaire » est absente ; les jetons juge portent le libellé
  de leur voie (R9bis).
- **RLS / sécurité** : local `npm run test:adulte`, assertions `R16-*` et
  `R20-*` : deuxième jeton actif pour la même équipe, jeton avec club, jeton sur
  une équipe enfant ou d'une autre rencontre → refusés.

### CT-21 — Session capitaine : son équipe seulement, en ③ (couvre : R17, R18, R19) `[auto]`

- **Rôle / compte** : appareil sans session (navigation privée).
- **Pré-condition** : rencontre en ③, jeton de CT-20.
- **Étapes** : scanner le QR (ou ouvrir l'URL `/scan?jeton=…`).
- **Résultat attendu** : arrivée sur **`/capitaine`** (« capitaine de « Équipe 1
  » ») ; seuls les membres de l'Équipe 1 sont listés ; la vitesse est en lecture
  seule ; « Voir le classement » ouvre `/capitaine/classement`.

### CT-22 — Le capitaine saisit voies et blocs ; l'auteur est « capitaine » (couvre : R18, R20bis, R21) `[auto]`

- **Étapes** : Sarah Foxtrot → « Ajouter une voie » T3 → **Top** ; puis un
  palier de bloc.
- **Résultat attendu** : résultat enregistré, score à jour ; en base,
  `auteur_role = 'capitaine'`. Local : `npm run test:adulte`, assertions
  `R18-*`, `R20bis-*`.

### CT-23 — Hors de son périmètre : refusé (couvre : R17, R18) `[mixte]`

- **Étapes** (local, `npm run test:adulte`) : saisie pour un grimpeur d'une
  autre équipe, temps de vitesse, composition d'équipe → refusés ; en recette,
  ouvrir `/coach`, `/admin` ou `/juge` avec la session capitaine.
- **Résultat attendu** : refus en base ; les espaces coach, admin et juge
  renvoient 404.

### CT-24 — Fin de session : hors ③ ou jeton révoqué (couvre : R17) `[auto]`

- **Étapes** : révoquer le jeton (ou passer la rencontre en ④), recharger
  `/capitaine`.
- **Résultat attendu** : 404 ; plus aucune écriture possible (assertions
  `R17-*`). Un QR capitaine scanné en ② n'ouvre aucune session.

### CT-25 — Écran juge : libellé de la voie (couvre : R9bis) `[manuel]`

- **Étapes** : renommer la « Voie 1 » d'une rencontre adulte (CT-04), passer
  en ③, scanner le jeton juge de cette voie.
- **Résultat attendu** : l'en-tête de l'écran juge affiche le libellé (« Voie 1
  — dalle ») au lieu de « couloir 1 ».

## Couverture hors cahier

- R2, R3 (éligibilité dès 16 ans), R23 (issues proposées), R33 (rapport) et la
  normalisation du libellé (R9bis) : Vitest (`rencontre.test.ts`,
  `resultat.test.ts`, `rapport.test.ts`, `voie.test.ts`).
- R11–R14 (plafond 4, double composition, nom « Équipe N », changement
  d'équipe) : Vitest (`engagement.test.ts`).
- R16 (périmètre et gestion d'un jeton capitaine), R17 (redirection du scan)
  et file hors ligne par équipe : Vitest (`jeton-qr.test.ts`,
  `session-qr.test.ts`, `hors-ligne.test.ts`).
- R25 (moitié du top, arrondi supérieur, pas de zone ; exemple 8 + 12 + 5 = 25)
  et R23/R26 (issues proposées et admises) : Vitest (`score.test.ts`,
  `resultat.test.ts`).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-02, CT-04, CT-05, CT-06 (étapes 1–2) | ✅ | E2E `categorie-adulte.spec.ts` 4/4 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-07, CT-08 | ✅ | `npm run test:adulte` 11/11 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-01, CT-10 (base locale) | ✅ | aller → retour → aller identique à la référence |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-12 | ✅ | E2E `import-csv-sans-licence.spec.ts` 5/5 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-13, CT-15, CT-16 (étape 1) | ✅ | E2E `categorie-adulte.spec.ts` 7/7 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-14 (1), CT-16 (2), CT-17 (base) | ✅ | `npm run test:adulte` 21/21 ; retour arrière lot 3 identique à l'état lot 1 |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-18, CT-19 | ✅ | E2E 8/8 ; `test:adulte` 24/24 ; `db:verifier-retours` lots 1, 3, 4 ✅ |
| 2026-10-23 | agent (local) | feature/categorie-adulte | CT-20, CT-21, CT-22, CT-24 | ✅ | E2E `categorie-adulte.spec.ts` 10/10 ; `test:adulte` 41/41 |
| | | | CT-01 → CT-25 (recette) | | |
