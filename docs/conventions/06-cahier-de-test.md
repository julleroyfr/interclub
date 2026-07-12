# 06 — Cahier de test (tests manuels)

## 1. Pourquoi un cahier de test

Faute de Docker / CLI Supabase, tout ce qui touche **la base réelle, l'auth, les
policies RLS et le realtime** est validé **à la main**. Pour que ce soit fiable et
répétable, on ne teste pas « au feeling » : on suit un **cahier de test** écrit à
l'avance, dérivé de la spec.

Un cahier de test est la **traduction manuelle et exécutable** d'une spec :
chaque règle et chaque scénario devient un ou plusieurs **cas de test** que le
testeur déroule pas à pas.

## 2. Où et quand

- Les cahiers vivent dans `docs/tests/`, un par domaine/fonctionnalité :
  `docs/tests/<domaine>.cahier.md` (ex. `docs/tests/classement.cahier.md`).
- Un cahier est écrit **en même temps que la spec est validée** (avant ou pendant
  l'implémentation), au même titre que les tests automatisés.
- Il est **rejoué** à chaque changement susceptible d'impacter le domaine, et
  avant tout `push` livrant la fonctionnalité.

## 3. Ce qui va dans le cahier (vs Vitest)

| Va dans le cahier de test (manuel) | Va dans Vitest (auto) |
|------------------------------------|-----------------------|
| Parcours IHM bout-en-bout | Calculs du domaine (`src/domaine/`) |
| Authentification / rôles | Validation de règles pures |
| Policies RLS (qui voit/modifie quoi) | Logique de composant isolée |
| Realtime (messagerie live) | Cas limites déterministes |
| Migrations appliquées (schéma réel) | — |

Règle : **si ça peut être automatisé sans Supabase, ça ne va pas dans le cahier**
(ça va dans Vitest). Le cahier couvre l'irréductiblement manuel.

## 4. Structure d'un cahier de test

```markdown
# Cahier de test : <Domaine / Fonctionnalité>

- **Spec de référence** : docs/specs/<spec>.md
- **Pré-requis** : (comptes de test, données initiales, migrations appliquées …)
- **Environnement** : (local / Netlify preview / prod) + version/commit

## Jeu de données initial
Ce qu'il faut avoir en base avant de commencer (équipes, joueurs, comptes…).

## Cas de test

### CT-01 — <titre court>  (couvre R1, Scénario nominal)
- **Rôle / compte** : <ex. capitaine équipe A>
- **Pré-condition** : <état attendu avant>
- **Étapes** :
  1. …
  2. …
- **Résultat attendu** : <observable, sans ambiguïté>
- **RLS / sécurité** : <ce qui doit être interdit à un autre rôle, si pertinent>

### CT-02 — …
```

## 5. Registre d'exécution

Chaque passage du cahier est **tracé** (dans le cahier ou un fichier de campagne
`docs/tests/<domaine>.executions.md`) :

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-07-12 | … | `abc123` | CT-01 | ✅ / ❌ | … |

- Un `❌` ouvre une correction. Selon la cause :
  - code non conforme à la spec ⇒ corriger le code ;
  - spec fausse ⇒ **règle de changement** (demander, corriger la spec d'abord).
    cf. [01-workflow-spec-first-tdd.md](./01-workflow-spec-first-tdd.md) §3.

## 6. Traçabilité

- Chaque cas `CT-xx` **cite la/les règles `Rn`** et/ou le scénario de la spec.
- Toute règle de spec non couverte par un test automatisé **doit** être couverte
  par un cas de cahier. Aucune règle ne reste sans preuve.

## 7. Bonnes pratiques

- **Un cas = un objectif vérifiable.** Résultat attendu observable, non ambigu.
- Prévoir des **comptes de test dédiés** par rôle (capitaine, arbitre, admin…)
  pour vérifier les policies RLS.
- Tester aussi le **négatif** : ce qu'un rôle **ne doit pas** pouvoir faire/voir.
- Décrire le **jeu de données initial** pour que le cahier soit rejouable à
  l'identique.
- Garder les cahiers courts et ciblés ; un gros domaine = plusieurs cahiers.

## 8. À ADAPTER pour un autre projet

- Les cas de test (dépendants du domaine).
- Le jeu de données et les comptes de test.
