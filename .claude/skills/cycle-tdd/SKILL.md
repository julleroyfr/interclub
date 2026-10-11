---
name: cycle-tdd
description: Appliquer le cycle TDD Rouge → Vert → Refactor avec Vitest sur la logique métier pure (src/domaine/). À utiliser quand une spec validée existe et qu'on va coder une règle. Impose d'écrire le test qui échoue AVANT le code, et de tracer chaque test jusqu'à une règle Rn de la spec.
---

# Cycle TDD (Vitest)

Pré-requis : une **spec validée** (`docs/specs/`). Sinon, commencer par
`rediger-spec`. On ne teste que ce qui est spécifié.

Cible prioritaire : le **domaine pur** (`src/domaine/`), testable sans Supabase.
Ce qui touche base réelle / auth / RLS / realtime va au **cahier de test**
(`rediger-cahier-de-test`), pas ici.

## Boucle

### 🔴 RED — écrire un test qui échoue

- Choisir **une** règle `Rn` non couverte.
- Écrire le test à côté du code (`src/domaine/xxx.test.ts`), en français,
  en citant la règle :

  ```ts
  // R3 : une équipe ne peut aligner un joueur déjà aligné le même jour
  it("refuse un joueur déjà aligné le même jour (R3)", () => {
    // Arrange (Étant donné)
    // Act (Quand)
    // Assert (Alors)
  })
  ```

- Lancer Vitest : le test **échoue** (rouge). Si non, le test ne prouve rien.

### 🟢 GREEN — le minimum pour passer

- Écrire le **strict minimum** de code pour rendre le test vert.
- Pas d'anticipation : on ne code que ce qu'un test exige.
- Garder le métier **pur** (pas d'appel réseau/Supabase dans `src/domaine/`).

### 🧹 REFACTOR — nettoyer

- Améliorer nommage/structure **sans changer le comportement**.
- Les tests restent verts en permanence.

## Règles

- Un test **déterministe** : injecter date/aléa, ne pas dépendre de l'horloge réelle.
- Une règle `Rn` = au moins un test qui la cite.
- Un test sans règle correspondante ⇒ comportement non spécifié : remonter à la
  spec (et demander si ça change un comportement validé).
- Si tester exige de mocker Supabase, c'est un signal : **extraire le métier**
  dans `src/domaine/` et tester pur.

## Fin de boucle

Répéter règle par règle jusqu'à couvrir la spec. Puis passer au cahier de test
pour les cas non automatisables, et vérifier la Definition of Done.
