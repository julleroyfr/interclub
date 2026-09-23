# Cahier de test : Vitesse dans le score / classement (spec #7 R15–R20, spec #3 R46)

> Couvre l'**intégration de la vitesse au score** (révision spec #7 du 2026-09-22) :
> **barème par rang stocké/éditable** par rencontre (spec #3 **R46**), **calcul des
> points de vitesse matérialisé par un trigger** en base (`points_vitesse`,
> **R20**) recalculé **au fil de l'eau** à chaque saisie de temps (**R19**),
> **classement par sexe** temps croissant + **ex æquo** standard (**R15**),
> **chute / non-présentation / absence** (**R17**), agrégation
> **voie + bloc + vitesse** au score individuel puis équipe/club (**R3/R18**), et
> **affichage** de la composante vitesse dans la décomposition du classement
> (**R13**). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** :
  `docs/specs/07-classement.md` (R3, R13, R15–R20) ;
  `docs/specs/03-ecrans-de-parametrage-admin.md` (R46, barème) ;
  `docs/specs/10-saisie-vitesse-juge.md` (saisie des temps, source).
- **Le calcul du trigger n'est pas couvert par Vitest** (logique SQL) : ce cahier
  en est la **preuve**. L'agrégation `voie + bloc + vitesse` du domaine est, elle,
  couverte par Vitest (`src/domaine/score.test.ts`).
- **Pré-requis** :
  - Migrations appliquées jusqu'à **`202609221600_points_vitesse_trigger`**
    incluse (donc **`202609221500_bareme_vitesse`** avant — **ordre important** :
    le trigger lit le barème). En local : `supabase db reset` (migrations + seed).
  - `SUPABASE_SERVICE_ROLE_KEY` renseignée (assemblage cross-club du classement).
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true` (sessions QR).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Réutilise le seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-RENCONTRE-ENFANT** (`33333333-…-3333`, phase `competition`), son **épreuve
  de vitesse** `…8803` et le **jeton juge** actif **JD-JETON-JUGE**.
- Compétiteurs engagés, deux clubs, deux sexes : **Ana** (Club A, **F**), **Cléo**
  (Club B, **F**), **Bob** (Club A, **G**).
- **Barème de vitesse enfant** seedé sur `…8803` (spec #3 R46, § Matin) :
  **1er = 15, 2e = 14, 3e = 13, 4e = 12, 5e = 11**, 6–10 = 10, … 46+ = 2 ;
  **chute = 1** ; **non-présentation = 0**.
- **JD-RENCONTRE-ADO** (`adadadad-…-adad`) : barème **ado** seedé (1er = 60,
  −1/rang, chute = 5, NP = 0) — pour CT-08.

Aucun **temps de vitesse** n'est seedé : état de départ « à saisir » (⇒ 0 pt) pour
tous, donc **aucune ligne `points_vitesse`**.

> **Basculer la phase** (SQL Editor) :
> `update interclub.rencontre set phase = '<phase>' where id = '33333333-3333-3333-3333-333333333333';`

## Comptes / sessions de test

| Compte / session | Rôle | Usage |
| --- | --- | --- |
| Scan `JD-JETON-JUGE` (`/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`) | juge (session QR) | Saisit / corrige les temps de vitesse (spec #10) |
| `coach@test.local` (JD-COACH-A) | coach permanent Club A | Consulte le classement + la décomposition (R13) |
| `admin@test.local` (JD-ADMIN) | admin | Édite le barème (R46), change la phase |

## Cas de test

### CT-01 — Barème seedé & visible (couvre R46, migration 202609221500)

- **Rôle** : admin.
- **Pré-condition** : rencontre enfant en **① pré-compétition** (pour éditer plus
  tard) — la simple **consultation** du barème marche dans toute phase.
- **Étapes** :
  1. Ouvrir `/admin/rencontres/33333333-3333-3333-3333-333333333333`.
  2. Bloc **Structure** → onglet **Vitesse**.
- **Résultat attendu** : sous les voies de vitesse, un bloc **« Barème par rang »**
  liste les échelons : **1e = 15**, **2e = 14**, **3e = 13**, **4e = 12**,
  **5e = 11** (échelon `1–5e` points 15 / décrément 1), puis `6–10e` = 10,
  `11–15e` = 9 … `46e et +` = 2 ; **Chute = 1**, **Non-présentation = 0**. La
  formule est rappelée (points − (rang − rang min) × décrément).

### CT-02 — Édition du barème en pré-compétition (couvre R46, phase R44)

- **Rôle** : admin. **Pré-condition** : rencontre enfant en **① pré-compétition**.
- **Étapes** :
  1. Onglet **Vitesse** → dans **Barème par rang**, remplacer **Chute = 1** par
     **2**, et le **points** de l'échelon `1–5e` de **15** par **20**.
  2. Cliquer **« Enregistrer le barème »**.
  3. Recharger la page, rouvrir l'onglet Vitesse.
- **Résultat attendu** : message **« Barème de vitesse mis à jour. »** ; après
  rechargement, **Chute = 2** et échelon `1–5e` **points = 20** (⇒ 20, 19, 18, 17,
  16). **Rétablir** ensuite les valeurs d'origine (Chute 1, points 15) pour la
  suite du cahier.
- **RLS / sécurité** :
  - (négatif rôle) `coach@test.local` n'a **pas** accès à `/admin/rencontres/…`.
  - (négatif phase R44) passer la rencontre en **③ compétition** puis rouvrir
    l'onglet Vitesse → le barème est en **lecture seule** (pas de champs de saisie,
    pas de bouton) ; une tentative d'`Enregistrer` (via un client rejouant l'action)
    est **refusée** (« … qu'en phase pré-compétition »).

### CT-03 — Une saisie de temps matérialise les points (couvre R15, R16, R20, R13)

- **Pré-condition** : rencontre enfant en **③ compétition**, barème d'origine.
- **Étapes** :
  1. **Juge** : `/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb` → `/juge`.
  2. Saisir pour **Ana** (F) un **temps = 8.100 s**.
  3. **Coach A** : ouvrir le **classement** de la rencontre
     (`/coach/rencontres/33333333-…-3333/classement`) → Individuel → **Filles**,
     toucher **Ana**.
- **Résultat attendu** :
  - Ana est **1re** au classement de vitesse (seul temps) : décomposition R13 →
    section **Vitesse** **#1**, libellé **« 8,100 s »**, **15 pts** ; sous-ligne de
    la liste : `… · vit 15`.
  - Son **score individuel** intègre ces 15 pts (voie + bloc + **15**).

### CT-04 — Ex æquo de temps & saut de rang (couvre R15)

- **Pré-condition** : CT-03 (Ana = 8.100).
- **Étapes** :
  1. **Juge** : saisir pour **Cléo** (F, Club B) le **même temps 8.100 s**.
  2. *(optionnel, pour observer le saut de rang)* engager une **3e fille**
     (JD-POOL-LIBRES) dans une équipe et lui saisir **8.500 s**.
  3. **Coach A** : classement → Individuel → **Filles**.
- **Résultat attendu** :
  - Ana **et** Cléo sont **rang 1 ex æquo**, **15 pts chacune** (décomposition
    **#1**). L'ordre d'affichage est déterministe (Alpha/Ana avant Bravo/Cléo).
  - *(optionnel)* la 3e fille est **rang 3** (le **rang 2 est sauté**) avec **13
    pts** (`3e temps`) — conforme à l'ex æquo du règlement.

### CT-05 — Chute, non-présentation, à saisir (couvre R17)

- **Pré-condition** : rencontre en ③, barème d'origine (chute 1, NP 0).
- **Étapes** :
  1. **Juge** : saisir pour **Bob** (G) une **chute**.
  2. **Juge** : saisir pour une fille (ex. Cléo) une **non-présentation** (écrase
     son temps du CT-04 — correction, spec #10).
  3. Laisser **Ana** avec son temps ; laisser au moins un grimpeur **sans saisie**.
  4. **Coach A** : classement, ouvrir les décompositions.
- **Résultat attendu** :
  - **Bob** (chute) : décomposition Vitesse **—** (pas de rang), libellé
    **« Chute »**, **1 pt**.
  - **Cléo** (non-présentation) : Vitesse **—**, **« Non-présentation »**, **0 pt**.
  - Grimpeur **sans saisie** : Vitesse **—**, **« À saisir »**, **0 pt** (aucune
    ligne `points_vitesse` créée).

### CT-06 — Recalcul au fil de l'eau (field-dependent) (couvre R19, R20)

- **Pré-condition** : Ana = 8.100 (rang 1, 15). Remettre **Cléo** sur un **temps
  8.300 s** (rang 2, 14) pour avoir deux temps féminins classés.
- **Étapes** :
  1. **Coach A** : classement Filles → noter Ana **#1/15**, Cléo **#2/14**.
  2. **Juge** : saisir pour **Cléo** un **meilleur temps 8.000 s**.
  3. **Coach A** : **recharger** le classement Filles.
- **Résultat attendu** : les rangs **se sont inversés sans nouvelle action sur
  Ana** — **Cléo #1 = 15**, **Ana #2 = 14**. La saisie d'un seul temps a **modifié
  le score de plusieurs grimpeuses** du même sexe (R19), les points étant relus
  depuis `points_vitesse` recalculée par le trigger (R20).

### CT-07 — Propagation équipe / club (couvre R3, R18, R5, R6)

- **Pré-condition** : des temps/chutes saisis (CT-03…CT-06).
- **Étapes** :
  1. **Coach A** : onglet **Par équipe** puis **Par club**.
  2. Comparer avec la somme des scores individuels (voie + bloc + vitesse).
- **Résultat attendu** : le total de l'équipe **A1** et du **Club A** **inclut**
  les points de vitesse de leurs grimpeurs (Ana, Bob) ; ils **coïncident** avec la
  somme des scores individuels affichés (chacun = voie + bloc + vitesse). Le
  classement se **réordonne** si la vitesse fait changer les totaux.

### CT-08 — Barème par catégorie : ado (couvre R46, seed ado)

- **Rôle** : admin puis juge/coach, sur la **rencontre ADO** `adadadad-…-adad`.
- **Étapes** :
  1. Admin : `/admin/rencontres/adadadad-…-adad` → Structure → **Vitesse** :
     vérifier le barème **ado** (1er = 60, échelon `1–5e` points 60 / décr 1 ;
     `6–50e` = 55 / décr 1 ; `51e et +` = 10 ; **Chute = 5**, **NP = 0**).
  2. Saisir (juge de cette rencontre) un **meilleur temps** pour un compétiteur,
     puis consulter son classement.
- **Résultat attendu** : le 1er temps rapporte **60 pts** (et non 15) — le barème
  dépend bien de la **catégorie** de la rencontre ; une **chute = 5**.

### CT-09 — Écriture de `points_vitesse` réservée au trigger (couvre R20, sécurité)

- **Objet** : la table dérivée n'est écrite que par le trigger (SECURITY DEFINER) ;
  aucun rôle applicatif n'y écrit directement.
- **Étapes** (SQL Editor, rôle `authenticated` simulé / ou vérification de policy) :
  1. Vérifier qu'il **n'existe aucune policy** `insert/update/delete` sur
     `interclub.points_vitesse` (seule `..._select_authenticated` existe).
  2. Confirmer que les lignes de `points_vitesse` **apparaissent/évoluent
     uniquement** à la suite d'une saisie de `temps_vitesse` (CT-03…CT-06).
- **Résultat attendu** : la lecture est ouverte aux authentifiés dès la ③
  (`resultats_visibles`) ; **aucune écriture directe** possible côté application —
  la cohérence est garantie par le trigger, quel que soit le chemin d'écriture.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-01 | ✅ | Barème enfant seedé & visible |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-02 | ✅ | Édition en ① ; lecture seule en ③ |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-03 | ✅ | Saisie temps → points matérialisés |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-04 | ✅ | Ex æquo & saut de rang |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-05 | ✅ | Chute / NP / à saisir |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-06 | ✅ | Recalcul au fil de l'eau (trigger) |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-07 | ✅ | Propagation équipe / club |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-08 | ✅ | Barème ado (1er = 60) |
| 2026-09-23 | julleroyfr | 8a38bc8 (local) | CT-09 | ✅ | Écriture `points_vitesse` réservée au trigger |
