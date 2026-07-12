# 04 — Tests

## 1. Deux natures de tests, deux réalités

Ce projet **n'a pas de Docker ni de CLI Supabase** : on ne peut pas monter une
base éphémère ni automatiser des tests contre Supabase. On distingue donc :

| Nature | Cible | Automatisé ? | Outil |
| -------- | ------- | -------------- | ------- |
| **Unitaire** | Domaine pur (`src/domaine/`) | ✅ Oui | Vitest |
| **Composant** | UI isolée, sans réseau | ✅ Oui | Vitest + Testing Library |
| **Intégration Supabase / IHM / bout-en-bout** | App réelle + base réelle | ❌ Non — **manuel** | **Cahier de test** |

> Règle : **tout ce qui peut être testé sans Supabase est automatisé ; tout ce
> qui touche la base réelle est validé à la main via un cahier de test.**

## 2. Tests automatisés (Vitest)

### 2.1 Où et comment

- Le **cœur du règlement** (classement, éligibilité, forfaits, compositions…)
  vit dans `src/domaine/` en **fonctions pures** ⇒ testable **sans mock réseau**.
  C'est la cible prioritaire du TDD automatisé.
- Fichiers de test **à côté du code** : `calcul-classement.test.ts` près de
  `calcul-classement.ts`.
- Composants : Vitest + Testing Library, sans appel réseau (données injectées en
  props / fixtures).

### 2.2 Conventions

- Un fichier de test par module.
- **Nommer les tests d'après la spec**, en français, et référencer la règle :

  ```ts
  // R3 : une équipe ne peut aligner un joueur déjà aligné le même jour
  describe("composition d'équipe", () => {
    it("refuse un joueur déjà aligné le même jour (R3)", () => { /* … */ })
  })
  ```

- **Arrange / Act / Assert** (Étant donné / Quand / Alors).
- Chaque règle `Rn` d'une spec ⇒ au moins un test qui la cite.
- Tests **déterministes** : pas de dépendance à l'horloge/au hasard réels
  (injecter la date, la source d'aléa).

### 2.3 Cycle TDD

Rouge → Vert → Refactor. Voir le skill
[`cycle-tdd`](../../.claude/skills/cycle-tdd/SKILL.md) et
[01-workflow-spec-first-tdd.md](./01-workflow-spec-first-tdd.md).

### 2.4 Ce qu'on NE mocke PAS

- On ne monte pas de faux Supabase juste pour tester du métier : on **extrait** le
  métier dans `src/domaine/` et on le teste pur. Si un test a besoin de mocker
  Supabase, c'est souvent le signe que la logique doit sortir de la couche accès.

## 3. Tests manuels — le cahier de test

Tout ce qui nécessite la base réelle, l'auth, les policies RLS ou le realtime est
validé **à la main**, en suivant un **cahier de test** écrit à l'avance.

- Format et processus : [06-cahier-de-test.md](./06-cahier-de-test.md).
- Les cahiers vivent dans `docs/tests/`.
- Un cahier découle **directement des scénarios de la spec** : chaque scénario et
  chaque règle d'accès (RLS) devient un ou plusieurs cas de test manuel.
- L'exécution est **tracée** (date, testeur, résultat, version/commit).

Le skill [`rediger-cahier-de-test`](../../.claude/skills/rediger-cahier-de-test/SKILL.md)
génère un cahier à partir d'une spec.

## 4. Outillage installé

| Besoin | Outil | Config | Script |
| -------- | ------- | -------- | -------- |
| Unitaire / composant | Vitest + Testing Library | `vitest.config.mts`, `vitest.setup.ts` | `npm run test` (CI), `npm run test:watch` |
| Couverture | `@vitest/coverage-v8` | — | `npm run test:coverage` |
| E2E navigateur | Playwright (+ Chromium) | `playwright.config.ts`, dossier `e2e/` | `npm run test:e2e` |
| Typage | TypeScript | `tsconfig.json` | `npm run typecheck` |

- Vitest ne ramasse que `src/**/*.{test,spec}.{ts,tsx}` ; le dossier `e2e/` est
  réservé à Playwright.
- Playwright inclut un profil **mobile** (Pixel 7) pour vérifier le responsive
  (cf. [08-ihm-responsive.md](./08-ihm-responsive.md)).

## 5. Playwright (E2E) — usage progressif

Playwright est **installé et prêt**, mais tant qu'un environnement de **recette**
reproductible (données de seed / purge) n'est pas stabilisé, l'E2E automatisé
**ne remplace pas** le cahier de test manuel. On l'introduit progressivement sur
les parcours à faible dépendance données, puis on l'étend en s'appuyant sur les
jeux de données de recette (cf.
[09-environnements-et-donnees.md](./09-environnements-et-donnees.md)).

## 6. Couverture & traçabilité

- Une règle de spec sans test (automatisé **ou** cas de cahier) = trou de
  couverture à corriger.
- On vise la couverture **du comportement spécifié**, pas un pourcentage de lignes.
- Chaque cas de test (auto ou manuel) référence la règle `Rn` qu'il couvre.

## 7. À ADAPTER pour un autre projet

- Le contenu des tests (spécifique au domaine).
- L'introduction éventuelle de Playwright / d'un environnement Supabase de test
  si le contexte le permet (alors les tests d'intégration deviennent
  automatisables et le cahier de test se réduit).
