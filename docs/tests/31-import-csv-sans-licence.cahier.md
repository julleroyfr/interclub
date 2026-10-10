# Cahier de test : Import CSV sans licence — format Marsas (spec #18)

- **Spec de référence** : `docs/specs/18-import-csv-sans-licence-marsas.md`
  (+ spec #3 R21c / R26 pour la licence générée dans l'écran Grimpeurs).
- **Pré-requis** :
  - Migration **`202610101000_import_csv_sans_licence`** appliquée à la main
    (recette) : colonne dérivée `grimpeur.licence_generee`, fonctions
    `interclub.forme_comparable(text)` et
    `interclub.importer_grimpeurs_csv(uuid, jsonb)`.
  - Migrations antérieures appliquées (`grimpeur.sexe`, `grimpeur.licence`,
    extension `unaccent` — `202609251200`).
  - Un **compte admin**, un **compte coach**, et pouvoir tester **non connecté**.
  - Le club **Marsas** existe (le créer depuis `/admin/clubs` si besoin).
  - **Fichiers réels** (non versionnés, ignorés par git) :
    `docs/listing marsas.csv` (brut) et `docs/listing marsas - corrige.csv`.
- **Environnement** : recette (preview) — version/commit : `______`

## Jeu de données initial

- Club **Marsas** **sans grimpeur** (pour observer créés vs déjà présents).
- **Fichiers de test** :
  - **F-BRUT** : `listing marsas.csv` — 102 lignes, 1 doublon exact (ARNAUD
    Roméo, l. 4–5), 2 prénoms à accent perdu (l. 8 et 47).
  - **F-CORRIGE** : `listing marsas - corrige.csv` — 101 lignes propres.
  - **F-ENTETES** : un `.csv` dont la 1ʳᵉ ligne est `NOM,PRENOM,QUALITE,DATNAISS`.
  - **F-TXT** : n'importe quel fichier `.txt`.
  - **F-ERREURS** : un `.csv` avec en-têtes corrects et une ligne par erreur :
    `MLLE,...` ; nom vide ; `DATNAISS` = `12/08/2012` ; `DATNAISS` = `2012-02-30`.

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@…` | administrateur | déroule l'import (R1) |
| `coach@…` | coach | vérifie le refus (R1) |
| — | non connecté | vérifie la redirection / 404 (R1) |

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre : R1)

- **Rôle / compte** : coach, puis non connecté.
- **Étapes** : aller directement sur `/admin/grimpeurs/import-csv`.
- **Résultat attendu** : le coach obtient un **404** ; le non-connecté est
  renvoyé vers la connexion. Aucun écran d'import visible.
- **RLS / sécurité** : voir CT-09 (appel direct de la RPC).

### CT-02 — Accès depuis l'import FFME (couvre : R2)

- **Rôle** : admin.
- **Étapes** : ouvrir `/admin/grimpeurs/import` → lien **« Importer un CSV sans
  licence → »** → le suivre.
- **Résultat attendu** : l'écran `/admin/grimpeurs/import-csv` s'affiche, avec la
  liste déroulante **Club cible** (option vide « — Choisir un club — ») et le
  champ fichier `.csv`. L'import FFME `.xlsx` reste inchangé.

### CT-03 — Refus sans traitement (couvre : R3, R4, R6)

- **Rôle** : admin.
- **Étapes** :
  1. Sans choisir de club, tenter de lancer l'import (le navigateur bloque) ;
  2. club Marsas + **F-TXT** → lancer ;
  3. club Marsas + **F-ENTETES** → lancer.
- **Résultat attendu** : (1) club obligatoire ; (2) « Le fichier doit être au
  format .csv. » ; (3) « En-têtes inattendus : la première ligne doit être
  QUALITE, NOM, PRENOM, DATNAISS. ». Aucun compte-rendu, **aucun grimpeur créé**.

### CT-04 — Premier import du fichier brut (couvre : R5, R8, R8b, R10–R12, R14, R17 ; scénario nominal)

- **Rôle** : admin. **Pré-condition** : Marsas sans grimpeur.
- **Étapes** : club **Marsas** + **F-BRUT** → **Lancer l'import**.
- **Résultat attendu** :
  - compte-rendu « club **Marsas** · année de référence **2027** · seuil
    **2009** · **102** lignes » ;
  - **Créés : 99**, **Déjà présents : 0**, **Ignorés (hors âge) : 0**, **Lignes
    en erreur : 2** ;
  - « 1 doublon dans le fichier … ARNAUD ROMEO (L. 4) » ;
  - tableau d'erreurs : **L. 8** BARRA et **L. 47** GERVASONI, raison « Prénom :
    caractère illisible (accent perdu), corriger le fichier. ».
- **Contrôle SQL** (SQL Editor) :
  `select count(*), min(licence), max(licence), bool_and(licence_generee)
  from interclub.grimpeur g join interclub.club c on c.id = g.club_id
  where c.nom = 'Marsas';` → `99`, licences **consécutives** à partir de
  `2000000000` (ou de la plus grande licence générée existante + 1), `true`.

### CT-05 — Ré-import avec le fichier corrigé (couvre : R13 ; scénario ré-import)

- **Rôle** : admin. **Pré-condition** : CT-04 fait.
- **Étapes** :
  1. club Marsas + **F-CORRIGE** → lancer ;
  2. relancer une seconde fois le même **F-CORRIGE**.
- **Résultat attendu** :
  1. **Créés : 3** (CLÉOPHÉE BARRA, NOÉMIE GERVASONI, et L'HOSTIS Gabin — nom et
     prénom remis dans l'ordre, donc identité différente de la fiche « GABIN
     L’HOSTIS » créée en CT-04), **Déjà présents : 98**, aucune erreur ;
  2. **Créés : 0**, **Déjà présents : 101**. Aucune licence nouvelle, aucune
     fiche modifiée (les libellés en base sont inchangés).
- **Note** : la fiche « GABIN L’HOSTIS » issue de CT-04 est à **supprimer** depuis
  l'écran Grimpeurs après ce cas (hors périmètre de l'import, spec #18).

### CT-06 — Forme comparable : tirets, apostrophes, accents (couvre : R9)

- **Rôle** : admin.
- **Étapes** : importer dans Marsas un `.csv` avec
  `MME,Robin Brosse,Céleste,2021-07-04` et `M,L'HOSTIS,GABIN,2021-09-01`.
- **Résultat attendu** : **Créés : 0**, **Déjà présents : 2** (rapprochés de
  `ROBIN-BROSSE CELESTE` et `L'HOSTIS GABIN`). Contrôle SQL :
  `select interclub.forme_comparable('L’Hostis-Robin Léa');` → `L HOSTIS ROBIN LEA`.

### CT-07 — Rapprochement limité au club cible ; ambiguïté (couvre : R13)

- **Rôle** : admin.
- **Étapes** :
  1. importer une ligne d'un grimpeur de Marsas (ex. `M,AITA,HUGO,2012-08-12`)
     en choisissant **un autre club** ;
  2. dans Marsas, créer à la main un 2ᵉ grimpeur `AITA Hugo`, 2012, Homme, licence
     quelconque, puis réimporter `M,AITA,HUGO,2012-08-12` dans Marsas.
- **Résultat attendu** : (1) **Créés : 1** dans l'autre club (pas de rapprochement
  inter-clubs) ; (2) **Créés : 0**, **Déjà présents : 0**, ligne en erreur
  « Rapprochement ambigu : 2 grimpeurs du club correspondent. ».
- **Nettoyage** : supprimer les deux fiches créées.

### CT-08 — Indicateur dérivé et vraie licence (couvre : R15, spec #3 R21c)

- **Rôle** : admin.
- **Étapes** : sur un grimpeur Marsas importé, **Modifier** → remplacer la licence
  par un vrai numéro (ex. `918273`) → **Enregistrer** ; puis réimporter
  **F-CORRIGE**.
- **Résultat attendu** : `licence_generee` = `false` pour ce grimpeur (SQL), la
  mention « générée » disparaît ; au ré-import il est **déjà présent** (licence
  `918273` conservée).

### CT-09 — RPC réservée à l'admin (couvre : R1 ; sécurité)

- **Rôle** : coach, puis anon.
- **Étapes** : appeler directement `POST /rest/v1/rpc/importer_grimpeurs_csv`
  (schéma `interclub`) avec un jeton coach, puis avec la seule clé anon.
- **Résultat attendu** : coach → erreur `acces_refuse` ; anon → 401 (pas
  d'EXECUTE). **Aucune** écriture.

### CT-10 — Club inexistant, atomicité (couvre : R16)

- **Rôle** : admin.
- **Étapes** : appeler la RPC avec un `p_club_id` inexistant
  (`00000000-0000-0000-0000-000000000000`).
- **Résultat attendu** : erreur `club_introuvable`, aucune écriture. (À l'écran,
  supprimer le club entre l'affichage et l'envoi → « Le club choisi est
  introuvable. ».)

### CT-11 — Mention « générée » dans la liste (couvre : spec #3 R26)

- **Rôle** : admin.
- **Étapes** : `/admin/grimpeurs`, filtrer sur Marsas.
- **Résultat attendu** : chaque grimpeur importé affiche « licence 2000000xxx »
  suivi de la pastille **« générée »** (ambre). Lisible sur téléphone.

### CT-12 — Plage réservée refusée à la saisie (couvre : spec #3 R21c)

- **Rôle** : admin.
- **Étapes** :
  1. ajouter un grimpeur avec la licence `2000000000` ;
  2. modifier un grimpeur importé en changeant **seulement** son prénom ;
  3. modifier un grimpeur importé avec une **autre** licence de la plage
     (`2147483000`).
- **Résultat attendu** : (1) et (3) refusés « Les numéros à partir de
  2 000 000 000 sont réservés aux licences générées par l'import. » ; (2)
  accepté (la licence générée est conservée).

### CT-13 — Migration appliquée (couvre : contraintes de données)

- **Étapes** (SQL Editor recette) :
  `select version from interclub.version where version = '202610101000_import_csv_sans_licence';`
  puis `\d interclub.grimpeur` (ou Table Editor).
- **Résultat attendu** : la version est présente ; `licence_generee` est une
  colonne **générée** (`generated always as (licence >= 2000000000) stored`).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-10-10 | Playwright e2e | `feature/import-csv-marsas` (local) | CT-01, CT-02, CT-03, CT-04/05 (fichier synthétique), CT-11, CT-12 | ✅ | `e2e/import-csv-sans-licence.spec.ts` (5 tests) |
| 2026-10-10 | `scripts/test-import-csv.sh` | `feature/import-csv-marsas` (local) | CT-04 → CT-10 (RPC) | ✅ | 18 contrôles OK |
| 2026-10-10 | agent | `feature/import-csv-marsas` (local) | CT-04/05 analyse des fichiers réels | ✅ | brut : 99 à importer / 1 doublon / 2 erreurs ; corrigé : 101 / 0 / 0 |
| | | | CT-04 → CT-13 | ✅ / ❌ | recette, fichiers réels |
