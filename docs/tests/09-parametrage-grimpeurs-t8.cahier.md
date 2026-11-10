# Cahier de test : Paramétrage — Grimpeurs (T8)

> Couvre la tranche **T8** (paramétrage) : le volet **admin** du roster,
> l'écran `/admin/grimpeurs` (ajouter / modifier / supprimer un grimpeur d'un
> club), livré de bout en bout (UI mobile-first + Server Actions + RLS). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md` (écran
  Grimpeurs, R20–R26b — filtre par catégorie R26b ajouté le 2026-11-08) ; `docs/specs/01-roles-et-autorisations.md` (R18 : le
  coach gère les grimpeurs de son club ; R11/R13 : l'admin paramètre ; R6 :
  roster éditable hors phase). Cet écran est le **volet admin** (gère tout club) ;
  le volet **coach** (son seul club) relèvera d'une tranche coach ultérieure.
  Le champ **sexe** (obligatoire, `F`/`G`) est un **prérequis de la spec #7
  Classement** (`docs/specs/07-classement.md`, R8b : classement individuel séparé
  Filles / Garçons).
- **Domaine** : `src/domaine/grimpeur.ts` (`normaliserSaisieGrimpeur`,
  `normaliserAjoutGrimpeur` — licence facultative à l'ajout, R21d ; 12 tests
  Vitest — dont la validation du **sexe** `F`/`G`).
- **Migration** : `202609181000_grimpeur_sexe.sql` (ajout de `grimpeur.sexe`
  `not null check (sexe in ('F','G'))`, avec fenêtre de backfill). La table
  `grimpeur` et les policies `grimpeur_*` préexistent (T6, `202607251000`).
- **Pré-requis** :
  - Migrations + seed `01-jeu-de-test.sql` chargés (`supabase db reset` en local).
  - Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
    (coach Club A).
  - Au moins un club existant (seed : Club A, Club B) ; grimpeurs du seed.
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Depuis l'accueil (connecté **admin**) : bouton **« Grimpeurs »** →
`/admin/grimpeurs`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R11/R13)

- **admin** : `/admin/grimpeurs` s'affiche (formulaire + liste). ✅
- **coach** (`coach@test.local`) : `/admin/grimpeurs` → **404** (écran masqué). ✅
- **non connecté** : `/admin/grimpeurs` → **redirection vers `/connexion`** (spec #12 R2).

### CT-02 — Ajouter un grimpeur (nominal, R18)

- **Étapes** : choisir un **club**, saisir **prénom**, **nom**, **année de
  naissance**, choisir le **sexe** (Filles / Garçons) → **Ajouter le grimpeur**.
- **Attendu** : message « Grimpeur « Prénom Nom » ajouté. » ; il apparaît dans la
  liste (club, année, **sexe**, 0 engagement) ; le formulaire se vide.

### CT-03 — Champs obligatoires (validation domaine)

- **Étapes** : soumettre sans prénom (ou sans nom, sans année, ou **sans sexe**).
- **Attendu** : erreur explicite (« Le nom du grimpeur est obligatoire. » /
  « Le prénom du grimpeur est obligatoire. » / message sur l'année / « Le sexe du
  grimpeur doit être « F » ou « G ». ») ; aucune création.

### CT-03b — Sexe : prérequis classement par sexe (R8b spec #7)

- **Objet** : le sexe est **obligatoire** et borné à `F`/`G` (schéma + domaine).
- **Étapes** :
  1. Créer un grimpeur en choisissant **Filles**, un autre en **Garçons** ;
     vérifier l'affichage du sexe dans la liste.
  2. Contournement API : invoquer `creerGrimpeur` avec `sexe` **absent** ou
     `sexe = 'X'` (valeur hors `F`/`G`).
- **Attendu** :
  - Cas nominal : les deux grimpeurs sont créés, sexe correct affiché.
  - Contournement : **refus** (« Le sexe du grimpeur doit être « F » ou « G ». »),
    aucune création. En dernier ressort, le `check (sexe in ('F','G'))` en base
    rejette toute valeur invalide.

### CT-04 — Année de naissance invalide (validation domaine)

- **Étapes** : saisir une année non numérique (`abcd`), ou hors bornes (`1800`,
  `3000`).
- **Attendu** : erreur (« année à 4 chiffres » / « comprise entre 1900 et
  2100 ») ; aucune création. Le champ `number` limite déjà la saisie côté
  navigateur — vérifier aussi le rejet serveur (contournement API).

### CT-04b — Ajouter un grimpeur sans licence (spec #3 R21d ; spec #18 R14)

- **Pré-requis** : migration `202610251200_ajout_grimpeur_licence_generee`
  appliquée (ligne présente dans `interclub.version`).
- **Étapes** :
  1. Noter la plus grande licence générée existante :
     `select max(licence) from interclub.grimpeur where licence >= 2000000000;`
     (aucune → `1999999999`).
  2. Ouvrir **Nouveau grimpeur** : le champ s'intitule « Numéro de licence
     (facultatif) » avec l'indice « Laisser vide pour générer un numéro ».
  3. Remplir club, prénom, nom, année, sexe, **laisser la licence vide** →
     **Ajouter le grimpeur**.
  4. Ajouter un second grimpeur **avec** un numéro de licence réel (ex. `918274`).
  5. Ouvrir **Modifier** sur le premier grimpeur, **vider** la licence →
     **Enregistrer**.
- **Attendu** :
  1. Message « Grimpeur « Prénom Nom » ajouté avec la licence générée N. », où
     N = valeur notée + 1 ; dans la liste, « licence N » suivie de la mention
     **« générée »** (R26).
  2. Le second grimpeur est créé avec sa licence saisie, sans mention.
  3. Modification avec licence vide → **refus** « Le numéro de licence est
     obligatoire. » (R21b) ; la licence générée reste inchangée.
- **Automatisé** : `e2e/import-csv-sans-licence.spec.ts` (ajout unitaire) et
  `npm run test:import-csv` (RPC : admin seul, suite de la plage partagée avec
  l'import, club inexistant refusé).

### CT-05 — Modifier un grimpeur (R18)

- **Étapes** : sur une ligne, **Modifier** → l'éditeur pré-remplit les valeurs, y
  compris le **sexe** ; changer club/prénom/nom/année/**sexe** → **Enregistrer**.
- **Attendu** : la liste reflète les nouvelles valeurs (sexe inclus) ; l'éditeur
  se referme.

### CT-06 — Supprimer un grimpeur sans engagement (R18)

- **Pré-condition** : un grimpeur à **0 engagement** (ex. créé en CT-02).
- **Étapes** : **Supprimer** → **Oui, supprimer**.
- **Attendu** : le grimpeur disparaît de la liste.

### CT-07 — Suppression avec engagements (cascade signalée)

- **Pré-condition** : un grimpeur du seed **composé** dans une équipe
  (nbEngagements > 0).
- **Étapes** : **Supprimer** → observer le libellé de confirmation.
- **Attendu** : la confirmation signale la cascade (« Supprimer (et ses
  engagements/résultats) ? »). Après confirmation, le grimpeur **et** ses
  compositions/résultats/temps sont supprimés (FK `on delete cascade`).

### CT-08 — Garde serveur : un coach ne passe pas par cet écran (R11/R13 ; contournement)

- **Objet** : cet écran est le volet **admin**. Connecté **coach**, invoquer
  directement `creerGrimpeur` / `modifierGrimpeur` / `supprimerGrimpeur` (POST).
- **Attendu** : **refus** par la garde admin de ces actions (message R11/R13).
  Note : la **RLS** `grimpeur_*` autoriserait, elle, le coach à écrire les
  grimpeurs de **son** club (R18) — ce sera l'objet du futur écran coach ; ici
  la garde applicative borne l'écran à l'admin.

### CT-09 — Responsive & tactile (mobile-first, conv. 08)

- **Étapes** : sur téléphone (ou DevTools ~375 px) — parcourir CT-02, CT-05.
- **Attendu** :
  - Champs (sélecteurs club **et sexe**, textes, année) et boutons ≥ 44 px de
    haut ; pas de zoom iOS au focus (police 16 px).
  - Le sélecteur **sexe** est lisible en thème sombre (options `Filles`/`Garçons`
    contrastées — pattern `ChampSelect`).
  - Formulaire et lignes empilés lisiblement, sans débordement horizontal.
  - Focus visible au clavier ; messages d'erreur/succès reliés (lecteur d'écran).

### CT-10 — Application de la migration `grimpeur.sexe` (backfill, recette)

- **Objet** : vérifier l'application **manuelle** de `202609181000_grimpeur_sexe`
  sur une base contenant **déjà** des grimpeurs (recette/prod), conformément à la
  règle « migrations appliquées à la main ».
- **Étapes** :
  1. Sur une base où des grimpeurs existent **sans** sexe, exécuter la migration
     **sans** backfill préalable.
  2. Renseigner le sexe (`F`/`G`) de chaque grimpeur existant, puis **rejouer**.
- **Attendu** :
  1. Le **garde-fou** interrompt l'exécution avec un message explicite (« Des
     grimpeurs sans sexe subsistent : renseigner 'F'/'G'… »), **sans** poser la
     contrainte `NOT NULL`.
  2. Après backfill, la migration se termine ; `grimpeur.sexe` est `NOT NULL` avec
     `check (sexe in ('F','G'))` ; une ligne apparaît dans `interclub.version`.
- **Local** : sur base **vide** au moment des migrations (`supabase db reset`), la
  migration passe directement (aucun backfill) ; le **seed** porte le sexe des
  grimpeurs de test.

### CT-11 — Filtrer la liste par catégorie (R26b, R26b-1 à R26b-3)

- **Pré-requis** : migration
  `202611081000_rpc_rechercher_grimpeurs_filtre_categorie` appliquée ; saison
  2026-2027, `AGE_BASCULE = 12`, `AGE_ADO_MAX = 18`. Grimpeurs nés en 2016,
  2014 (pivot), 2011, 2009 (17 ans), 1990, et un enfant né en 2016 **surclassé**
  pour 2026-2027 (spec #21).
- **Étapes** :
  1. Ouvrir `/admin/grimpeurs` : sous les filtres, la mention « Âges de la
     saison 2026–2027 » est affichée.
  2. Choisir **Enfant** → **Rechercher**, puis **Ado**, puis **Adulte**.
  3. Combiner **Ado** avec un **club** et un nom dans la recherche.
  4. Avec plus de 50 résultats, passer à la page suivante.
  5. Cliquer **Effacer**.
- **Attendu** :
  1. Enfant : nés en 2014 ou après (2016, pivot 2014, surclassé). Ado : nés de
     2008 à 2014 **et** le surclassé. Adulte : nés en 2010 ou avant (2009, 1990).
     Le pivot apparaît en Enfant et en Ado ; le 17 ans en Ado et en Adulte.
  2. Le compteur « N résultats … — Ado » reflète le roster **entier** filtré.
  3. Les filtres se cumulent.
  4. La pagination conserve recherche, club et catégorie (`?categorie=…` dans
     l'adresse).
  5. Tous les filtres reviennent à « Tous les clubs » / « Toutes les
     catégories », champ de recherche vide.
- **Automatisé** : `e2e/filtre-categorie-grimpeurs.spec.ts` (étapes 1–3, 5 ;
  catégorie inconnue ignorée). Pagination (étape 4) à vérifier à la main.

### CT-12 — Âges des catégories non configurés (R26b-4)

- **Étapes** : en local, retirer `AGE_BASCULE` de `.env.local`, relancer
  `npm run dev`, ouvrir `/admin/grimpeurs` (puis remettre la variable).
- **Attendu** : pas de sélecteur de catégorie ; la mention « Filtre par
  catégorie indisponible : âges des catégories non configurés. » s'affiche ; la
  recherche et le filtre club fonctionnent.

### CT-13 — Application de la migration du filtre catégorie (recette, prod)

- **Étapes** : exécuter
  `202611081000_rpc_rechercher_grimpeurs_filtre_categorie.sql` dans le SQL
  Editor, puis ouvrir `/admin/grimpeurs` (avec et sans filtre catégorie).
- **Attendu** : une seule fonction `interclub.rechercher_grimpeurs` (signature à
  7 paramètres, aucune erreur PGRST203) ; ligne présente dans
  `interclub.version` ; la liste s'affiche comme avant sans filtre.
- **Local** : réversibilité et idempotence vérifiées par
  `npm run db:verifier-retours -- 202611081000_rpc_rechercher_grimpeurs_filtre_categorie`.

## Registre d'exécution

| Cas | Environnement | Date | Testeur | Verdict | Notes |
|-----|---------------|------|---------|---------|-------|
| CT-01 | | | | ⬜ | |
| CT-02 | | | | ⬜ | |
| CT-03 | | | | ⬜ | |
| CT-03b | | | | ⬜ | |
| CT-04 | | | | ⬜ | |
| CT-04b | local | 2026-10-25 | Claude (E2E + test:import-csv) | ✅ | étapes 1–3 attendu 1 automatisés ; attendus 2–3 à vérifier en recette |
| CT-05 | | | | ⬜ | |
| CT-06 | | | | ⬜ | |
| CT-07 | | | | ⬜ | |
| CT-08 | | | | ⬜ | |
| CT-09 | | | | ⬜ | |
| CT-10 | | | | ⬜ | |
| CT-11 | local | 2026-11-08 | Claude (E2E) | ✅ | étapes 1–3, 5 automatisées ; pagination (4) à vérifier en recette |
| CT-12 | | | | ⬜ | |
| CT-13 | local | 2026-11-08 | Claude (`db:verifier-retours`) | ✅ | à appliquer en recette puis prod |

> Le domaine (`normaliserSaisieGrimpeur`) est couvert par Vitest (`npm run test`,
> `src/domaine/grimpeur.test.ts`). Le reste (UI, RLS, garde) se vérifie ici, sur
> l'app réelle — en priorité **mobile**.
