# 02 — Conventions de code

## 1. Langue

**Le code s'écrit en français.** Domaine, UI et base de données parlent la même
langue métier.

| Élément | Langue | Exemple |
|---------|--------|---------|
| Noms de variables, fonctions, types | Français | `calculerClassement`, `equipeDomicile` |
| Noms de composants React | Français, PascalCase | `FeuilleDeMatch`, `CompositionEquipe` |
| Fichiers du domaine | Français, kebab-case | `calcul-classement.ts` |
| Tables / colonnes SQL | Français, snake_case | `rencontre`, `equipe_domicile_id` |
| UI (textes affichés) | Français | — |
| Commits, specs, commentaires | Français | — |

**Exceptions** (rester en anglais) : mots-clés du langage, API de bibliothèques
(`useState`, `createClient`, `select`), noms techniques imposés par le framework
(`page.tsx`, `layout.tsx`, `loading.tsx`). On ne francise pas ce que le framework
impose.

Éviter le franglais : on écrit `supprimerJoueur`, pas `deleteJoueur`.

## 2. TypeScript

- **`strict` activé** (cf. `tsconfig.json`). Pas de `any` implicite.
- Éviter `any`. Préférer `unknown` + validation, ou un type précis.
- Typer les frontières (retours de fonctions publiques, props de composants).
- Les types du domaine sont **explicites et nommés** (`type Rencontre = …`),
  pas des objets anonymes dispersés.
- Types de la base : générés depuis Supabase quand disponibles, sinon déclarés
  dans le domaine et gardés alignés avec le schéma.

## 3. Nommage

- **Fonctions** : verbe à l'infinitif — `calculer…`, `valider…`, `enregistrer…`.
- **Booléens** : préfixe `est`, `a`, `peut`, `doit` — `estValide`, `peutJouer`.
- **Composants** : PascalCase, nom de chose — `TableauClassement`.
- **Constantes** : `SCREAMING_SNAKE_CASE` pour les vraies constantes globales.
- Pas d'abréviations obscures. `nb` et `id` sont tolérés car universels.

## 4. Next.js 16 (App Router) — rappels

> Cette version de Next (16) a des _breaking changes_. **Lire
> `node_modules/next/dist/docs/` avant d'écrire du code Next.** Ne pas se fier à
> la mémoire de versions antérieures. Standards détaillés :
> [07-standards-nextjs-16.md](./07-standards-nextjs-16.md).

- **Server Components par défaut.** `"use client"` seulement si interactivité
  (état, événements, realtime), **poussé le plus bas possible** dans l'arbre.
- **`params`, `searchParams`, `cookies()`, `headers()` sont asynchrones** → les
  `await` (breaking change v16).
- **Server Actions** (`'use server'`) pour les mutations plutôt que des routes API
  custom — avec **auth + autorisation vérifiées dans l'action** (joignable par
  POST direct).
- **Secrets** : jamais côté client. Seules les variables `NEXT_PUBLIC_` sont
  exposées ; protéger le code sensible avec `server-only` au besoin.
- Fichiers spéciaux (`page`, `layout`, `loading`, `error`, `not-found`, `route`) :
  nom imposé par le framework, en anglais. Colocalisation via dossiers privés
  `_dossier` ; organisation via groupes de routes `(groupe)`.
- Accès données côté serveur via `src/lib/supabase/server.ts` ; côté client via
  `client.ts`. Un seul `src/proxy.ts` (refresh session uniquement).

## 5. React

- Composants **petits et à responsabilité unique**.
- Logique métier **hors** des composants : elle vit dans `src/domaine/` et est
  testée en isolation. Un composant orchestre, il ne calcule pas le règlement.
- Props typées explicitement. Pas de `props: any`.
- Pas d'effet (`useEffect`) pour ce qui peut être fait côté serveur.

## 6. Domaine métier (`src/domaine/`)

- **Fonctions pures**, sans dépendance à Next ni au réseau ni à Supabase.
- Entrées → sorties déterministes ⇒ **testables unitairement sans mock réseau**.
- C'est ici qu'on encode le **règlement** (classement, éligibilité, forfaits…).
- Chaque règle du domaine correspond à une règle `Rn` d'une spec.

## 7. Gestion des erreurs

- Ne pas avaler les erreurs silencieusement.
- Les erreurs Supabase (`{ data, error }`) sont **toujours** vérifiées.
- Distinguer erreur métier attendue (ex. « composition invalide ») d'erreur
  technique (réseau, base). Les premières sont modélisées, pas jetées au hasard.

## 8. Style & outillage

- **ESLint** (`eslint.config.mjs`) fait foi pour le style. Le lint doit passer.
- Formatage cohérent (ne pas mélanger les styles dans un même fichier).
- Pas de code mort, pas de `console.log` laissé en place.
- Commentaires : expliquer le **pourquoi**, pas le **quoi**. Un commentaire qui
  paraphrase le code est du bruit ; un commentaire qui cite une règle du
  règlement est précieux.

## 9. À ADAPTER pour un autre projet

- Le vocabulaire du domaine (ici : rencontre, équipe, division…).
- La structure de `src/domaine/` selon les sous-domaines du projet.
