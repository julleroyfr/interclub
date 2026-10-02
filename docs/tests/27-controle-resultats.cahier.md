# Cahier de test : Contrôle des résultats contre les fiches de juges (spec #16)

> Couvre l'écran **admin** de contrôle `/admin/rencontres/[id]/controle` : accès
> réservé à l'admin, disponibilité **④ contrôle / ⑤ lecture seule / 404 avant**,
> liste **par voie puis par bloc** des participants tous clubs avec l'issue
> **sans points**, **coche / décoche** enregistrée en base avec son **auteur**,
> **temps réel** entre deux admins, refus d'écriture hors ④, et action du
> **tableau de bord** avec la progression globale. Le domaine (libellés, tri,
> filtres, progressions, phase) est couvert par Vitest
> (`src/domaine/controle.test.ts`).
> Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/16-controle-resultats-fiches-juges.md`
  (R1–R18, R12bis) ; `docs/specs/11-realtime.md` (mécanique réutilisée, rév.
  2026-10-02).
- **Pré-requis** :
  - Migrations appliquées **jusqu'à `202610021000_controle_resultats` incluse**
    (colonnes `controle_le` / `controle_par`). En local : `supabase db reset`.
  - `SUPABASE_SERVICE_ROLE_KEY` renseignée (résolution de l'email des auteurs).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) puis recette — version/commit :
  `______`

## Jeu de données initial

Réutilise le seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-RENCONTRE-ENFANT** (`33333333-…-3333`), structure
  **JD-STRUCTURE-ENFANT** et **JD-BLOCS-ENFANT**.
- **JD-EQUIPE-A1** (Club A) = **JD-ANA-M2** (M2·M3·M4) + **JD-BOB-T1**
  (T1·T2·T3) ; **JD-EQUIPE-A2** avec **JD-PRETE-DEVI** (Club B prêté à A) ;
  **JD-EQUIPE-B1** (Club B) = **JD-CLEO-T2** (T2·T3·T4).

**Préparation des résultats (donnée locale au cahier, non cataloguée)** — les
résultats ne sont pas seedés. Rencontre en **③** (`competition`), connecté
**admin**, via `/admin/rencontres/33333333-…-3333/resultats` :

| Grimpeur | Voies | Blocs |
| -------- | ----- | ----- |
| Ana | M2 = Top, M3 = Échec | B1 = 1er essai |
| Bob | T1 = Top, T2 = Prise valorisée | B2 = 2e essai |
| Cléo | T2 = Top | B1 = Échec |

Puis passer la rencontre en **④ clôture** depuis le tableau de bord : le NP
automatique (spec #6 R18) complète les attendus non saisis (ex. Ana M4, Bob T3,
Devi, B1/B2 manquants).

> **Second admin (CT-08)** : créer en local un 2ᵉ compte admin
> (`admin2@test.local`, rôle admin via `/admin/mapping`) — donnée **locale au
> CT**, non seedée.

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| JD-ADMIN (`admin@test.local`) | admin | Contrôle, coche/décoche, change la phase |
| `admin2@test.local` (local) | admin | 2ᵉ admin : temps réel et auteur (CT-08) |
| JD-COACH-A (`coach@test.local`) | coach permanent Club A | Négatif d'accès (CT-01) |
| JD-SANSMAP (`sansmapping@test.local`) | authentifié sans rôle | Négatif d'accès (CT-01) |

## Cas de test

### CT-01 — Migration appliquée (couvre : Contraintes de données)

- **Rôle / compte** : SQL Editor (local, puis recette).
- **Étapes** :
  1. Appliquer `202610021000_controle_resultats.sql`.
  2. Exécuter :
     `select column_name, data_type from information_schema.columns where table_schema = 'interclub' and table_name in ('resultat_voie','resultat_bloc') and column_name like 'controle%';`
  3. Exécuter : `select version from interclub.version where version = '202610021000_controle_resultats';`
  4. Rejouer le fichier une seconde fois.
  5. Tenter : `update interclub.resultat_voie set controle_par = '<uuid admin>', controle_le = null where id = '<un id>';`
- **Résultat attendu** : 4 colonnes (`controle_le` timestamptz, `controle_par`
  uuid × 2 tables) ; 1 ligne de version ; la 2ᵉ exécution passe sans erreur
  (idempotente) ; l'update de l'étape 5 est **rejeté** par
  `resultat_voie_controle_check` (pas d'auteur sans coche).

### CT-02 — Accès réservé à l'admin (couvre : R1)

- **Pré-condition** : rencontre en **④**.
- **Étapes** :
  1. Connecté **admin** : ouvrir `/admin/rencontres/33333333-…-3333/controle`.
  2. Connecté **coach A** : ouvrir la même URL.
  3. Connecté **sans rôle** : ouvrir la même URL.
  4. **Non connecté** : ouvrir la même URL.
- **Résultat attendu** : (1) l'écran s'affiche ; (2) et (3) **404** ; (4)
  redirection vers `/connexion` (garde admin unifiée, spec #12).
- **RLS / sécurité** : aucun rôle non-admin ne voit la liste tous clubs.

### CT-03 — Disponibilité selon la phase et action du tableau de bord (couvre : R2, R3)

- **Rôle / compte** : admin.
- **Étapes** :
  1. Rencontre en **③** : ouvrir le tableau de bord `/admin/rencontres/33333333-…-3333`, puis l'URL `…/controle`.
  2. Passer en **④** : recharger le tableau de bord.
  3. Passer en **⑤** : recharger le tableau de bord, cliquer l'action.
  4. Revenir en **④** (retour admin).
- **Résultat attendu** : (1) aucune action de contrôle ; l'URL renvoie **404** ;
  (2) action **« ✅ Contrôler les résultats (fiches juges) → »** avec
  `n/m lignes contrôlées` ; (3) action **« Voir le contrôle des résultats »**,
  l'écran s'ouvre en **lecture seule** (CT-07) ; (4) l'action de contrôle revient,
  coches conservées.

### CT-04 — Supports, lignes et issues sans points (couvre : R4, R5, R6, R7, R8)

- **Pré-condition** : rencontre en **④**, résultats préparés.
- **Étapes** :
  1. Ouvrir `…/controle` sur ordinateur.
  2. Observer la colonne de gauche.
  3. Sélectionner **T2**, puis **B1**, puis **M4**.
- **Résultat attendu** :
  - Gauche : **Voies de difficulté** dans l'ordre de la structure (niveau +
    cotation) puis **Blocs** B1, B2 ; chacun avec `0/m`. Aucune vitesse.
  - **T2** : Bob (*Prise valorisée*) et Cléo (*Top*) — **tous clubs**, triés par
    nom de famille puis prénom, club de chacun affiché.
  - **B1** : libellés de palier (*1er essai*) / *Échec* / *NP* — **aucun nombre
    de points** nulle part.
  - **M4** : Ana en *NP* (posé à la clôture).
  - Devi apparaît avec le badge **« prêté → Club A »** sur les blocs.

### CT-05 — Coche, décoche et progression (couvre : R5, R10, R11, R18)

- **Pré-condition** : rencontre en **④**.
- **Étapes** :
  1. Sur **T2**, cocher les 2 lignes.
  2. Survoler la mention « ✓ admin » d'une ligne.
  3. Revenir au tableau de bord.
  4. Revenir sur **T2**, décocher Cléo.
  5. En SQL : `select controle_le, controle_par from interclub.resultat_voie where voie_difficulte_id = '<T2>';`
- **Résultat attendu** : (1) chaque coche s'affiche immédiatement, la ligne
  passe en vert avec **« ✓ admin »** (partie de l'email avant « @ ») ; T2 passe à
  **`✓ 2/2`** (support complet) et la progression globale augmente ; (2)
  infobulle « Contrôlé par admin le JJ/MM HH:MM » ; (3) le tableau de bord
  affiche le nouveau `n/m` ; (4) T2 repasse à `1/2`, la ligne n'a plus d'auteur ;
  (5) Bob : `controle_le` et `controle_par` renseignés ; Cléo : les deux `null`.

### CT-06 — Recherche et filtre « non contrôlées seulement » (couvre : R9)

- **Pré-condition** : sur **B1**, au moins une ligne cochée.
- **Étapes** :
  1. Saisir une partie du prénom en minuscules sans accent (ex. `cleo`).
  2. Effacer, activer **« Non contrôlées seulement »**.
  3. Cocher une ligne restante.
- **Résultat attendu** : (1) seule Cléo reste, compteur « 1 affiché(s) sur m » ;
  (2) les lignes cochées disparaissent ; (3) la ligne cochée disparaît de la
  liste filtrée ; la progression du support compte toujours **toutes** les
  lignes.

### CT-07 — Lecture seule en ⑤ (couvre : R2, R13, R15, Scénario lecture seule)

- **Étapes** :
  1. Avec des coches posées, passer la rencontre en **⑤** (même si des lignes
     ne sont pas contrôlées).
  2. Ouvrir `…/controle`.
  3. Tenter de cliquer une case.
- **Résultat attendu** : (1) passage en ⑤ **autorisé** sans avertissement ;
  (2) bandeau « Résultats officiels : contrôle consultable en lecture seule »,
  coches, auteurs et progressions visibles ; **pas** d'indicateur temps réel ;
  (3) les cases sont **désactivées**, rien ne change en base.

### CT-08 — Temps réel entre deux admins (couvre : R11, R12, R12bis, Scénario parallèle)

- **Pré-condition** : rencontre en **④** ; `admin2@test.local` créé.
- **Étapes** :
  1. Fenêtre A : `admin@test.local` sur `…/controle`, support **B2**.
  2. Fenêtre B (navigation privée) : `admin2@test.local`, même écran, support
     **B2**, filtre « Non contrôlées seulement » actif, recherche vide.
  3. Vérifier l'indicateur temps réel dans les deux fenêtres.
  4. En A, cocher une ligne de B2.
  5. En B, désactiver le filtre.
- **Résultat attendu** : (3) indicateur **connecté** ; (4) **sans action** en B,
  en moins de ~2 s, la ligne disparaît de la liste filtrée, la progression de B2
  et la progression globale augmentent ; **B2 reste sélectionné et le filtre
  reste actif** ; (5) la ligne apparaît cochée avec **« ✓ admin »** (auteur A).
  Inversement, une coche posée en B apparaît en A avec **« ✓ admin2 »**.

### CT-09 — Rattrapage après coupure du temps réel (couvre : R12bis, spec #11 R10–R12)

- **Pré-condition** : CT-08, deux fenêtres ouvertes.
- **Étapes** :
  1. En B, couper le réseau (DevTools → Offline).
  2. En A, cocher deux lignes.
  3. En B, rétablir le réseau.
- **Résultat attendu** : (1) indicateur **interrompu** en B, l'écran reste
  utilisable ; (3) indicateur reconnecté et les deux coches apparaissent
  (relecture complète).

### CT-10 — Refus d'écriture hors ④ (couvre : R13)

- **Étapes** :
  1. Fenêtre A sur `…/controle` en **④**.
  2. Fenêtre B (même admin) : passer la rencontre en **⑤**.
  3. En A, **sans recharger**, cliquer une case non cochée.
- **Résultat attendu** : message d'erreur lisible « Le contrôle n'est
  modifiable qu'en clôture (④)… » ; la case revient à son état ; en SQL, la ligne
  n'a **pas** de `controle_le`.

### CT-11 — Coche conservée après correction du résultat (couvre : R14, R16)

- **Pré-condition** : en **④**, ligne Ana **M3 = Échec** cochée.
- **Étapes** :
  1. Laisser une ligne en écart non cochée (aucune action proposée).
  2. Via `…/resultats`, corriger Ana **M3** en **Top**.
  3. Revenir sur `…/controle`, support **M3**.
- **Résultat attendu** : (1) aucune action « écart » n'existe ; (3) la ligne
  affiche **Top** et reste **cochée** (même auteur, même horodatage).

### CT-12 — Mobile (couvre : R17)

- **Étapes** :
  1. Ouvrir `…/controle` sur téléphone (ou DevTools, largeur 375 px).
  2. Choisir **B1**, faire défiler la liste, cocher une ligne au doigt.
  3. Revenir à la liste via « ← Voies et blocs ».
- **Résultat attendu** : une seule colonne (liste puis détail) ; en-tête du
  support, recherche et filtre restent visibles en défilant ; cases d'au moins
  44 px ; aucun défilement horizontal.

## Parcours manuel local (testeur humain)

> CT-01 → CT-12 sont rejoués par l'agent (`e2e/admin-controle.spec.ts`). Les cas
> ci-dessous couvrent ce que l'automate **ne vérifie pas** : le **vrai** passage
> en clôture et la **vraie** correction par l'IHM (simulés en SQL côté E2E), la
> catégorie **ado**, le **volume**, l'**usage fiche en main**, le **clavier** et
> les **effets de bord** sur les autres écrans. À dérouler **en local avant la
> recette**.

**Mise en place locale** (une fois) :

1. `supabase start` puis `supabase db reset` (seed `01` chargé, migration
   `202610021000` incluse).
2. `npm run dev` → <http://localhost:3011>, connexion `admin@test.local` /
   `interclub`.
3. Pour CT-15/CT-16/CT-18 (volume) : `bash scripts/seed-controle-cloture.sh`
   crée **deux rencontres complètes déjà en ④** — **enfant du 26/09/2026**
   (100 grimpeurs, 4 clubs, B1 + B2 pour tous, NP compris, 500 lignes) et **ado
   du 27/09/2026** (60 grimpeurs, 4 à 6 voies chacun, 453 lignes), avec
   quelques prêtés et la vitesse. Rejouable ; purge avec `--purge`.
   *(L'ancien `seed-volume-affichage.sh` ne met qu'un bloc par grimpeur : il
   sert à l'écran d'affichage, pas au contrôle.)*

### CT-13 — Bout en bout : saisie ③ → clôture par l'IHM → contrôle `[mixte]` (couvre : R2, R3, R6, spec #6 R18)

- **Rôle / compte** : admin.
- **Pré-condition** : rencontre enfant `33333333-…` en **③** (seed), aucun
  résultat.
- **Étapes** :
  1. Tableau de bord de la rencontre : vérifier qu'**aucune** action de contrôle
     n'apparaît.
  2. « Saisir les résultats » : saisir Ana **M2 = Top** et Bob **T1 = Top**,
     rien d'autre.
  3. Revenir au tableau de bord, passer la rencontre en **④ clôture** avec le
     bouton de pilotage.
  4. Cliquer **« Contrôler les résultats (fiches juges) »**.
- **Résultat attendu** :
  - (3) l'action de contrôle apparaît avec `0/m lignes contrôlées`, où `m` =
    nombre total de lignes (saisies + NP posés à la clôture).
  - (4) M2 : Ana *Top* ; M3 et M4 : Ana *NP* ; T1 : Bob *Top* (+ Devi *NP*) ;
    T2/T3 : *NP* ; B1/B2 : **tous** les grimpeurs engagés en *NP*.
  - À l'œil : l'écran se lit sans ambiguïté, les *NP* se distinguent des *Top*.

### CT-14 — Correction réelle via la saisie admin, coche conservée `[auto]` (couvre : R14, R16, spec #9 R8)

- **Pré-condition** : suite de CT-13, en **④**.
- **Étapes** :
  1. Sur le contrôle, support **M3**, cocher Ana (*NP*).
  2. Ouvrir dans un **autre onglet** « Corriger les résultats », corriger Ana
     **M3 = Échec** et enregistrer.
  3. Revenir sur l'onglet du contrôle **sans recharger**.
- **Résultat attendu** : (3) la ligne passe à *Échec* toute seule (temps réel)
  et reste **cochée**, même auteur et même heure dans l'infobulle.

### CT-15 — Volume : ~100 grimpeurs sur les blocs `[manuel]` (couvre : R7, R9, R17, R18)

- **Pré-condition** : script de volume chargé ; rencontre passée en **④**.
- **Étapes** :
  1. Ouvrir le contrôle, support **B1**.
  2. Faire défiler toute la liste, puis remonter.
  3. Activer « Non contrôlées seulement », cocher une dizaine de lignes à la
     suite.
  4. Rechercher un grimpeur par un bout de nom, le cocher, effacer la recherche.
- **Résultat attendu** (à l'œil) : l'ordre alphabétique permet de suivre une
  fiche ; l'en-tête du support (titre, progression, recherche, filtre) reste
  visible en défilant ; chaque coche est **instantanée** (pas d'attente
  perceptible ni de saut de la liste) ; en filtre, la ligne cochée disparaît
  sans perdre sa position de lecture ; la progression `n/m` suit.

### CT-16 — Usage réel, fiche papier en main `[manuel]` (couvre : R6, R8, R10, R16)

- **Pré-condition** : en **④** (après CT-13 ou CT-15). Préparer une **fiche de
  juge fictive** sur papier pour **B1** reprenant 5 à 10 grimpeurs, dont **une
  valeur volontairement différente** de l'application.
- **Étapes** :
  1. Contrôler B1 en suivant la fiche ligne à ligne.
  2. Laisser la ligne en écart **non cochée**.
  3. Activer « Non contrôlées seulement » à la fin.
- **Résultat attendu** (à l'œil) : la correspondance fiche ↔ écran est rapide
  (nom en majuscules, prénom, club, issue lisible) ; l'écart saute aux yeux
  (issue différente) ; à la fin, le filtre montre **exactement** les lignes
  non vérifiées, dont l'écart à corriger plus tard (spec #9).

### CT-17 — Catégorie ado : zones, voies doublées, blocs `[mixte]` (couvre : R4, R6, R8)

- **Pré-condition** : rencontre **ado** `adadadad-…` (**JD-RENCONTRE-ADO**) en
  **③**.
- **Étapes** :
  1. « Saisir les résultats » de la rencontre ado : Nora **T5 = Zone 2**,
     **T5 bis = Zone 1**, **T6 = Top** ; Owen **T4 = Échec** ; blocs Nora
     **B1 = Zone**, Owen **B2 = Bloc complet**.
  2. Passer la rencontre en **④**, ouvrir le contrôle.
- **Résultat attendu** : les **deux** voies T5 apparaissent comme **deux
  supports distincts** (Nora *Zone 2* sur l'un, *Zone 1* sur l'autre) ; une voie
  ado sans résultat affiche `0/0` sans ✓ ; **aucun** *NP* sur les voies ado
  (spec #6 R18) mais *NP* sur les blocs non saisis ; libellés *Zone*,
  *Bloc complet*. À l'œil : *Zone 1* / *Zone 2* lisibles et distincts.

### CT-18 — Deux navigateurs + effets de bord sur les autres écrans `[mixte]` (couvre : R12bis, Contraintes de données)

- **Pré-condition** : en **④** ; navigateur 1 sur le **contrôle** ; navigateur 2
  (navigation privée, même admin ou `admin2@test.local`) sur le **contrôle** ;
  un 3ᵉ onglet sur le **classement admin** de la rencontre.
- **Étapes** :
  1. Dans le navigateur 1, cocher puis décocher plusieurs lignes, vite.
  2. Observer le navigateur 2 et l'onglet classement.
- **Résultat attendu** : le navigateur 2 suit en moins de 2 s, sans clignotement
  gênant ni perte du support, de la recherche ou du filtre ; l'onglet classement
  se relit mais **aucun score ni rang ne change** (la coche n'entre pas dans le
  score, R14). À l'œil : pas de saut de défilement dans le navigateur 2.

### CT-19 — Clavier et lecteur d'écran `[manuel]` (couvre : R10, R17, conv. 08)

- **Étapes** :
  1. Sans souris : Tab jusqu'à la liste des supports, Entrée pour en ouvrir un.
  2. Tab jusqu'à une case, Espace (ou Entrée) pour cocher, puis décocher.
  3. Avec le lecteur d'écran Windows (Narrateur, Ctrl+Win+Entrée), se placer sur
     une case.
- **Résultat attendu** : focus toujours **visible** ; la case se coche au
  clavier ; le Narrateur annonce « Contrôlé : NOM Prénom, case à cocher,
  cochée / non cochée ».

### CT-20 — Retour de ⑤ en ④ `[auto]` (couvre : R2, R3, R15)

- **Étapes** :
  1. Avec des coches posées, passer la rencontre en **⑤** : vérifier la lecture
     seule.
  2. Repasser en **④** depuis le tableau de bord.
- **Résultat attendu** : les coches et leurs auteurs sont **intacts** ; les
  cases redeviennent modifiables ; l'action du tableau de bord redevient
  « Contrôler les résultats (fiches juges) » avec la même progression.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-10-02 | agent (psql) | `0849daa` + modifs non commitées | CT-01 | ✅ | local Docker : `db reset` OK, 4 colonnes, version, rejeu idempotent, check rejette un auteur sans coche |
| 2026-10-02 | agent/playwright | `0849daa` + modifs non commitées | CT-02 | ✅ | `e2e/admin-controle.spec.ts` (local) |
| 2026-10-02 | agent/playwright | idem | CT-03 | ✅ | ③ 404 + pas d'action ; ④ action `0/20` ; ⑤ « Voir le contrôle » → lecture seule |
| 2026-10-02 | agent/playwright | idem | CT-04 | ✅ | ordre M1…T10, B1, B2 ; tri ; issues sans points ; prêté signalé |
| 2026-10-02 | agent/playwright | idem | CT-05 | ✅ | coche/décoche, `✓ 3/3`, auteur « admin » + infobulle, base + tableau de bord |
| 2026-10-02 | agent/playwright | idem | CT-06 | ✅ | |
| 2026-10-02 | agent/playwright | idem | CT-07 | ✅ | cases désactivées, pas d'indicateur « En direct » |
| 2026-10-02 | agent/playwright | idem | CT-08 | ✅ | 2 admins (admin2 créé via API Auth locale), auteur « admin2 » vu en direct |
| 2026-10-02 | agent/playwright | idem | CT-09 | ✅ | coupure simulée (`setOffline`) : « Hors ligne » puis rattrapage |
| 2026-10-02 | agent/playwright | idem | CT-10 | ✅ | |
| 2026-10-02 | agent/playwright | idem | CT-11 | ✅ | correction simulée en SQL (pas via l'écran de saisie) |
| 2026-10-02 | agent/playwright | idem | CT-12 | ✅ (mixte) | 375 px : une colonne, cases ≥ 44 px, contenu sans débordement. Résidu manuel : rendu sur un vrai téléphone. ⚠️ La barre de navigation admin commune déborde (défaut préexistant, toutes les pages admin) |
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
| | | | CT-13 | ✅ / ❌ | |
| | | | CT-14 | ✅ / ❌ | |
| | | | CT-15 | ✅ / ❌ | |
| | | | CT-16 | ✅ / ❌ | |
| | | | CT-17 | ✅ / ❌ | |
| | | | CT-18 | ✅ / ❌ | |
| | | | CT-19 | ✅ / ❌ | |
| | | | CT-20 | ✅ / ❌ | |
