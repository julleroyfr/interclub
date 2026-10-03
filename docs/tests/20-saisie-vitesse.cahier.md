# Cahier de test : Saisie de la vitesse — juge (spec #10)

> Couvre la **saisie des résultats de vitesse** par le **juge** sur l'écran
> `/juge` (session QR éphémère) : sélection d'un grimpeur, saisie d'un **temps**
> (secondes), d'une **chute** ou d'une **non-présentation**, **un seul résultat
> par grimpeur** avec **correction = remplacement**, liste de **tous les
> compétiteurs engagés** (tous clubs) **groupée par sexe**, **recherche** + filtre
> **« à saisir »** (volume), **fenêtre ③ compétition** uniquement, **lecture au
> fil de l'eau** (écran coach, seule lecture), et écran **responsive** (PC /
> tablette). Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** :
  `docs/specs/10-saisie-vitesse-juge.md` (R1–R17) ;
  `docs/specs/01-roles-et-autorisations.md` (R29–R33, R30 précision) ;
  `docs/specs/02-authentification-et-sessions-qr.md` (R11/R12/R17) ;
  `docs/specs/06-saisie-des-resultats.md` (R22, vitesse en lecture seule).
- **Pré-requis** :
  - Migrations appliquées jusqu'à **`202609221400_saisie_vitesse_juge`** incluse —
    en local : `supabase db reset` (migrations + seed).
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true`.
  - App lancée : `npm run dev` → port **3011**.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Le seed `01-jeu-de-test.sql` fournit la rencontre **ENFANT** `33333333-…-3333`
(phase `competition`), son **épreuve de vitesse** `…8803`, **deux voies de
vitesse** (`JD-VITESSE`) et un **jeton juge** actif sur la voie n°1
(`JD-JETON-JUGE`). Les compétiteurs engagés de cette rencontre couvrent **deux
clubs** et **les deux sexes** (R2/R12) :

- **Ana** (Club A, **Femmes**) et **Bob** (Club A, **Hommes**) — équipe A1 ;
- **Cléo** (Club B, **Femmes**) — équipe B1 (cross-club, R2).

Aucun **temps de vitesse** n'est seedé : l'état de départ est « à saisir » pour
tous (cf. `00-catalogue-jeux-de-donnees.md` § Notes).

> **Basculer la phase** (SQL Editor) :
> `update interclub.rencontre set phase = '<phase>' where id = '33333333-3333-3333-3333-333333333333';`
> phases : `pre_competition` → `preparation` → `competition` → `cloture` →
> `resultats_publics`.

## Comptes / sessions de test

| Compte / session | Rôle | Usage |
| --- | --- | --- |
| Scan `JD-JETON-JUGE` (`/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`) | juge (session QR) | Ouvre `/juge` et saisit les temps |
| `coach@test.local` | coach permanent Club A | Vérifie la **lecture seule** de la vitesse (écran résultats) |
| `admin@test.local` | admin | Change la phase ; négatif d'accès `/juge` |

## Cas de test

> **Exécution automatique** : `e2e/juge-vitesse.spec.ts` (`npm run
> test:cahier:juge`) rejoue CT-01 → CT-11 (CT-09 par impersonation SQL du juge,
> transaction annulée). **Résidus manuels** : couleurs, confort de saisie au
> clavier sur un vrai poste juge.

### CT-01 — Ouverture de la session juge et roster (couvre : R1, R2, R12)

- **Rôle / session** : juge (scan `JD-JETON-JUGE`).
- **Pré-condition** : rencontre enfant `33333333` en phase `competition`.
- **Étapes** :
  1. Ouvrir `/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`.
  2. Attendre la redirection.
- **Résultat attendu** : redirection vers **`/juge`** ; l'en-tête indique
  « ⚡ Vitesse — Club A · 19 septembre 2026 », le couloir et le badge **③
  Compétition**. La liste montre **tous les compétiteurs engagés, tous clubs** :
  colonne **Femmes** (Ana, Cléo) et colonne **Hommes** (Bob), triés
  alphabétiquement, tous « à saisir ». Compteurs **séparés par sexe** :
  **Femmes 0 / 2**, **Hommes 0 / 1** (R14).
- **RLS / sécurité** : le juge voit **Cléo (Club B)** bien qu'il n'ait aucun accès
  coach — la lecture passe par la RPC `liste_grimpeurs_vitesse` (R2).

### CT-02 — Saisir un temps (couvre : R7, R8, R13, R14)

- **Rôle / session** : juge.
- **Étapes** :
  1. Sur la ligne **Bob**, saisir `8.123` dans le champ temps puis **OK** (ou
     `Entrée`).
- **Résultat attendu** : la pastille de Bob affiche **« 8,123 s »** ; le compteur
  **Hommes** passe à **1 / 1** (le compteur Femmes est inchangé) et sa barre
  avance. La valeur reste visible après rafraîchissement (persistée).

### CT-03 — Chute puis correction en temps (couvre : R10, R11)

- **Rôle / session** : juge.
- **Étapes** :
  1. Sur **Ana**, cliquer **Chute** → la pastille affiche « Chute ».
  2. Sur **Ana**, saisir `9.340` puis **OK**.
- **Résultat attendu** : la pastille d'Ana passe de « Chute » à **« 9,340 s »**
  (remplacement, **un seul** résultat — pas de doublon). Le compteur ne compte Ana
  **qu'une fois**.

### CT-04 — Non-présentation (couvre : R7, R9)

- **Rôle / session** : juge.
- **Étapes** :
  1. Sur **Cléo**, cliquer **Abs.**.
- **Résultat attendu** : la pastille de Cléo affiche **« Non prés. »** ; aucun
  temps n'est associé. Compteurs par sexe : **Femmes 2 / 2** (Ana temps, Cléo
  non-prés.) et **Hommes 1 / 1** (Bob temps).

### CT-05 — Recherche, filtre « à saisir » et filtre sexe (couvre : R14b)

- **Rôle / session** : juge (repartir d'un état mixte : au moins un « à saisir »).
- **Étapes** :
  1. Taper `bo` dans la recherche.
  2. Effacer, puis activer le filtre **À saisir**.
  3. Basculer le filtre sexe sur **Femmes**, puis **Hommes**, puis **Tous**.
- **Résultat attendu** : (1) seule la ligne **Bob** reste visible ; (2) seuls les
  grimpeurs **sans résultat** restent affichés, le badge du filtre indique leur
  nombre ; (3) **Femmes** n'affiche que la colonne Femmes (pleine largeur),
  **Hommes** que la colonne Hommes, **Tous** rétablit les deux côte à côte. Ces
  filtres **ne modifient aucune donnée** ; les compteurs par sexe restent calculés
  sur l'ensemble.

### CT-06 — Temps invalide refusé (couvre : R8)

- **Rôle / session** : juge.
- **Étapes** :
  1. Sur un grimpeur, saisir `0` puis **OK**. Recommencer avec un champ **vide**,
     puis `-3`.
- **Résultat attendu** : à chaque fois, **message d'erreur lisible** (« durée
  strictement positive… »), **aucune** écriture, l'état du grimpeur est inchangé.

### CT-07 — Fenêtre ③ uniquement (couvre : R6, spec #2 R12)

- **Étapes** :
  1. Basculer la rencontre en **`preparation`** (SQL). Rescanner
     `JD-JETON-JUGE`.
  2. Revenir en **`competition`**, saisir un temps, puis basculer en
     **`cloture`** et rescanner.
- **Résultat attendu** : en `preparation` **et** en `cloture`, le scan **n'ouvre
  pas** de session juge (message « pas encore ouvert / terminé ») ; aucune saisie
  possible. Le résultat saisi en ③ **reste** en base après clôture (non modifiable
  par le juge).

### CT-08 — Espace juge masqué hors session juge (couvre : R1)

- **Étapes** :
  1. Sans aucune session, ouvrir directement **`/juge`**.
  2. Connecté **`admin@test.local`**, ouvrir `/juge`.
  3. Connecté **`coach@test.local`**, ouvrir `/juge`.
- **Résultat attendu** : (1) **redirection vers `/connexion`** (spec #12 R2) ;
  (2) et (3) **404** (aucun contexte juge) — la saisie de vitesse n'est **pas**
  accessible.

### CT-09 — Périmètre d'écriture RLS (couvre : R3, spec #1 R30)

- **Pré-condition** : session juge de la rencontre `33333333`.
- **Étapes** :
  1. (Inspection réseau / SQL) Tenter un `insert`/`upsert` dans `temps_vitesse`
     avec un `epreuve_id` **d'une autre rencontre** (ou une épreuve non-vitesse).
- **Résultat attendu** : **refus RLS** (`42501`) traduit en message lisible ;
  aucune écriture. Le juge n'écrit que sur **l'épreuve de vitesse de sa
  rencontre**.

### CT-10 — Lecture au fil de l'eau, en lecture seule (couvre : R15, spec #6 R22)

- **Pré-condition** : au moins un temps saisi (CT-02), rencontre en ③.
- **Étapes** :
  1. Connecté **`coach@test.local`** (Club A), ouvrir
     `/coach/rencontres/33333333-3333-3333-3333-333333333333/resultats`.
  2. Ouvrir le détail de **Bob**.
- **Résultat attendu** : l'**état de vitesse** de Bob (⚡ « 8,123 s ») est
  **affiché** ; **aucun** contrôle de saisie de vitesse n'est proposé au coach
  (lecture seule). La valeur reflète la saisie du juge.

### CT-11 — Responsive PC / tablette et volume (couvre : R14b, R14c)

- **Rôle / session** : juge.
- **Étapes** :
  1. Afficher `/juge` sur un écran **large** (≥ 1024 px), puis réduire la fenêtre
     en **mobile** (≤ 640 px).
  2. Défiler la liste.
- **Résultat attendu** : sur grand écran, **Femmes** et **Hommes** sont **côte à
  côte** (deux colonnes) ; en mobile, les colonnes s'**empilent**. Les en-têtes de
  sexe restent **collés** (sticky) au défilement. La saisie d'un temps se fait
  **au clavier** (champ numérique, `Entrée` = OK). Les lignes sont **compactes**
  (adaptées à plusieurs dizaines de grimpeurs par sexe).

### CT-12 — Résultat refusé pour un grimpeur non engagé `[auto]` (couvre : R7bis, rév. 2026-10-03)

- **Rôle / compte** : `admin@test.local` (jeton d'API ; l'admin écrit aussi la
  vitesse, R7bis s'applique à tous les écrivains).
- **Pré-condition** : rencontre `33333333` en **③** ; **Devi Bravo** n'est
  **pas** engagé.
- **Étapes** : appel direct `POST …/temps_vitesse` pour Devi (épreuve de vitesse
  `…8803`, `issue = temps`, `temps = 9.1`).
- **Résultat attendu** : **refus** de la base (`grimpeur_non_engage`) ; aucune
  ligne créée. À l'écran juge, ce refus est traduit par « Ce grimpeur n'est pas
  engagé dans la rencontre. ».

### CT-13 — Retrait d'un grimpeur chronométré : résultat supprimé, rangs recalculés `[auto]` (couvre : R18, spec #7 R15/R20)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : rencontre `33333333` en **③** ; **Ana** (F) chronométrée en
  **8,000 s** et une autre engagée **F** plus lente — ou, à défaut, Ana seule
  (rang 1).
- **Étapes** : panneau équipes admin, retirer **Ana** de A1 (bouton « × »).
- **Résultat attendu** : le `temps_vitesse` et les `points_vitesse` d'Ana sont
  **supprimés** ; les rangs des autres grimpeuses sont **recalculés** sans elle.
  La suppression est définitive (ré-engager Ana ne restaure pas son temps).

> **Automatisé** (rév. 2026-10-03) : `e2e/integrite-engagement.spec.ts` (`npm run test:cahier:integrite`).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-01 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-02 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-03 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-04 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-05 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-06 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-07 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-08 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-09 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-10 | ✅ | |
| 2026-09-22 | julleroyfr | local (stack Docker) | CT-11 | ✅ | |
| 2026-10-02 | agent/playwright | develop | CT-01 → CT-11 | ✅ | `e2e/juge-vitesse.spec.ts` (11 tests) ; CT-08 non connecté → `/connexion` (spec #12 R2) |
