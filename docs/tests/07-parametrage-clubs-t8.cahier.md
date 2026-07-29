# Cahier de test : Paramétrage — Clubs (T8)

> Couvre la tranche **T8** (premier écran de paramétrage) : l'écran admin
> `/admin/clubs` (créer / renommer / supprimer un club, R11), livré de bout en
> bout (UI mobile-first + Server Actions + RLS). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md` (écran
  Clubs, R8–R12) ; `docs/specs/01-roles-et-autorisations.md` (R11 : seul l'admin
  crée/modifie/supprime un club ; R22 : interdit au coach).
- **Domaine** : `src/domaine/club.ts` (`normaliserNomClub`, 6 tests Vitest).
- **Migration** : aucune (table `club` + policies `club_*_admin` déjà en place —
  T6, migration `202607251000`).
- **Pré-requis** :
  - Migrations + seed `01-jeu-de-test.sql` chargés (`supabase db reset` en local).
  - Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
    (coach Club A).
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Depuis l'accueil (connecté **admin**) : bouton **« Clubs »** → `/admin/clubs`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R11, R22)

- **admin** : `/admin/clubs` s'affiche (formulaire + liste). ✅
- **coach** (`coach@test.local`) : `/admin/clubs` → **404** (écran masqué). ✅
- **non connecté** : `/admin/clubs` → **404**. ✅

### CT-02 — Créer un club (nominal, R11)

- **Étapes** : saisir « Grimpe Sud » → **Créer le club**.
- **Attendu** : message « Club « Grimpe Sud » créé. » ; le club apparaît dans la
  liste ; le champ se vide.

### CT-03 — Nom obligatoire (validation domaine)

- **Étapes** : laisser le champ vide (ou espaces) → **Créer**.
- **Attendu** : erreur « Le nom du club est obligatoire. » sous le champ ; aucune
  création.

### CT-04 — Nom en double (unicité R11)

- **Étapes** : créer un club « Club A » (déjà présent via le seed).
- **Attendu** : erreur « Un club porte déjà ce nom. » ; aucune création.

### CT-05 — Renommer un club (R11)

- **Étapes** : sur une ligne, **Renommer** → modifier le nom → **Enregistrer**.
- **Attendu** : la liste reflète le nouveau nom ; l'éditeur se referme.
- **Variante** : renommer vers un nom existant → erreur d'unicité, éditeur ouvert.

### CT-06 — Supprimer un club sans dépendance (R11)

- **Pré-condition** : un club à **0 rencontre / 0 grimpeur** (ex. un club créé en
  CT-02).
- **Étapes** : **Supprimer** → **Oui, supprimer**.
- **Attendu** : le club disparaît de la liste.

### CT-07 — Suppression bloquée si dépendances (intégrité)

- **Pré-condition** : **Club A** (seed) porte une rencontre et des grimpeurs.
- **Étapes** : observer le bouton **Supprimer** de Club A.
- **Attendu** : bouton **désactivé** (infobulle « Club référencé… »). Le compteur
  « n rencontre(s) · n grimpeur(s) » est non nul.
- **Contournement (facultatif)** : forcer la suppression par appel direct →
  refus, message « Ce club est référencé … : suppression impossible. »

### CT-08 — Garde serveur : un coach ne peut pas écrire (R11/R22 ; contournement)

- **Objet** : les Server Actions ne se fient pas à l'UI. Connecté **coach**,
  invoquer directement `creerClub`/`renommerClub`/`supprimerClub` (POST) ou
  tenter un `insert`/`update`/`delete` sur `interclub.club` via l'API REST.
- **Attendu** : **refus** (garde admin + RLS `club_*_admin`). Aucune écriture.

### CT-09 — Responsive & tactile (mobile-first, conv. 08)

- **Étapes** : sur téléphone (ou DevTools ~375 px) — parcourir CT-02, CT-05,
  CT-06.
- **Attendu** :
  - Champs et boutons ≥ 44 px de haut (cibles tactiles) ; pas de zoom iOS au
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

> Le domaine (`normaliserNomClub`) est couvert par Vitest (`npm run test`,
> `src/domaine/club.test.ts`). Le reste (UI, RLS, garde) se vérifie ici, sur
> l'app réelle — en priorité **mobile**.
