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
| ------------------------------------ | ----------------------- |
| Parcours IHM bout-en-bout | Calculs du domaine (`src/domaine/`) |
| Authentification / rôles | Validation de règles pures |
| Policies RLS (qui voit/modifie quoi) | Logique de composant isolée |
| Realtime (messagerie live) | Cas limites déterministes |
| Migrations appliquées (schéma réel) | — |

Règle : **si ça peut être automatisé sans Supabase, ça ne va pas dans le cahier**
(ça va dans Vitest). Le cahier couvre l'irréductiblement manuel.

### 3.1 Cas exécutables par un agent (marquage `auto` / `manuel` / `mixte`)

Un cas de cahier peut nécessiter la **base réelle** (donc rester dans le cahier)
tout en étant **rejouable par une machine** contre la **stack Supabase locale**
(Docker autorisé pour valider, cf. `03-base-de-donnees-supabase.md` §5) : appels
API/RLS (comme `scripts/test-t5*.sh`, `test-t6.sh`) et parcours IHM via **Playwright**
(`npm run test:e2e`). On distingue donc, **par cas**, ce qui est mécanisable de ce
qui exige un œil humain. Décision : [ADR 0004](../decisions/0004-agent-execution-cahiers-de-test.md).

Chaque cas `CT-xx` porte une **marque** :

| Marque | Sens | Qui l'exécute |
| -------- | ------ | --------------- |
| `[auto]` | Entièrement vérifiable par la machine (URL, statut HTTP, présence/absence DOM, refus RLS, message d'erreur, ligne créée en base) | Agent / script / Playwright |
| `[manuel]` | Exige un **jugement de rendu** (lisibilité, couleur exacte, ergonomie tactile, ressenti mobile) | Testeur humain |
| `[mixte]` | Un cœur `auto` + une **vérification de rendu** résiduelle à l'œil | Agent **puis** humain sur le résidu |

Règles de marquage :

- **Par défaut `auto`** dès que le résultat attendu est **observable sans jugement
  subjectif**. Ne réserver `manuel`/`mixte` qu'au **rendu** proprement dit.
- Un cas `[mixte]` **explicite** dans son résultat attendu la part `auto` (assertion
  machine) et la part `manuel` (« vérifier à l'œil : … »).
- L'agent **exécute les `auto`**, **saute les `manuel`** (les reporte au testeur) et,
  pour les `mixte`, **coche la part auto** et **signale** le résidu à vérifier.
- La marque **ne dispense pas** de la traçabilité `Rn` : un cas `auto` cite toujours
  ses règles.

## 4. Structure d'un cahier de test

```markdown
# Cahier de test : <Domaine / Fonctionnalité>

- **Spec de référence** : docs/specs/<spec>.md
- **Pré-requis** : (comptes de test, données initiales, migrations appliquées …)
- **Environnement** : (local / Netlify preview / prod) + version/commit

## Jeu de données initial
Ce qu'il faut avoir en base avant de commencer (équipes, joueurs, comptes…).

## Cas de test

### CT-01 `[auto]` — <titre court>  (couvre R1, Scénario nominal)
- **Rôle / compte** : <ex. capitaine équipe A>
- **Pré-condition** : <état attendu avant>
- **Étapes** :
  1. …
  2. …
- **Résultat attendu** : <observable, sans ambiguïté>
- **RLS / sécurité** : <ce qui doit être interdit à un autre rôle, si pertinent>
```

La marque `[auto]` / `[manuel]` / `[mixte]` (cf. §3.1) suit le numéro du cas. Pour
un `[mixte]`, séparer dans le résultat attendu la part machine de la part à l'œil :

```markdown
### CT-09 `[mixte]` — <titre>  (couvre R7)
- **Résultat attendu** :
  - `[auto]` <assertion vérifiable par la machine>
  - `[manuel]` vérifier à l'œil : <rendu, couleur, lisibilité…>

### CT-02 — …
```

## 5. Registre d'exécution

Chaque passage du cahier est **tracé** (dans le cahier ou un fichier de campagne
`docs/tests/<domaine>.executions.md`) :

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-07-12 | … | `abc123` | CT-01 | ✅ / ❌ | … |

- La colonne **Testeur** distingue un passage **humain** (nom) d'un passage
  **agent** (`agent` + outil, p. ex. `agent/playwright`). Un cas `[manuel]` **ne
  peut pas** être clos par un agent : il attend un testeur humain.
- Un cas `[mixte]` n'est **✅ complet** que lorsque **la part auto ET la part manuel**
  sont passées (agent pour l'une, humain pour l'autre).
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
