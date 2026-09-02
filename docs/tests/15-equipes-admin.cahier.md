# Cahier de test : Équipes & engagement (admin, tous clubs) — spec #1 R10/R6

> Couvre le panneau **« Équipes & engagement (tous clubs) »** de
> `/admin/rencontres/[id]` : l'admin crée / compose / corrige les équipes de
> **n'importe quel club**, **en toute phase** (R6 : « seul l'admin peut corriger »
> une fois l'engagement gelé). Les invariants d'engagement restent (R14 double,
> R15 plafond, R34 catégorie).
> Marquage `[auto]`/`[manuel]` : cf. [convention 06 §3.1](../conventions/06-cahier-de-test.md).
> Automatisé : `e2e/admin-equipes.spec.ts`.

- **Spec de référence** : `docs/specs/01-roles-et-autorisations.md` (R6, R10, R14,
  R15, R34) ; `docs/specs/05-espace-coach.md` (R12).
- **Pré-requis** : migrations à jour ; seed 01 ; app dev port 3011.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Seed `01` : rencontre pilote `3333…` (Club A, enfant) ; équipes A1 (Ana, Bob),
A2 (vide) — Club A ; B1 (Cléo) — Club B ; Devi Bravo (Club B) libre.

## Cas de test

### CT-01 `[auto]` — Accès admin + panneau tous clubs   (couvre : R10 ; garde)

- **Étapes** : ouvrir `/admin/rencontres/33333333-…` en `coach@test.local`, puis
  non connecté ; puis en `admin@test.local`.
- **Résultat attendu** : **404** pour coach et non connecté ; en admin, le panneau
  **« Équipes & engagement (tous clubs) »** liste **Club A** (A1, A2) **et Club B**
  (B1), **regroupés par club** en blocs **repliables** portant un résumé
  **« N équipe(s) · M grimpeur(s) »** ; chaque bloc a un formulaire « Nouvelle
  équipe ». (Utile quand une compétition compte une dizaine d'équipes.)

### CT-02 `[auto]` — CRUD d'une équipe d'un autre club, en compétition   (couvre : R6, R10 ; nominal)

- **Pré-condition** : phase **`competition`** (les coachs sont gelés).
- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Dans le bloc **Club B**, créer une équipe **« B2 »**.
  2. Ajouter **Devi Bravo** (libre, Club B) à B2.
  3. Retirer Devi, puis supprimer l'équipe B2.
- **Résultat attendu** : toutes les opérations sont **acceptées** malgré la phase
  compétition (l'admin corrige en toute phase, R6). L'effectif et la liste se
  mettent à jour ; B2 disparaît après suppression.

### CT-03 `[manuel]` — Invariants d'engagement conservés   (couvre : R14, R15, R34 ; cas limite)

- **Étapes** (admin, panneau équipes) :
  1. Ajouter à une équipe un grimpeur **déjà engagé** dans la rencontre.
  2. Ajouter un **9ᵉ** grimpeur à une équipe complète.
  3. Ajouter un grimpeur **hors tranche d'âge** (ado sur rencontre enfant).
- **Résultat attendu** : chaque tentative est **refusée** avec le message
  correspondant (R14 double engagement ; R15 plafond de 8 ; R34 catégorie).
  L'admin lève seulement la restriction **inter-club** (R35/R10) — il peut engager
  un grimpeur d'un autre club — mais pas ces invariants.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Marque | Résultat | Remarque |
|------|---------|----------------|-----|--------|----------|----------|
| | | | CT-01 | auto | ✅ / ❌ | accès + panneau |
| | | | CT-02 | auto | ✅ / ❌ | CRUD autre club en compétition |
| | | | CT-03 | manuel | ✅ / ❌ | invariants R14/R15/R34 |
