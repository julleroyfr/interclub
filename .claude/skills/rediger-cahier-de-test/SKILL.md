---
name: rediger-cahier-de-test
description: Générer ou mettre à jour un cahier de test manuel (docs/tests/) à partir d'une spec validée. À utiliser pour tout ce qui ne peut pas être automatisé faute de Docker/CLI Supabase — parcours IHM, auth, policies RLS, realtime, migrations appliquées. Traduit chaque scénario et règle d'accès en cas de test déroulable et traçable.
---

# Rédiger un cahier de test (tests manuels)

Contexte : **pas de Docker ni de CLI Supabase**. Tout ce qui touche la base
réelle est validé à la main via un cahier. Règles :
`docs/conventions/06-cahier-de-test.md`. Modèle : `docs/tests/MODELE.cahier.md`.

## Entrée

Une **spec validée** (`docs/specs/<spec>.md`). Le cahier en découle directement.

## Ce qui va (ou non) dans le cahier

- **Dans le cahier** : parcours IHM bout-en-bout, authentification/rôles, policies
  RLS (qui voit/modifie quoi), realtime, effets d'une migration sur la base réelle.
- **PAS dans le cahier** : ce qui est testable sans Supabase (calculs du domaine,
  règles pures) → cela va dans Vitest (`cycle-tdd`).

## Procédure

1. Copier `docs/tests/MODELE.cahier.md` en `docs/tests/<domaine>.cahier.md`.
2. Renseigner **spec de référence**, **pré-requis**, **environnement**.
3. Définir le **jeu de données initial** (rejouable à l'identique).
4. Lister les **comptes de test par rôle** (capitaine, arbitre, admin…) pour
   pouvoir vérifier les policies RLS.
5. Pour **chaque scénario** de la spec et **chaque règle d'accès** :
   - créer un cas `CT-xx` qui **cite la/les règles `Rn`** couvertes ;
   - étapes numérotées, **résultat attendu observable et non ambigu** ;
   - ajouter le **négatif** : ce qu'un autre rôle NE doit PAS pouvoir faire/voir.
6. Préparer le **registre d'exécution** (date, testeur, commit, résultat).

## Qualité

- Un cas = un objectif vérifiable.
- Couvrir le nominal **et** les cas limites/erreurs de la spec.
- Toute règle de spec non couverte par un test Vitest **doit** l'être par un cas
  de cahier : aucune règle sans preuve.

## Exécution & suites

- Dérouler les cas, tracer chaque résultat.
- Un `❌` : si le code n'est pas conforme à la spec → corriger le code ; si la
  spec est fausse → **règle de changement** (demander, corriger la spec d'abord),
  cf. `docs/conventions/01-workflow-spec-first-tdd.md` §3.
