# Cahier de test : Surclassement enfant → ado (spec #21)

- **Spec de référence** : `docs/specs/21-surclassement.md` (validée le
  2026-11-07) ; révisions spec #1 R34/R35, #3 R26, #5 R12.
- **Maquette** : `docs/maquettes/surclassement.html`.
- **Pré-requis** :
  - Migration **`202611071100_surclassement`** appliquée à la main (recette
    seulement tant que la branche `feature/surclassement` n'est pas fusionnée).
  - Retour arrière disponible :
    `supabase/retours-arriere/202611071100_surclassement_retour_arriere.sql`.
  - Variables `AGE_BASCULE` (12) et `AGE_ADO_MAX` (18) configurées (spec #1
    R34bis).
- **Environnement** : local, puis recette (preview `feature/surclassement`) —
  version/commit : `______`
- **Validé en local le 2026-11-07** : `npm run db:verifier-retours --
  202611071100_surclassement` (retour arrière = état antérieur, rejeu
  idempotent, `db reset` final identique) ; `npm run db:verifier` ;
  `npm run test:surclassement` 30/30 ; E2E `surclassement.spec.ts` 1/1 ;
  non-régression E2E engagement coach, équipes et prêts admin, intégrité,
  temps réel, sécurité 42/42 ; Vitest 698/698.

Légende : `[auto]` rejoué par un test automatisé, `[manuel]` à dérouler à la
main, `[mixte]` partie automatisée + vérification à l'œil.

## Jeu de données initial

- Recette : le seed (`JD-ADMIN`, `JD-COACH-A`, `JD-CLUB-A`, `JD-CLUB-B`). Local :
  seed `01`.
- Un grimpeur **enfant** du Club A né en **2015** (11 ans en 2026–2027), non
  surclassé, par exemple « Tom SURCLASSE ».
- Une rencontre **ado** du Club A en **① pré-compétition** datée de la saison
  2026–2027 (ex. 2026-12-05), avec une équipe du Club A.
- Pour CT-06 : une rencontre ado de la saison en **⑤ résultats publics** où le
  grimpeur a concouru, avec des résultats saisis.

Les tests automatisés créent puis suppriment leurs propres données (grimpeurs
`21…`, rencontres `21…`, club « Club test surclassement »).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` (`JD-ADMIN`) | administrateur | accorde et révoque le surclassement |
| `coach@test.local` (`JD-COACH-A`) | coach permanent Club A | voit le badge, engage le surclassé ; négatif : aucune action de surclassement |
| `postgres` (SQL Editor) | administrateur base | migration, contrôles SQL, retour arrière |

## Cas de test

### CT-01 — Surclasser un enfant pour la saison courante (couvre : R1, R2, R3, R18) `[auto]`

- **Rôle / compte** : admin.
- **Pré-condition** : le grimpeur né en 2015 n'est pas surclassé.
- **Étapes** :
  1. Coach : ouvrir l'engagement de la rencontre ado ① ; vérifier que le
     grimpeur n'est **pas** proposé à l'ajout.
  2. Admin : `/admin/grimpeurs`, rechercher le grimpeur, cliquer
     **Surclasser**.
  3. Vérifier que la saison proposée par défaut est **2026–2027 (saison
     courante)**, et que 2027–2028 est aussi proposée.
  4. Cliquer **Confirmer le surclassement**.
- **Résultat attendu** : message « Tom SURCLASSE est surclassé en ado pour la
  saison 2026–2027. » ; badge **« Surclassé ado 2026–2027 »** à côté du nom ;
  le bouton **Surclasser** disparaît : en 2027–2028, un grimpeur né en 2015
  aura 12 ans (pivot, déjà éligible ado). Pour un grimpeur né en 2016, il
  reste proposé pour 2027–2028 seulement.
- **Automatisé** : E2E `surclassement.spec.ts`.

### CT-02 — Le coach voit et engage le surclassé en ado (couvre : R7, R20) `[auto]`

- **Rôle / compte** : coach Club A.
- **Étapes** :
  1. Ouvrir l'engagement de la rencontre ado ①.
  2. Dans la liste d'ajout, choisir « Tom Surclasse · surclassé », puis
     **Ajouter à l'équipe**.
- **Résultat attendu** : le grimpeur est proposé avec la mention
  « · surclassé » ; une fois ajouté, il porte le badge **SURCLASSÉ** dans la
  composition. Dans une rencontre **enfant**, il reste proposé, **sans** badge.
- **RLS / sécurité** : le coach n'a ni bouton ni écran pour surclasser (R1,
  cf. CT-10).
- **Automatisé** : E2E `surclassement.spec.ts` (ado) ; badge absent en enfant :
  Vitest `assemblage-engagement.test.ts`.

### CT-03 — Confirmation de révocation (couvre : R15) `[auto]`

- **Rôle / compte** : admin.
- **Pré-condition** : CT-02 fait (grimpeur engagé dans la rencontre ado ①).
- **Étapes** : sur la ligne du grimpeur, cliquer **Révoquer le surclassement**.
- **Résultat attendu** : la confirmation annonce « Tom sera retiré(e) de ces
  rencontres ado à venir : 05/12/2026 — Club A, équipe « … » ». Sans
  engagement ado à venir, elle affiche « Aucun engagement ado à venir. ».
- **Automatisé** : E2E `surclassement.spec.ts` (avec engagement).

### CT-04 — Révocation : retrait des rencontres ado ①/② et historique (couvre : R11, R12, R19) `[auto]`

- **Rôle / compte** : admin.
- **Étapes** :
  1. Dans la confirmation de CT-03, cliquer **Oui, révoquer**.
  2. Ouvrir **Historique des surclassements**.
- **Résultat attendu** : message « Surclassement révoqué. Tom SURCLASSE a été
  retiré de 1 rencontre ado à venir. » ; le badge disparaît ; le grimpeur n'est
  plus dans l'équipe de la rencontre ado ① ; l'historique montre la saison
  2026–2027 avec sa date d'accord et sa date de révocation.
- **Automatisé** : E2E `surclassement.spec.ts`.

### CT-05 — Après révocation : plus proposé au coach, nouvel accord possible (couvre : R11, R21) `[auto]`

- **Étapes** :
  1. Coach : rouvrir l'engagement de la rencontre ado ①.
  2. Admin : vérifier que **Surclasser** est de nouveau proposé.
- **Résultat attendu** : (1) le grimpeur n'est plus proposé à l'ajout. (2) le
  bouton est présent ; un nouvel accord ajoute une 2ᵉ ligne à l'historique
  (cf. CT-14).
- **Automatisé** : E2E `surclassement.spec.ts`.

### CT-06 — Un révoqué reste dans les résultats et classements de la rencontre disputée (couvre : R13, R16) `[manuel]`

- **Rôle / compte** : admin, puis coach Club A.
- **Pré-condition** : grimpeur surclassé, ayant concouru dans une rencontre ado
  en **⑤ résultats publics** (résultats de voie, bloc et vitesse saisis), et
  engagé dans une autre rencontre ado en ①.
- **Étapes** :
  1. Noter son rang et ses points dans le classement individuel ado de la
     rencontre ⑤, ainsi que le score de son équipe et de son club.
  2. Révoquer son surclassement (la confirmation n'annonce que la rencontre ①).
  3. Rouvrir le classement de la rencontre ⑤ (admin et coach), l'export PDF et
     l'écran de contrôle.
- **Résultat attendu** : le grimpeur apparaît toujours, au même rang, avec les
  mêmes points ; les scores équipe et club sont inchangés ; il apparaît sans
  badge ; seule la rencontre ① a perdu ce grimpeur.

### CT-07 — Révocation pendant une rencontre en cours (couvre : R13, R17) `[manuel]`

- **Pré-condition** : grimpeur surclassé engagé dans une rencontre ado en **③
  compétition**.
- **Étapes** :
  1. Admin : révoquer le surclassement.
  2. Coach : saisir ou corriger un résultat de voie du grimpeur dans cette
     rencontre.
- **Résultat attendu** : la confirmation n'annonce pas cette rencontre ; le
  grimpeur reste engagé ; la saisie est acceptée.
- **Couverture automatique partielle** : conservation en ③ vérifiée par
  `npm run test:surclassement` (CT-13).

### CT-08 — Surclassé côté admin : équipes et prêts (couvre : R9) `[manuel]`

- **Rôle / compte** : admin.
- **Pré-condition** : grimpeur du Club B surclassé pour la saison.
- **Étapes** :
  1. Tableau de bord d'une rencontre ado en ①, panneau **Prêts** : prêter le
     grimpeur au Club A.
  2. Coach Club A : vérifier qu'il est proposé avec « (prêté · Club B) ·
     surclassé ».
  3. Admin, panneau **Équipes** : l'ajouter à une équipe du Club B d'une autre
     rencontre ado, puis révoquer le surclassement.
- **Résultat attendu** : (1) il est proposé au prêt ; (2) il est proposé avec
  les deux mentions ; (3) la confirmation annonce le prêt (« prêt supprimé »)
  et l'équipe ; après révocation, prêt et composition ont disparu.
- **Couverture automatique partielle** : suppression du prêt par la RPC
  vérifiée par `npm run test:surclassement` (CT-13).

### CT-09 — Pas de surclassement pour le pivot ni pour un ado (couvre : R3, R8) `[manuel]`

- **Rôle / compte** : admin.
- **Étapes** :
  1. Rechercher un grimpeur né en **2014** (pivot) et un né en **2012**.
  2. Ouvrir une rencontre **adulte** en ① avec un grimpeur surclassé.
- **Résultat attendu** : (1) aucun bouton **Surclasser** sur ces deux lignes.
  (2) le surclassé n'est pas proposé dans les équipes adultes.
- **Domaine** : Vitest `surclassement.test.ts` (R3, R8 ; messages de refus).

### CT-10 — Écriture réservée à l'admin (couvre : R1) `[auto]`

- **Étapes** (appels PostgREST directs) : un coach puis un anonyme insèrent une
  ligne `surclassement` ; un coach appelle `revoquer_surclassement`.
- **Résultat attendu** : refus (HTTP 403 / 401, `acces_refuse`) ; aucune ligne
  écrite ; l'admin, lui, crée la ligne (201).
- **Automatisé** : `npm run test:surclassement`.

### CT-11 — Un seul surclassement actif par saison (couvre : R4, R5) `[auto]`

- **Résultat attendu** : un second accord pour la même saison est refusé
  (conflit 409, message « Ce grimpeur est déjà surclassé pour cette saison. »
  à l'écran) ; un accord pour une autre saison est accepté.
- **Automatisé** : `npm run test:surclassement`.

### CT-12 — Lecture des surclassements (RLS) `[auto]`

- **Résultat attendu** : le coach du Club A voit les surclassements des
  grimpeurs de son club et d'un grimpeur **prêté** à son club ; il ne voit pas
  ceux d'un grimpeur d'un autre club sans prêt ; l'admin voit tout.
- **Automatisé** : `npm run test:surclassement`.

### CT-13 — Révocation en base : périmètre des retraits (couvre : R12, R13, R14, R15) `[auto]`

- **Résultat attendu** : la RPC renvoie le nombre de rencontres quittées ; le
  grimpeur est retiré des rencontres ado de la saison en ① et ② (compositions
  et prêts) ; il reste engagé en ③, en ⑤, en enfant et sur une autre saison ;
  une seconde révocation renvoie `surclassement_introuvable`.
- **Automatisé** : `npm run test:surclassement`.

### CT-14 — Historique et nouvel accord (couvre : R11) `[auto]`

- **Résultat attendu** : après révocation, un nouvel accord pour la même saison
  est accepté et l'historique compte deux lignes ; la saison d'une ligne n'est
  pas modifiable (seule la date de révocation l'est, par la RPC).
- **Automatisé** : `npm run test:surclassement`.

### CT-15 — Éligible ado par l'âge : la révocation ne retire rien (couvre : R12) `[auto]`

- **Résultat attendu** : avec `p_retirer` = faux (âge de bascule abaissé depuis
  l'accord), aucune composition n'est retirée et la RPC renvoie 0.
- **Automatisé** : `npm run test:surclassement`.

### CT-16 — Migration et retour arrière en recette `[manuel]`

- **Rôle / compte** : `postgres` (SQL Editor recette).
- **Étapes** :
  1. Appliquer `202611071100_surclassement.sql`, puis la rejouer.
  2. Exécuter :

     ```sql
     select version from interclub.version where version = '202611071100_surclassement';
     select indexname from pg_indexes where tablename = 'surclassement';
     select has_function_privilege('anon',
       'interclub.revoquer_surclassement(uuid, int, boolean)', 'execute');
     ```

  3. En cas de retour arrière : exécuter
     `202611071100_surclassement_retour_arriere.sql`.
- **Résultat attendu** : (1) aucune erreur au rejeu. (2) une ligne de version ;
  index `uq_surclassement_actif` et `idx_surclassement_grimpeur_id` ; `false`
  pour anon. (3) table et fonction supprimées, ligne de version retirée.

## Couverture hors cahier

- R2 (saisons proposées), R3/R4 (refus et messages), R5, R7, R8, R11
  (surclassement actif), R12/R13 (sélection des retraits par phase, saison et
  catégorie), R15 (message accordé) : Vitest `src/domaine/surclassement.test.ts`.
- R7, R20, R21 dans l'assemblage de l'engagement (roster, prêtés, membres,
  badge absent en enfant et une fois révoqué) : Vitest
  `src/lib/coach/assemblage-engagement.test.ts`.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-11-07 | agent (local) | feature/surclassement | CT-10 → CT-15 | ✅ | `npm run test:surclassement` 30/30 |
| 2026-11-07 | agent (local) | feature/surclassement | CT-01 → CT-05 | ✅ | E2E `surclassement.spec.ts` 1/1 |
| 2026-11-07 | agent (local) | feature/surclassement | CT-16 (base locale) | ✅ | `db:verifier-retours` ✅, `db:verifier` ✅ |
| | | | CT-01 → CT-16 (recette) | | |
