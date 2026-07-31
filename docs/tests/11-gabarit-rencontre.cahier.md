# Cahier de test : Gabarit de rencontre & saison (spec #3, R27–R37)

> Couvre le gabarit par catégorie (`/admin/gabarit`), la **copie** du gabarit à
> la création d'une rencontre, la modification de structure d'une rencontre
> existante, et le filtre/affichage **saison** de la liste des rencontres.
> Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md`
  (Saison R27–R28 ; Gabarit R29–R37) ;
  `docs/specs/01-roles-et-autorisations.md` (R12 : écriture réservée à l'admin ;
  R37 : dérivation de la saison depuis la date).
- **Domaine** : `src/domaine/gabarit.ts` (`validerNiveauVoie`, plages
  `M1–M4` / `T1–T10`, 14 tests Vitest `gabarit.test.ts`) ;
  `src/domaine/rencontre.ts` (saison dérivée).
- **Data / actions** : `src/lib/gabarit/` (lecture + `ajouter/supprimer…Gabarit`,
  `ajouterVoieDifficulteRencontre`) ; `src/lib/rencontres/actions.ts`
  (création via RPC `creer_rencontre_avec_gabarit`).
- **Migration** : `202607291000_gabarit_et_voies_epreuve.sql` — tables
  `gabarit_epreuve` / `gabarit_voie_difficulte` / `gabarit_bloc` /
  `gabarit_voie_vitesse`, tables rencontre `voie_difficulte` / `bloc`, colonne
  `voie_vitesse.libelle`, RPC `creer_rencontre_avec_gabarit`, seed enfant/ado.
  **Doit être appliquée** (validée en local ; recette/prod à la main).
- **Pré-requis** :
  - Migrations + seed `01-jeu-de-test.sql` chargés ; migration gabarit appliquée.
  - Seed gabarit présent : enfant (14 voies diff, 2 blocs, Filles/Garçons),
    ado (10 voies diff en tête, 2 blocs, Filles/Garçons).
  - Comptes (mdp `interclub`) : `admin@test.local` (admin),
    `coach@test.local` (coach Club A).
  - Au moins un club existant (seed : Club A, Club B).
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Depuis l'accueil (connecté **admin**) : bouton **« Gabarit »** → `/admin/gabarit`.
Liste des rencontres : bouton **« Rencontres »** → `/admin/rencontres`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R12)

- **admin** : `/admin/gabarit` s'affiche (les deux gabarits enfant / ado). ✅
- **coach** (`coach@test.local`) : `/admin/gabarit` → **404** (écran masqué). ✅
- **non connecté** : `/admin/gabarit` → **404**. ✅

### CT-02 — Contenu initial des gabarits (seed, R33/R34)

- **Étapes** : ouvrir `/admin/gabarit`.
- **Attendu** :
  - Gabarit **enfant** : 14 voies de difficulté — M1–M4 (moulinette) et T1–T10
    (tête), 2 blocs (B1, B2), 2 voies de vitesse **« Filles »** et
    **« Garçons »**.
  - Gabarit **ado** : 10 voies de difficulté **en tête** (T1–T10, aucune
    moulinette), 2 blocs, 2 voies de vitesse « Filles » / « Garçons ».

### CT-03 — Ajouter une voie de difficulté au gabarit (R31)

- **Étapes** : gabarit ado → ajouter une voie **niveau T7**, type **tête**,
  cotation « 6b ».
- **Attendu** : la voie apparaît ; le gabarit ado compte désormais **2 voies T7**
  (niveau non unique autorisé — voies doublées, R31). Message « Voie ajoutée. ».

### CT-04 — Niveau hors plage refusé (R37)

- **Étapes** (validation domaine `validerNiveauVoie`) :
  1. Gabarit **ado** → tenter une voie **moulinette** (ou niveau `M2`).
  2. Gabarit **ado** → tenter un niveau `T11`.
  3. Gabarit **enfant** → tenter un niveau `M5`.
- **Attendu** : chaque tentative est **refusée** avec un message de niveau
  invalide ; aucune voie créée.

### CT-05 — Supprimer une voie du gabarit (R31)

- **Étapes** : supprimer la voie T7 ajoutée en CT-03.
- **Attendu** : la voie disparaît ; message « Voie supprimée. ». Le gabarit
  revient à 1 voie T7.

### CT-05a — Ajouter / supprimer un bloc du gabarit (R31)

- **Étapes** : gabarit ado, épreuve **Bloc** → saisir le code « B3 » → **+ Bloc**.
  Puis supprimer B3 (✕).
- **Attendu** : « B3 » apparaît (« Bloc ajouté. ») puis disparaît (« Bloc
  supprimé. »). Ajouter un code **déjà existant** (ex. « B1 ») → refus
  « Le bloc « B1 » existe déjà. » (unicité `(épreuve, code)`).

### CT-05b — Ajouter / supprimer une voie de vitesse + catégorie mixte (R31, R32)

- **Étapes** : gabarit ado, épreuve **Vitesse** → saisir le libellé **« Mixte »**
  (suggestions Filles / Garçons / Mixte proposées) → **+ Voie**. Puis supprimer.
- **Attendu** : la voie « Mixte » s'ajoute à côté de Filles / Garçons (libellé
  libre, R32) puis se supprime. Un libellé vide est refusé.

### CT-06 — Créer une rencontre : copie du gabarit (nominal, R30)

- **Pré-condition** : gabarit enfant au format seed (CT-02).
- **Étapes** : `/admin/rencontres` → créer une rencontre, catégorie **enfant**.
- **Attendu** : rencontre créée en phase **pré-compétition** ; sa structure
  reprend le gabarit **copié** : **3 épreuves**, **14 voies de difficulté**,
  **2 blocs**, **2 voies de vitesse** (libellées « Filles » / « Garçons », R32).

### CT-07 — La modification du gabarit n'affecte pas les rencontres créées (R30)

- **Pré-condition** : la rencontre enfant de CT-06 existe.
- **Étapes** : modifier le gabarit enfant (ajouter/supprimer une voie), puis
  rouvrir la rencontre de CT-06.
- **Attendu** : la rencontre **conserve** sa structure d'origine (copie figée) ;
  seules les **nouvelles** rencontres reprennent le gabarit modifié.

### CT-08 — Gabarit vide → rencontre sans format (R35)

- **Pré-condition** : vider un gabarit (ex. ado : supprimer voies/blocs/vitesse)
  — ou tester sur une catégorie sans seed.
- **Étapes** : créer une rencontre de cette catégorie.
- **Attendu** : la rencontre est créée **sans épreuve ni voie** ; aucune erreur.
  (Restaurer le seed ado après le test.)

### CT-09 — Modifier la structure d'une rencontre existante (R36)

- **Pré-condition** : rencontre en phase **pré-compétition** (ex. CT-06).
- **Étapes** : ajouter une voie de difficulté à la rencontre (ex. 2ᵉ voie T6).
- **Attendu** : la voie est ajoutée **à cette rencontre seule** ; le gabarit et
  les autres rencontres ne sont pas touchés.

### CT-10 — Modification de structure interdite hors pré-compétition (R36)

- **Pré-condition** : faire avancer la rencontre en **compétition**.
- **Étapes** : tenter d'ajouter une voie de difficulté à la rencontre.
- **Attendu** : **refus** — « La structure ne peut être modifiée qu'en phase
  pré-compétition (R36). » Aucune voie ajoutée.

### CT-11 — Saison affichée sur la liste (R27)

- **Étapes** : `/admin/rencontres` → observer chaque ligne.
- **Attendu** : chaque rencontre affiche sa **saison calculée** (ex.
  « Saison 2025 »), dérivée de sa date (spec #1 R37). Aucun champ « saison » n'est
  saisi à la création.

### CT-12 — Filtre par saison, saison courante par défaut (R28)

- **Pré-condition** : au moins deux rencontres de saisons différentes.
- **Étapes** : ouvrir la liste ; observer le sélecteur de saison, puis en choisir
  une autre.
- **Attendu** : par défaut la **saison courante** (calculée depuis la date du
  jour) est pré-sélectionnée et la liste est filtrée en conséquence ; changer de
  saison affiche l'historique correspondant.

### CT-13 — Atomicité de la copie du gabarit (R30, cas d'erreur)

- **Objet** : si la copie du gabarit échoue en cours de route, la rencontre
  **n'est pas** créée (transaction RPC annulée intégralement).
- **Vérification** : la création passe par le RPC `creer_rencontre_avec_gabarit`
  (une seule transaction) — voir `src/lib/rencontres/actions.ts`. En cas d'échec,
  aucune rencontre partielle ne subsiste en base.

### CT-14 — Garde serveur : un coach ne peut pas écrire (R12 ; contournement)

- **Objet** : les Server Actions ne se fient pas à l'UI. Connecté **coach**,
  invoquer directement `ajouterVoieDifficulteGabarit` /
  `supprimerVoieDifficulteGabarit` / `ajouterVoieDifficulteRencontre`, ou tenter
  un `insert`/`delete` sur les tables `gabarit_*` / `voie_difficulte` / `bloc`
  via l'API REST.
- **Attendu** : **refus** (garde admin + RLS). Aucune écriture.

### CT-15 — Responsive & tactile (mobile-first, conv. 08)

- **Étapes** : sur téléphone (ou DevTools ~375 px) — parcourir CT-02, CT-03,
  CT-06, CT-12.
- **Attendu** :
  - Champs (niveau, cotation, sélecteurs) et boutons ≥ 44 px de haut ; pas de
    zoom iOS au focus (police 16 px).
  - Listes d'épreuves/voies empilées lisiblement, sans débordement horizontal.
  - `<select>` lisibles (fond sombre, `color-scheme: dark`) ; focus clavier
    visible ; messages d'erreur/succès reliés (lecteur d'écran).

## Registre d'exécution

| Cas | Environnement | Date | Testeur | Verdict | Notes |
|-----|---------------|------|---------|---------|-------|
| CT-01 | | | | ⬜ | |
| CT-02 | | | | ⬜ | |
| CT-03 | | | | ⬜ | |
| CT-04 | | | | ⬜ | |
| CT-05 | | | | ⬜ | |
| CT-05a | | | | ⬜ | |
| CT-05b | | | | ⬜ | |
| CT-06 | | | | ⬜ | |
| CT-07 | | | | ⬜ | |
| CT-08 | | | | ⬜ | |
| CT-09 | | | | ⬜ | |
| CT-10 | | | | ⬜ | |
| CT-11 | | | | ⬜ | |
| CT-12 | | | | ⬜ | |
| CT-13 | | | | ⬜ | |
| CT-14 | | | | ⬜ | |
| CT-15 | | | | ⬜ | |

> Le domaine (`validerNiveauVoie`, plages R37 ; saison dérivée) est couvert par
> Vitest (`npm run test`, `src/domaine/gabarit.test.ts`,
> `src/domaine/rencontre.test.ts`). La copie du gabarit (RPC), les gardes, la RLS
> et l'IHM se vérifient ici, sur l'app réelle — en priorité **mobile**.
