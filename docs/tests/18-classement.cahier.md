# Cahier de test : Classement — individuel, équipe, club (spec #7)

> Couvre l'écran de **classement** d'une rencontre
> (`/coach/rencontres/[id]/classement`) : trois vues — **individuel** (séparé par
> sexe), **par équipe**, **par club** — calculées **au fil de l'eau** depuis les
> résultats saisis (spec #6) et le barème stocké (spec #3). Vérifie le calcul
> bout-en-bout, la **séparation par sexe** (R8b), les **ex æquo** (R8/R9), le
> **grimpeur prêté** (R7), la **lecture cross-club** (R11), la **décomposition**
> (R13), les outils de longue liste (R12b) et l'état **non officiel → officiel**
> (R10). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/07-classement.md` (R1–R13) ;
  `docs/specs/06-saisie-des-resultats.md` (source des issues) ;
  `docs/specs/01-roles-et-autorisations.md` (R8 visibilité, R10 phases).
- **Le calcul pur est couvert par Vitest** (`src/domaine/score.test.ts`, 28 tests,
  R1–R9 + agrégation vitesse). Ce cahier vérifie l'**assemblage cross-club** (loader
  `service_role`), la **RLS/visibilité** et l'**IHM** — non automatisables sans
  Supabase. L'intégration **vitesse** au score (barème, trigger, décompo) a son
  propre cahier : **21-vitesse-classement**.
- **Pré-requis** :
  - Migrations appliquées **jusqu'à `202609221600_points_vitesse_trigger` incluse**
    (prérequis R8b : `grimpeur.sexe` alimente les deux classements ; depuis la
    révision 2026-09-22 le classement **lit `points_vitesse`** — table créée par
    cette migration, sans quoi l'écran échoue). En local : `supabase db reset`.
  - `SUPABASE_SERVICE_ROLE_KEY` renseignée (assemblage cross-club, ADR 0002/0003).
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true` (session **coach
    temporaire** par QR, CT-12).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Réutilise le seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-RENCONTRE-ENFANT** (`33333333-…-3333`, phase `competition`), structure
  **JD-STRUCTURE-ENFANT** + **JD-BLOCS-ENFANT** (barème « Matin »).
- **JD-EQUIPE-A1** (Club A) = **JD-ANA-M2** (Ana, **F**, M2·M3·M4 moulinette) +
  **JD-BOB-T1** (Bob, **G**, T1·T2·T3 tête).
- **JD-EQUIPE-B1** (Club B) = **JD-CLEO-T2** (Cléo, **F**, T2·T3·T4 tête).
- **JD-PRETE-DEVI** (Devi, **G**, Club B, libre) pour le **prêt** (CT-07).

> Les grimpeurs portent désormais un **sexe** (seed) : Ana **F**, Bob **G**, Cléo
> **F**, Devi **G**. Les **résultats ne sont pas seedés** : chaque CT saisit ce
> dont il a besoin via l'écran de saisie (spec #6, cahier 17).

**Barème utile (Matin)** : M2 = 2, M3 = 3 (moulinette, pas de prise valorisée) ;
T1 = 5 / pv 3, T2 = 6 / pv 3, T3 = 7 / pv 4 ; B1 : 1er = 4, 2e = 3 ; B2 : 1er = 6,
2e = 5, 3e = 4.

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| JD-COACH-A (`coach@test.local`) | coach permanent Club A | Consulte le classement, saisit les résultats de son club, met « Mon club » en évidence |
| JD-JETON-COACHTEMP (scan QR) | **coach temporaire** Club A (session éphémère, rencontre enfant) | Consulte le classement de **sa** rencontre en lecture, tous clubs ; borné à sa rencontre (CT-12) |
| JD-ADMIN (`admin@test.local`) | admin | Change la phase (③↔④↔⑤, retour en ①), rattache le prêté |

> Le **coach temporaire** n'est pas un compte e-mail : c'est une **session par
> jeton QR** (scan de `http://localhost:3000/scan?jeton=<valeur>` avec la valeur
> `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`), déjà seedée (JD-JETON-COACHTEMP), liée
> au Club A et à la rencontre enfant `33333333`.

## Cas de test

### CT-01 — Accès & visibilité dès la ③ (couvre R11, R12)

- **Rôle** : coach A.
- **Étapes** :
  1. Choisir la rencontre enfant → on arrive sur l'écran de **saisie des
     résultats** ; cliquer **« Voir le classement → »** (à côté du badge de
     phase, visible dès la ③).
  2. Observer l'écran.
- **Résultat attendu** : l'écran affiche les **trois onglets** (Individuel /
  Par équipe / Par club), le badge de phase **Compétition** et le badge
  **● Non officiel**. L'individuel propose les sous-onglets **Filles / Garçons**.
- **RLS / sécurité** : (négatif R11) connecté **admin**, faire repasser la
  rencontre en **① pré-compétition** (`/admin/rencontres/[id]`), puis rouvrir le
  classement (coach) → message *« Le classement sera disponible dès l'ouverture de
  la compétition (③) »*, aucune ligne. **Rétablir** la ③ avant la suite.

### CT-02 — Score individuel & décomposition (couvre R1–R3, R13)

- **Pré-condition** : saisir pour **Ana** (résultats, spec #6) : **M2 = Top**,
  **M3 = Top**, **M4 = Échec**, **B1 = 1er essai**, **B2 = Échec**.
- **Étapes** :
  1. Onglet **Individuel → Filles**, repérer Ana.
  2. **Toucher** la ligne d'Ana.
- **Résultat attendu** :
  - Ligne Ana : **9 pts** (sous-texte **voie 5 · bloc 4 · vit 0**).
  - Décomposition (R13) : section **Voies** sous-total **5** — M2 `Top` 2, M3
    `Top` 3, M4 `Échec` 0 ; section **Blocs** sous-total **4** — B1 `1er essai` 4,
    B2 `Échec` 0 ; section **Vitesse** sous-total **0** — **« À saisir »** (aucun
    temps saisi ici) ; total **9**. *(La vitesse au score est détaillée dans le
    cahier 21.)*

### CT-03 — Au fil de l'eau (couvre R10)

- **Pré-condition** : CT-02 joué (Ana = 9).
- **Étapes** :
  1. Saisir pour Ana **M4 = Top** (au lieu d'Échec).
  2. Revenir au classement individuel Filles (recharger).
- **Résultat attendu** : Ana passe à **13 pts** (voie 5 → 9), le classement est
  **recalculé** ; le badge reste **Non officiel**.

### CT-04 — Séparation par sexe (couvre R8b, R12)

- **Pré-condition** : saisir pour **Bob** : **T1 = Top**, **T2 = Prise
  valorisée**, **T3 = Échec**, **B1 = 1er essai**.
- **Étapes** :
  1. Onglet **Individuel**, basculer **Filles** puis **Garçons**.
  2. Comparer les deux listes.
- **Résultat attendu** :
  - **Filles** : Ana (et Cléo si saisie) ; **Garçons** : **Bob = 12 pts**
    (voie 8 = T1 5 + T2 prise 3 ; bloc 4). Les **rangs repartent de 1** dans
    chaque liste ; un score de fille et un score de garçon **ne se comparent
    pas** (deux classements distincts).
  - Décomposition de Bob : T2 affiche l'issue **Prise valorisée** = 3 (R1).

### CT-05 — Ex æquo & ordre déterministe (couvre R8, R9)

- **Pré-condition** : saisir pour **Cléo** (Club B) de quoi **égaler Ana** :
  **T3 = Prise valorisée** (4) et **B2 = 2e essai** (5) → **9 pts**. (Ajuster si
  Ana a été modifiée en CT-03 : viser le **même total** qu'Ana.)
- **Étapes** :
  1. Onglet **Individuel → Filles**.
- **Résultat attendu** : Ana et Cléo à **score égal** partagent le **même rang**
  (ex. rang 1 ex æquo) ; l'affichage est **déterministe** — **Alpha** (Ana) avant
  **Bravo** (Cléo) par ordre de nom (R9) ; le rang suivant est **décalé** (saut de
  rang, R8).

### CT-06 — Classement par équipe et par club (couvre R5, R6, R8)

- **Pré-condition** : CT-02/CT-04/CT-05 joués (Ana, Bob, Cléo ont des scores).
- **Étapes** :
  1. Onglet **Par équipe**, puis **Par club**.
- **Résultat attendu** :
  - **Par équipe** : **A1** = score(Ana) + score(Bob) ; **B1** = score(Cléo).
    Chaque ligne montre le **club** et le **nombre de grimpeurs**.
  - **Par club** : **Club A** = score(A1) ; **Club B** = score(B1). Les totaux
    équipe/club **coïncident** avec la somme des scores individuels (mixtes, non
    séparés par sexe). Tri par score décroissant, rangs (R8).

### CT-07 — Grimpeur prêté (couvre R7)

- **Pré-condition** : connecté **admin**, **rattacher Devi** (Club B) et
  **l'ajouter à l'équipe A1** (accueil Club A) ; repasser la rencontre en ③ si
  besoin ; saisir quelques résultats pour **Devi** (ex. T1 = Top → via son groupe).
- **Étapes** :
  1. Onglet **Par équipe** : équipe **A1**.
  2. Onglet **Par club** : **Club A** et **Club B**.
  3. Onglet **Individuel → Garçons** : repérer **Devi**.
- **Résultat attendu** :
  - **A1** (accueil) **inclut** le score de Devi ; **Club A** aussi (R7 côté
    équipe/club).
  - **Club B** n'a **pas** les points de Devi (seul Cléo/B1 y contribue).
  - Au **classement individuel**, Devi figure sous son **club d'origine
    (Club B)** (libellé du club), score bien attribué (R7 côté individuel).

### CT-08 — Non officiel → Officiel (couvre R10)

- **Rôle** : admin puis coach.
- **Étapes** :
  1. Admin : passer la rencontre en **⑤ résultats publics**.
  2. Coach : rouvrir le classement.
- **Résultat attendu** : le badge bascule en **✓ Officiel**, la note indique
  **officiel et figé** ; les **valeurs sont identiques** (le calcul ne change pas,
  seul l'état change). **Rétablir** la ③ ensuite si d'autres CT suivent.

### CT-09 — Lecture cross-club (couvre R11)

- **Rôle** : coach A.
- **Étapes** :
  1. Onglet **Individuel → Filles** et onglet **Par club**.
- **Résultat attendu** :
  - Le coach du **Club A** voit **Cléo (Club B)** dans l'individuel et **Club B**
    dans la vue par club → l'assemblage porte sur **tous les clubs** (R11, via
    `service_role`).
  - Les grimpeurs du **Club A** (Ana, Bob) sont **mis en évidence** (liseré/fond)
    et le compteur indique « … de mon club en évidence ».
- **RLS / sécurité** :
  - (négatif) Un **coach temporaire** ouvrant le classement d'**une autre**
    rencontre que la sienne → **404** (borné à sa rencontre).
  - (hors périmètre) Le **visiteur non authentifié** (`anon`) n'accède pas à cet
    écran : la surface publique (⑤, vues individuel + équipe) relève de la
    **spec #8**.

### CT-10 — Longue liste : recherche, filtres, pagination (couvre R12b)

- **Pré-condition** : pour exercer la pagination, ajouter à **A1** plusieurs
  grimpeurs libres (**JD-POOL-LIBRES**, Chloé…Jade) et leur saisir un résultat,
  afin de dépasser **20** lignes dans un sexe (sinon vérifier les contrôles à
  petite échelle).
- **Étapes** :
  1. Onglet **Individuel → Filles**.
  2. Taper un **nom** dans la recherche.
  3. Activer **Mon club**, puis choisir une **équipe** dans le sélecteur.
  4. Naviguer avec **‹ Préc · numéros · Suiv ›**.
- **Résultat attendu** :
  - La **recherche** filtre par nom ; le **compteur** se met à jour.
  - **Mon club** ne montre que les grimpeurs du **Club A** ; le filtre **équipe**
    restreint à l'équipe choisie ; les filtres se **combinent**.
  - La liste est **paginée** (20/page) ; la navigation se fait **en bas**, la page
    **défile normalement** (pas de zone à barre de défilement interne) ;
    l'en-tête de colonnes accompagne **chaque page**.

### CT-11 — Prérequis `grimpeur.sexe` (couvre R8b, migration)

- **Objet** : la séparation Filles / Garçons repose sur `grimpeur.sexe`.
- **Étapes** :
  1. Vérifier que **Ana** et **Cléo** apparaissent bien en **Filles**, **Bob** et
     **Devi** en **Garçons** (conformes au seed).
  2. (Admin) via l'écran Grimpeurs, changer le sexe d'un grimpeur et recharger le
     classement.
- **Résultat attendu** : le grimpeur **bascule** dans l'autre classement (F↔G).
  L'application de la migration et son garde-fou de backfill sont vérifiés par le
  cahier **09** (CT-10) ; ici on valide seulement l'**effet** du champ sur les
  deux classements.

### CT-12 — Consultation par un coach temporaire (couvre R11 ; spec #1 R27)

- **Rôle** : **coach temporaire** (JD-JETON-COACHTEMP), session obtenue par scan.
- **Pré-condition** : rencontre enfant en **③ compétition** ; quelques résultats
  saisis (CT-02/CT-04). `enable_anonymous_sign_ins = true`.
- **Étapes** :
  1. Ouvrir `http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`
     (nouvelle session, ex. fenêtre privée) → session **coach temporaire** Club A.
  2. Aller sur le **classement** de **sa** rencontre enfant
     (`/coach/rencontres/33333333-…-3333/classement`).
  3. Parcourir les trois vues et ouvrir une **décomposition** (R13).
- **Résultat attendu** :
  - Le coach temporaire **voit** le classement de sa rencontre, **tous clubs**
    confondus (R11), en **lecture** ; les grimpeurs du **Club A** sont mis en
    évidence. Aucune action d'édition n'est proposée (le classement est en
    lecture seule).
- **RLS / sécurité** :
  - (négatif) Naviguer vers le classement d'**une autre** rencontre (ex. l'ado
    `/coach/rencontres/adadadad-…-adad/classement`) → **404** : le coach
    temporaire est **borné à sa rencontre** (spec #1 R27, cohérent avec la garde
    de page).

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
| | | | CT-09 | ✅ / ❌ | |
| | | | CT-10 | ✅ / ❌ | |
| | | | CT-11 | ✅ / ❌ | |
| | | | CT-12 | ✅ / ❌ | |
