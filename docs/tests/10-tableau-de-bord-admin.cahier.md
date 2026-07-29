# Cahier de test : Tableau de bord admin

> Couvre la **spec #4 — Tableau de bord admin** : route `/admin`, bandeau de
> statistiques, carte Rencontres avec actions de phase inline, cartes d'accès
> secondaires (Clubs, Grimpeurs, Accès). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/04-tableau-de-bord-admin.md` (R1–R13) ;
  `docs/specs/03-ecrans-de-parametrage-admin.md` (cycle de phases R17) ;
  `docs/specs/01-roles-et-autorisations.md` (R5, R11–R13, R22).
- **Migration** : aucune (tables et policies existantes — T6 + T8).
- **Pré-requis** :
  - Seed `01-jeu-de-test.sql` chargé : au moins deux clubs, une rencontre en
    Pré-compétition, une en Compétition.
  - Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
    (coach Club A).
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Depuis l'accueil (connecté **admin**) : bouton **« Ouvrir le tableau de bord »**
→ `/admin`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre : R1, R2)

- **admin** : `/admin` s'affiche (tableau de bord visible). ✅
- **coach** (`coach@test.local`) : `/admin` → **404** (écran masqué). ✅
- **non connecté** : `/admin` → **404**. ✅
- **Accueil** : connecté **admin**, le lien **« Ouvrir le tableau de bord »**
  pointe vers `/admin` et est le seul lien d'administration visible. ✅

### CT-02 — Bandeau de statistiques (couvre : R13)

- **Pré-condition** : seed chargé — N clubs, M rencontres, G grimpeurs dont C en
  Compétition.
- **Étapes** : se connecter admin → ouvrir `/admin`.
- **Attendu** : le bandeau affiche 4 chiffres correspondant exactement à l'état
  de la base : nombre de clubs, nombre de rencontres, nombre de grimpeurs, nombre
  de rencontres en phase Compétition.

### CT-03 — Carte Rencontres — affichage (couvre : R5, R10)

- **Étapes** : `/admin` → observer la carte **Rencontres**.
- **Attendu** :
  - Les rencontres sont triées par **date décroissante**.
  - Chaque ligne affiche la date (format lisible), la catégorie, le club porteur,
    et une **étiquette de phase** colorée.
  - Si la base contient plus de 5 rencontres, seules les 5 plus récentes
    apparaissent ; un lien **« Voir tout »** est visible.
  - Le lien **« Gérer → »** (haut de carte) pointe vers `/admin/rencontres`.

### CT-04 — État vide de la carte Rencontres (couvre : R11)

- **Pré-condition** : aucune rencontre en base.
- **Étapes** : `/admin`.
- **Attendu** : la carte affiche un message d'invitation avec un lien vers
  `/admin/rencontres` pour créer la première rencontre.

### CT-05 — Avancer la phase depuis le tableau de bord (couvre : R6, R7, R8)

- **Pré-condition** : une rencontre en **Pré-compétition** visible dans la carte.
- **Étapes** :
  1. Cliquer **« Compétition → »** sur la ligne de cette rencontre.
  2. Observer la carte sans rechargement de page.
- **Attendu** :
  - L'étiquette passe à **Compétition** (R7).
  - Le bouton **« Compétition → »** disparaît ; le bouton **« ← Pré-compétition »**
    apparaît (R7).
  - Aucune navigation vers un autre écran (R6).

### CT-06 — Revenir en arrière sur la phase (couvre : R6, R7)

- **Pré-condition** : une rencontre en **Compétition** visible dans la carte.
- **Étapes** : cliquer **« ← Pré-compétition »**.
- **Attendu** : l'étiquette repasse à **Pré-compétition** ; le bouton
  **« Compétition → »** réapparaît.

### CT-07 — Bornes du cycle de phase (couvre : R7)

- **Rencontre en Pré-compétition** : pas de bouton « revenir » (première phase). ✅
- **Rencontre en Résultats publics** : pas de bouton « avancer » (dernière phase). ✅

### CT-08 — Cartes d'accès secondaires (couvre : R12)

- **Étapes** : `/admin` — observer les cartes **Clubs**, **Grimpeurs**, **Accès**.
- **Attendu** :
  - Carte **Clubs** : affiche le nombre de clubs, lien vers `/admin/clubs`.
    Cliquer : arrivée sur `/admin/clubs`. ✅
  - Carte **Grimpeurs** : affiche le nombre de grimpeurs, lien vers
    `/admin/grimpeurs`. Cliquer : arrivée sur `/admin/grimpeurs`. ✅
  - Carte **Accès** : liens **Jetons QR** (→ `/admin/jetons`) et **Rôles** (→
    `/admin/mapping`) cliquables. ✅

### CT-09 — Garde serveur : action de phase refusée à un non-admin (couvre : R8)

- **Objet** : la Server Action `changerPhaseRencontre` ne se fie pas à l'UI.
  Connecté **coach**, invoquer directement `changerPhaseRencontre` (POST) sur
  l'id d'une rencontre, ou tenter un `UPDATE` sur `interclub.rencontre` via
  l'API REST.
- **Attendu** : **refus** (garde admin + RLS `rencontre_update_admin`). Aucun
  changement de phase.

### CT-10 — Responsive & tactile (couvre : R4)

- **Étapes** : ouvrir `/admin` sur téléphone (ou DevTools ~375 px).
- **Attendu** :
  - Une colonne unique, carte **Rencontres** en tête.
  - Boutons **Avancer / Revenir** ≥ 44 px de haut, cliquables sans erreur.
  - Pas de débordement horizontal ; étiquettes et dates lisibles (police ≥ 16 px,
    pas de zoom iOS au focus).
  - Focus visible au clavier sur tous les liens et boutons.

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

> La logique de phase (`phaseSuivante`/`phasePrecedente`) est couverte par Vitest
> (`src/domaine/rencontre.test.ts`). Le reste (IHM, RLS, garde, affichage stats)
> se vérifie ici, sur l'app réelle — en priorité **mobile**.
