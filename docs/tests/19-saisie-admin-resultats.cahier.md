# Cahier de test : Saisie & correction admin des résultats (spec #9)

> Couvre l'écran **admin** de saisie/correction des résultats
> (`/admin/rencontres/[id]/resultats`) : accès réservé à l'admin, **saisie de tout
> grimpeur tous clubs** en ③ compétition, **correction** en ④ clôture (dont un NP
> auto repassé en résultat réel), **coexistence** avec les coachs (dernière
> écriture), refus hors ③/④, **traçabilité de l'auteur** (R14), et l'écran
> **responsive** desktop/mobile. Les règles de saisie (issues, plafond, paliers)
> sont celles de la spec #6, réutilisées ; le domaine est couvert par Vitest.
> Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/09-saisie-admin-resultats.md` (R1–R14) ;
  `docs/specs/06-saisie-des-resultats.md` (règles de saisie réutilisées) ;
  `docs/specs/01-roles-et-autorisations.md` (R5/R7, rév. 2026-09-22).
- **Le domaine est couvert par Vitest** (`src/domaine/resultat.ts` — issues,
  plafond, unicité). Ce cahier vérifie l'**accès/rôle**, la **RLS**, l'**IHM
  cross-club**, la **coexistence** et la **traçabilité** — non automatisables.
- **Pré-requis** :
  - Migrations appliquées **jusqu'à `202609221000_resultat_auteur` incluse**
    (colonnes auteur R14 ; `grimpeur.sexe`, grant `epreuve` service_role). En
    local : `supabase db reset`.
  - `SUPABASE_SERVICE_ROLE_KEY` renseignée (énumération cross-club, ADR 0002/0003).
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true` (coexistence coach
    temporaire, CT-06).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Réutilise le seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-RENCONTRE-ENFANT** (`33333333-…-3333`, phase `competition`), structure
  **JD-STRUCTURE-ENFANT** + **JD-BLOCS-ENFANT** (barème « Matin »).
- **JD-EQUIPE-A1** (Club A) = **JD-ANA-M2** (Ana, M2·M3·M4) + **JD-BOB-T1** (Bob,
  T1·T2·T3) ; **JD-EQUIPE-B1** (Club B) = **JD-CLEO-T2** (Cléo, T2·T3·T4).

> **Cross-club** : la rencontre engage **deux clubs** (A et B) → l'admin doit voir
> et saisir pour **les deux**, là où un coach est borné au sien. Les **résultats
> ne sont pas seedés** (état « avant saisie ») : chaque CT saisit ce qu'il lui faut.

**Barème utile (Matin)** : M2 = 2, M3 = 3 ; T2 = 6 / pv 3, T3 = 7 / pv 4 ; B1 :
1er = 4, 2e = 3 ; B2 : 1er = 6, 2e = 5, 3e = 4.

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| JD-ADMIN (`admin@test.local`) | admin | Saisit/corrige tous clubs, change la phase (③↔④↔⑤) |
| JD-COACH-A (`coach@test.local`) | coach permanent Club A | Coexistence : saisit pour son club (CT-05) ; négatif d'accès (CT-01) |
| JD-JETON-COACHTEMP (scan QR) | coach temporaire Club A | Négatif d'accès à l'écran admin (CT-01) |

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R1)

- **Étapes** :
  1. Connecté **admin** : ouvrir `/admin/rencontres/33333333-…-3333/resultats`.
  2. Connecté **coach A** (`coach@test.local`) : ouvrir la même URL.
  3. **Non connecté** : ouvrir la même URL.
  4. **Coach temporaire** (scan QR) : ouvrir la même URL.
- **Résultat attendu** : (1) l'écran s'affiche (liste tous clubs + zone de saisie).
  (2)(3)(4) → **404** (écran masqué). L'écran **coach** `/coach/.../resultats`
  reste, lui, accessible au coach (spec #6 R1 inchangée).

### CT-02 — Liste tous clubs, recherche & filtre (couvre R2, R10)

- **Rôle** : admin. **Pré-condition** : rencontre en ③.
- **Étapes** :
  1. Observer la liste : grimpeurs **regroupés par club**.
  2. Utiliser la **recherche** (« Cléo »), puis le **filtre club** (Club B).
- **Résultat attendu** : la liste montre **Club A** (Ana, Bob) **et Club B**
  (Cléo) — les **deux** clubs. La recherche restreint par nom ; le filtre club
  n'affiche que le club choisi ; le compteur « n grimpeurs · 2 clubs » est correct.

### CT-03 — Saisie admin pour un autre club en ③ (couvre R2, R5, R7)

- **Rôle** : admin. **Pré-condition** : rencontre en ③.
- **Étapes** :
  1. Sélectionner **Cléo** (Club B).
  2. Saisir **T2 = Top**, **T3 = Prise valorisée**, **B1 = 1er essai**.
- **Résultat attendu** : les issues s'enregistrent (pastilles à jour) ; le **score**
  de Cléo passe à **14** (T2 Top 6 + T3 Prise valorisée 4 + B1 1er essai 4). La
  saisie a porté sur un grimpeur d'**un club dont l'admin n'est pas membre** (R2).

### CT-04 — Correction en ④ clôture, NP → réel (couvre R5, R8, R9)

- **Rôle** : admin. **Pré-condition** : Ana a saisi **M2 = Top** en ③ ; **M3 non
  saisie**. Passer la rencontre en **④ clôture** (le NP auto pose M3 = NP, M4 = NP,
  blocs = NP — spec #6 R18).
- **Étapes** :
  1. Ouvrir l'écran admin (le libellé devient **« Correction »**, badge Clôture).
  2. Sélectionner Ana ; sur **M3** (affiché **NP**), choisir **Top**.
- **Résultat attendu** : M3 passe de **NP** à **Top** (0 → 3 pts) ; le score
  d'Ana augmente ; aucun autre résultat n'est touché. En ④, **seul l'admin** peut
  écrire (le coach, lui, aurait la saisie fermée — cf. cahier 17).

### CT-05 — Coexistence admin / coach, dernière écriture (couvre R6)

- **Pré-condition** : rencontre en ③.
- **Étapes** :
  1. **Coach A** saisit **Bob T1 = Échec** (écran coach).
  2. **Admin** ouvre son écran, sélectionne Bob, saisit **T1 = Top**.
  3. Recharger les deux écrans.
- **Résultat attendu** : il n'y a **qu'un seul** résultat pour Bob·T1 = **Top**
  (dernière écriture, unicité `(voie, grimpeur)`) ; **aucun doublon**. L'inverse
  (admin puis coach) donne le même comportement.

### CT-06 — Refus hors fenêtre ③/④ (couvre R3, R5)

- **Rôle** : admin.
- **Étapes** :
  1. Passer la rencontre en **② préparation** (jour J) ou **① pré-compétition**.
  2. Tenter d'ouvrir/saisir sur l'écran admin ; en ③, saisir puis passer en **⑤**
     et re-tenter (contournement : re-soumettre l'action).
- **Résultat attendu** : en **①/②**, la saisie est **fermée** (message « saisie
  admin ouverte en ③/④ seulement ») ; en **⑤**, l'écriture est **refusée sans
  effet** (résultats figés). La Server Action revérifie la phase indépendamment de
  l'UI (R3).

### CT-07 — Traçabilité de l'auteur (couvre R14)

- **Objet** : chaque écriture conserve son **auteur** (compte + rôle).
- **Étapes** :
  1. Admin saisit un résultat (ex. CT-03) ; coach saisit un autre (ex. CT-05).
  2. Inspecter en base (SQL Editor / psql) :
     `select grimpeur_id, issue, auteur_role, auteur_utilisateur_id from
     interclub.resultat_voie order by updated_at desc;`
- **Résultat attendu** : la ligne écrite par l'admin porte `auteur_role = 'admin'`,
  celle du coach `auteur_role = 'coach'` ; `auteur_utilisateur_id` correspond à
  l'utilisateur auth (non nul). Une **correction** met l'auteur **à jour** (dernier
  auteur).

### CT-08 — Entrée depuis le tableau de bord (couvre R12)

- **Rôle** : admin.
- **Étapes** :
  1. Ouvrir `/admin/rencontres/33333333-…-3333` (tableau de bord).
  2. Selon la phase, repérer l'action.
- **Résultat attendu** : en **③**, bouton **« Saisir les résultats (tous clubs) »** ;
  en **④**, **« Corriger les résultats »** ; **absent** en ①/②/⑤. Le clic mène à
  l'écran de saisie admin.

### CT-09 — Règles de saisie réutilisées (couvre R7)

- **Rôle** : admin. **Pré-condition** : rencontre en ③.
- **Étapes** :
  1. Sur une voie **moulinette** (M2), vérifier les issues proposées.
  2. (Contournement API) soumettre `issue = 'prise_valorisee'` sur M2, ou
     `issue = 'zone1'` (enfant).
- **Résultat attendu** : l'IHM ne propose que **Top / Échec** sur une moulinette ;
  une issue incohérente est **refusée** (message R7 = spec #6 R10/R12), en dernier
  ressort par le **trigger** BDD. Mêmes garde-fous que la saisie coach.

### CT-10 — Responsive desktop / mobile (couvre R11)

- **Étapes** : sur **ordinateur** (large) puis **téléphone** (~375 px) — parcourir
  CT-02 et CT-03.
- **Résultat attendu** :
  - **Desktop (≥ 1024 px)** : maître-détail **deux colonnes** (liste + saisie),
    voies et blocs **côte à côte** ; l'écran occupe la largeur.
  - **Mobile (< 1024 px)** : **une colonne** ; sélectionner un grimpeur affiche le
    détail avec **« ← Liste des grimpeurs »** pour revenir ; pas de scroll
    horizontal ; boutons d'issue et champ de recherche confortables (≥ 44 px,
    16 px anti-zoom).

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
