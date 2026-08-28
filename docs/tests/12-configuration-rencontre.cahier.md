# Cahier de test : Configuration de la structure d'une rencontre (spec #3, R40–R45)

> Couvre l'écran **`/admin/rencontres/[id]`** : consultation et modification de la
> structure d'une rencontre (voies de difficulté, blocs, voies de vitesse),
> organisée en **onglets**, avec édition réservée à la phase **pré-compétition**.
> Complète le cahier [11-gabarit-rencontre.cahier.md](11-gabarit-rencontre.cahier.md)
> (CT-09/CT-10) en détaillant l'IHM dédiée.
> Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md`
  (Configuration d'une rencontre R40–R45 ; niveaux R37 ; points R38 ; phase R36) ;
  `docs/specs/01-roles-et-autorisations.md` (R12 : écriture réservée à l'admin).
- **Domaine** : `src/domaine/gabarit.ts` (`validerNiveauVoie` plages R37,
  `validerPoints` R38, `champsPointsVoie` champs conditionnels R38/R43 —
  couverts par `gabarit.test.ts`, 22 tests Vitest).
- **Data / actions** : `src/lib/rencontres/structure.ts` (`getStructureRencontre`) ;
  `src/lib/rencontres/structure-actions.ts` (`ajouterEpreuveRencontre`,
  `ajouterVoieDifficulteRencontre`, `ajouterBlocRencontre`,
  `ajouterVoieVitesseRencontre` — garde admin + phase pré-compétition).
- **IHM** : `src/app/admin/rencontres/[id]/page.tsx` (garde admin, chargement) ;
  `panneau-structure.tsx` (onglets, formulaires, lecture seule, état vide) ;
  lien **« Configurer »** ajouté dans `liste-rencontres.tsx`.
- **Migration** : aucune nouvelle (réutilise les tables `epreuve`,
  `voie_difficulte`, `bloc`, `bloc_palier`, `voie_vitesse` du gabarit —
  `202607291000_gabarit_et_voies_epreuve.sql`, **déjà appliquée**).
- **Pré-requis** :
  - Migrations + seed `01-jeu-de-test.sql` chargés ; migration gabarit appliquée.
  - Seed gabarit présent : enfant (14 voies diff, 2 blocs, Filles/Garçons),
    ado (10 voies diff en tête, 2 blocs, Filles/Garçons).
  - Comptes (mdp `interclub`) : `admin@test.local` (admin),
    `coach@test.local` (coach Club A).
  - Au moins une rencontre **ado** et une rencontre **enfant** en phase
    pré-compétition (créées via `/admin/rencontres`, gabarit copié — cf.
    cahier 11 CT-06).
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Connecté **admin** : `/admin/rencontres` → sur une ligne de rencontre, bouton
**« Configurer »** → `/admin/rencontres/<id>`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R40, R12)

- **admin** : depuis `/admin/rencontres`, cliquer **« Configurer »** sur une
  rencontre → l'écran `/admin/rencontres/<id>` s'affiche. ✅
- **coach** (`coach@test.local`) : ouvrir directement l'URL
  `/admin/rencontres/<id>` → **404** (écran masqué). ✅
- **non connecté** : `/admin/rencontres/<id>` → **404**. ✅
- **id inexistant** : admin ouvre `/admin/rencontres/<uuid-bidon>` → **404**.

### CT-02 — En-tête, onglets et compteurs (couvre R41, R42)

- **Rôle** : admin. **Pré-condition** : rencontre **ado** au format seed.
- **Étapes** : ouvrir l'écran de configuration de la rencontre.
- **Résultat attendu** :
  - En-tête : **date** (format long), **catégorie** (« Ado »), **club porteur**,
    et **badge de phase** « Pré-compétition ».
  - Trois onglets : **Voies de difficulté · 10**, **Blocs · 2**,
    **Vitesse · 2** (compteurs conformes au contenu copié).
  - Un seul onglet visible à la fois ; cliquer un onglet change le contenu.
  - Onglet Voies : liste T1–T10 avec type, cotation et points (voie + Z1/Z2).
  - Onglet Blocs : B1/B2 avec leurs **paliers** (libellé + points).
  - Onglet Vitesse : voies numérotées **Filles** / **Garçons**.

### CT-03 — Ajouter une voie de difficulté en pré-compétition (couvre R43, R36)

- **Rôle** : admin. **Pré-condition** : rencontre **ado**, onglet **Voies**.
- **Étapes** : niveau **T6**, type **Tête**, cotation « 6c », points voie 14,
  Zone 1 = 11, Zone 2 = 12 → **+ Voie**.
- **Résultat attendu** : message « Voie ajoutée. » ; une **2ᵉ voie T6** apparaît
  (niveau non unique autorisé) ; le compteur de l'onglet passe à **11**. Le
  gabarit ado et les autres rencontres ne sont pas modifiés (R36).

### CT-04 — Champs de points conditionnels à la catégorie (couvre R38, R43)

- **Rôle** : admin. **Étapes** : comparer le formulaire d'ajout de voie sur une
  rencontre **ado** puis **enfant**.
- **Résultat attendu** :
  - **Ado** : champs **Voie entière**, **Zone 1**, **Zone 2** (pas de prise
    valorisée).
  - **Enfant** : champs **Voie entière** et **Prise valo.** (pas de zones).
  - Sur une rencontre enfant, ajouter une voie **moulinette** M2 (points voie
    seulement) : la prise valorisée saisie est ignorée (null en base pour une
    moulinette). Points négatif/décimal **refusé** (« entier positif ou nul »).

### CT-05 — Niveau hors plage réglementaire refusé (couvre R37)

- **Rôle** : admin. **Étapes / Résultat attendu** :
  1. Rencontre **ado** → le sélecteur Type ne propose **que « Tête »** ; le
     sélecteur Niveau ne propose que T1–T10 (pas de moulinette, pas de T11).
  2. Contournement (forcer `typeVoie=moulinette` ou `niveau=T11` via l'action) →
     **refus** avec message de niveau invalide ; aucune voie créée.

### CT-06 — Ajouter un bloc (couvre R43, R42)

- **Rôle** : admin. **Pré-condition** : rencontre ado, onglet **Blocs**.
- **Étapes** : code « B3 » → **+ Bloc**. Puis retenter « B1 ».
- **Résultat attendu** : « B3 » apparaît (compteur **3**) ; le bloc s'affiche
  sans palier (« Aucun palier. »). Ajouter un code **déjà présent** (« B1 ») →
  refus « Le bloc « B1 » existe déjà. » (unicité `(épreuve, code)`).

### CT-07 — Ajouter une voie de vitesse (couvre R43, R32)

- **Rôle** : admin. **Pré-condition** : onglet **Vitesse**.
- **Étapes** : libellé **« Mixte »** (suggestions Filles/Garçons/Mixte) →
  **+ Voie**.
- **Résultat attendu** : « Mixte » s'ajoute avec le **numéro suivant** à côté de
  Filles/Garçons (compteur **3**). Un libellé **vide** est refusé.

### CT-08 — Structure verrouillée hors pré-compétition (couvre R44, R36)

- **Rôle** : admin. **Pré-condition** : faire avancer la rencontre en
  **compétition** (`/admin/rencontres`).
- **Étapes** : rouvrir l'écran de configuration.
- **Résultat attendu** :
  - Badge de phase « Compétition » ; **message** indiquant que la structure est
    **verrouillée** (modifiable uniquement en pré-compétition).
  - **Aucun formulaire** d'ajout dans les onglets ; les listes restent
    **consultables**.
  - Contournement : invoquer directement `ajouterVoieDifficulteRencontre` →
    refus « La structure ne peut être modifiée qu'en phase pré-compétition (R36). »

### CT-09 — Rencontre sans format : ajout d'épreuve d'abord (couvre R45, R35)

- **Rôle** : admin. **Pré-condition** : une rencontre **sans épreuve** (créée
  sur gabarit vidé — cf. cahier 11 CT-08 ; restaurer le seed ensuite).
- **Étapes** :
  1. Ouvrir l'écran → onglets à **0**.
  2. Onglet **Voies** : état vide « Aucune épreuve… » + bouton
     **« + Ajouter l'épreuve »** → cliquer.
  3. Puis ajouter une voie T1 dans l'onglet désormais actif.
- **Résultat attendu** : l'épreuve « voie » est créée (« Épreuve ajoutée. »),
  puis le formulaire d'ajout de voie apparaît et la voie s'ajoute (R43).

### CT-10 — Refus d'un doublon d'épreuve (couvre R45)

- **Rôle** : admin. **Pré-condition** : rencontre au format seed (épreuve voie
  déjà présente).
- **Étapes** : forcer l'ajout d'une **2ᵉ épreuve de type « voie »** (l'UI ne le
  propose pas quand l'épreuve existe ; invoquer `ajouterEpreuveRencontre` avec
  `type=voie`).
- **Résultat attendu** : refus « Cette épreuve existe déjà. » ; une seule épreuve
  par type subsiste.

### CT-11 — Garde serveur : un coach ne peut pas écrire (couvre R40, R12 ; contournement)

- **Objet** : les Server Actions ne se fient pas à l'UI. Connecté **coach**,
  invoquer directement `ajouterEpreuveRencontre` / `ajouterVoieDifficulteRencontre`
  / `ajouterBlocRencontre` / `ajouterVoieVitesseRencontre`, ou tenter un `insert`
  sur `epreuve` / `voie_difficulte` / `bloc` / `voie_vitesse` via l'API REST.
- **Résultat attendu** : **refus** (garde admin + RLS). Aucune écriture.

### CT-12 — Responsive & tactile (mobile-first, conv. 08)

- **Étapes** : sur téléphone (ou DevTools ~375 px) — dérouler CT-02, CT-03,
  CT-06, CT-07.
- **Résultat attendu** :
  - Barre d'onglets et boutons ≥ 44 px de haut ; onglets tactiles sans
    débordement ; libellés lisibles.
  - Champs (niveau, type, cotation, points) ≥ 44 px ; police 16 px (pas de zoom
    iOS au focus) ; `<select>` lisibles (fond sombre, `color-scheme: dark`).
  - Listes de voies/blocs empilées sans débordement horizontal ; focus clavier
    visible ; messages d'erreur/succès reliés (lecteur d'écran).

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

> Le domaine (`validerNiveauVoie` R37, `validerPoints` R38, `champsPointsVoie`
> R38/R43) est couvert par Vitest (`npm run test`, `src/domaine/gabarit.test.ts`).
> Les gardes (admin/phase), la RLS et l'IHM (onglets, lecture seule, état vide)
> se vérifient ici, sur l'app réelle — en priorité **mobile**.
