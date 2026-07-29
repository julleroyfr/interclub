# Cahier de test : Paramétrage — Grimpeurs (T8)

> Couvre la tranche **T8** (paramétrage) : le volet **admin** du roster,
> l'écran `/admin/grimpeurs` (ajouter / modifier / supprimer un grimpeur d'un
> club), livré de bout en bout (UI mobile-first + Server Actions + RLS). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md` (écran
  Grimpeurs, R20–R26) ; `docs/specs/01-roles-et-autorisations.md` (R18 : le
  coach gère les grimpeurs de son club ; R11/R13 : l'admin paramètre ; R6 :
  roster éditable hors phase). Cet écran est le **volet admin** (gère tout club) ;
  le volet **coach** (son seul club) relèvera d'une tranche coach ultérieure.
- **Domaine** : `src/domaine/grimpeur.ts` (`normaliserSaisieGrimpeur`, 9 tests
  Vitest).
- **Migration** : aucune (table `grimpeur` + policies `grimpeur_*` déjà en place
  — T6, migration `202607251000`).
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
- **non connecté** : `/admin/grimpeurs` → **404**. ✅

### CT-02 — Ajouter un grimpeur (nominal, R18)

- **Étapes** : choisir un **club**, saisir **prénom**, **nom**, **année de
  naissance** → **Ajouter le grimpeur**.
- **Attendu** : message « Grimpeur « Prénom Nom » ajouté. » ; il apparaît dans la
  liste (club, année, 0 engagement) ; le formulaire se vide.

### CT-03 — Champs obligatoires (validation domaine)

- **Étapes** : soumettre sans prénom (ou sans nom, ou sans année).
- **Attendu** : erreur explicite (« Le nom du grimpeur est obligatoire. » /
  « Le prénom du grimpeur est obligatoire. »/ message sur l'année) ; aucune
  création.

### CT-04 — Année de naissance invalide (validation domaine)

- **Étapes** : saisir une année non numérique (`abcd`), ou hors bornes (`1800`,
  `3000`).
- **Attendu** : erreur (« année à 4 chiffres » / « comprise entre 1900 et
  2100 ») ; aucune création. Le champ `number` limite déjà la saisie côté
  navigateur — vérifier aussi le rejet serveur (contournement API).

### CT-05 — Modifier un grimpeur (R18)

- **Étapes** : sur une ligne, **Modifier** → changer club/prénom/nom/année →
  **Enregistrer**.
- **Attendu** : la liste reflète les nouvelles valeurs ; l'éditeur se referme.

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
  - Champs (sélecteur club, textes, année) et boutons ≥ 44 px de haut ; pas de
    zoom iOS au focus (police 16 px).
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

> Le domaine (`normaliserSaisieGrimpeur`) est couvert par Vitest (`npm run test`,
> `src/domaine/grimpeur.test.ts`). Le reste (UI, RLS, garde) se vérifie ici, sur
> l'app réelle — en priorité **mobile**.
