# Cahier de test : Paramétrage — Rencontres (T8)

> Couvre la tranche **T8** (paramétrage) : l'écran admin `/admin/rencontres`
> (créer / modifier / changer la phase / supprimer une rencontre, R12), livré de
> bout en bout (UI mobile-first + Server Actions + RLS). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/01-roles-et-autorisations.md` (R12 : seul
  l'admin crée/modifie/supprime une rencontre ; R5 : cycle de vie en trois
  phases successives ; R22 : interdit au coach).
- **Domaine** : `src/domaine/rencontre.ts` (`normaliserSaisieRencontre`,
  `phaseSuivante`/`phasePrecedente`, 14 tests Vitest).
- **Migration** : aucune (table `rencontre` + policies `rencontre_*_admin` déjà
  en place — T6, migration `202607251000`).
- **Pré-requis** :
  - Migrations + seed `01-jeu-de-test.sql` chargés (`supabase db reset` en local).
  - Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
    (coach Club A).
  - Au moins un club existant (seed : Club A, Club B).
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Depuis l'accueil (connecté **admin**) : bouton **« Rencontres »** →
`/admin/rencontres`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R12, R22)

- **admin** : `/admin/rencontres` s'affiche (formulaire + liste). ✅
- **coach** (`coach@test.local`) : `/admin/rencontres` → **404** (écran masqué). ✅
- **non connecté** : `/admin/rencontres` → **404**. ✅

### CT-02 — Créer une rencontre (nominal, R12)

- **Étapes** : choisir une date, un **club porteur**, une **catégorie** → **Créer
  la rencontre**.
- **Attendu** : message « Rencontre créée. » ; la rencontre apparaît dans la
  liste avec la phase **Pré-compétition** (R5) ; le formulaire se vide.

### CT-03 — Champs obligatoires (validation domaine)

- **Étapes** : soumettre sans date (ou sans club, ou sans catégorie).
- **Attendu** : erreur explicite (« La date de la rencontre est obligatoire. » /
  « Le club porteur est obligatoire. » / « La catégorie est invalide. ») ; aucune
  création.

### CT-04 — Modifier une rencontre (R12)

- **Étapes** : sur une ligne, **Modifier** → changer date/club/catégorie →
  **Enregistrer**.
- **Attendu** : la liste reflète les nouvelles valeurs ; l'éditeur se referme.

### CT-05 — Faire avancer la phase (cycle de vie, R5)

- **Étapes** : sur une rencontre en **Pré-compétition**, cliquer
  **« Compétition → »**, puis **« Résultats publics → »**.
- **Attendu** : l'étiquette de phase suit l'ordre ; à **Résultats publics**, plus
  de bouton « suivant ». Le bouton **« ← »** permet de revenir en arrière.

### CT-06 — Supprimer une rencontre sans dépendance (R12)

- **Pré-condition** : une rencontre à **0 équipe / 0 épreuve** (ex. créée en CT-02).
- **Étapes** : **Supprimer** → **Oui, supprimer**.
- **Attendu** : la rencontre disparaît de la liste.

### CT-07 — Suppression avec dépendances (cascade signalée)

- **Pré-condition** : la rencontre du seed (équipes + épreuves rattachées).
- **Étapes** : **Supprimer** → observer le libellé de confirmation.
- **Attendu** : la confirmation signale la cascade (« Supprimer (et ses
  équipes/épreuves) ? »). Après confirmation, la rencontre **et** ses
  équipes/épreuves sont supprimées (FK `on delete cascade`).

### CT-08 — Garde serveur : un coach ne peut pas écrire (R12/R22 ; contournement)

- **Objet** : les Server Actions ne se fient pas à l'UI. Connecté **coach**,
  invoquer directement `creerRencontre` / `modifierRencontre` /
  `changerPhaseRencontre` / `supprimerRencontre` (POST), ou tenter un
  `insert`/`update`/`delete` sur `interclub.rencontre` via l'API REST.
- **Attendu** : **refus** (garde admin + RLS `rencontre_*_admin`). Aucune écriture.

### CT-09 — Responsive & tactile (mobile-first, conv. 08)

- **Étapes** : sur téléphone (ou DevTools ~375 px) — parcourir CT-02, CT-04,
  CT-05.
- **Attendu** :
  - Champs (date, sélecteurs) et boutons ≥ 44 px de haut ; pas de zoom iOS au
    focus (police 16 px).
  - Formulaire et lignes empilés lisiblement, sans débordement horizontal.
  - Focus visible au clavier ; messages d'erreur/succès reliés (lecteur d'écran).

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

> Le domaine (`normaliserSaisieRencontre`, phases) est couvert par Vitest
> (`npm run test`, `src/domaine/rencontre.test.ts`). Le reste (UI, RLS, garde) se
> vérifie ici, sur l'app réelle — en priorité **mobile**.
