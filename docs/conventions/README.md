# Conventions & Architecture

Ce dossier rassemble les **règles de fonctionnement et d'architecture** du projet.
Il est conçu pour être **réutilisable** sur d'autres projets partageant la même
architecture (Next.js + Supabase + Netlify, spec-first / TDD, code et BDD en français).

> Pour réutiliser ces conventions ailleurs : copier `docs/conventions/` et
> `.claude/skills/`, puis adapter uniquement les points marqués `À ADAPTER`.

## Principe fondateur

**La spécification est la vérité.** L'ordre de vérité, du plus fort au plus faible :

```
Spécification fonctionnelle détaillée  →  Tests  →  Implémentation
```

Aucun code n'est écrit sans spec puis test. Aucun changement de comportement
n'est fait sans remonter d'abord à la spec. Voir
[01-workflow-spec-first-tdd.md](./01-workflow-spec-first-tdd.md).

## Standard transverse : diagrammes en Mermaid

Dans **toute spec et toute documentation** (dev ou utilisateur), les schémas
s'écrivent en **Mermaid** (blocs ` ```mermaid `) — jamais en image externe ni en
ASCII — pour rester versionnés, diffables et rendus par GitHub/l'IDE.
Détail et types de diagrammes : [01-workflow-spec-first-tdd.md](./01-workflow-spec-first-tdd.md) §4.

## Sommaire

| Document | Contenu |
|----------|---------|
| [00-architecture.md](./00-architecture.md) | Stack technique, décisions d'architecture, ce qu'on n'utilise pas |
| [01-workflow-spec-first-tdd.md](./01-workflow-spec-first-tdd.md) | Processus spec-first / TDD, règle de changement, définition de « terminé » |
| [02-conventions-code.md](./02-conventions-code.md) | Langue, nommage, structure `src/`, style TypeScript/React |
| [03-base-de-donnees-supabase.md](./03-base-de-donnees-supabase.md) | Modèle de données, migrations, RLS, auth, realtime |
| [04-tests.md](./04-tests.md) | Vitest, Testing Library, tests auto vs manuels (pas de Docker/CLI Supabase) |
| [05-git-et-deploiement.md](./05-git-et-deploiement.md) | Branches, commits, déploiement Netlify sur push |
| [06-cahier-de-test.md](./06-cahier-de-test.md) | Tests manuels : format, cas de test, traçabilité (base réelle, RLS, realtime) |
| [07-standards-nextjs-16.md](./07-standards-nextjs-16.md) | Standards Next.js 16 : Server/Client, request APIs async, Server Actions, proxy, structure |
| [08-ihm-responsive.md](./08-ihm-responsive.md) | IHM responsive mobile-first, Tailwind v4, cibles tactiles, accessibilité |
| [09-environnements-et-donnees.md](./09-environnements-et-donnees.md) | Environnements prod/recette, gitflow, jeux de données de test (seed/purge) |

### Skills associés (`.claude/skills/`)

| Skill | Rôle |
|-------|------|
| `nouvelle-fonctionnalite` | Piloter une fonctionnalité de bout en bout : spec → tests → code → cahier |
| `rediger-spec` | Écrire une spec fonctionnelle détaillée (source de vérité) |
| `cycle-tdd` | Cycle Rouge → Vert → Refactor avec Vitest sur le domaine pur |
| `rediger-cahier-de-test` | Générer un cahier de test manuel à partir d'une spec |
| `expertise-nextjs` | Travailler avec CE Next 16 (breaking changes) — renvoie aux docs locales |
| `expertise-supabase` | Auth, RLS, realtime, accès données, migrations manuelles avec @supabase/ssr |
| `expertise-ihm-responsive` | Écrans responsive mobile-first (Tailwind v4), tactile, a11y, vérif manuelle |

## Statut

Ces documents sont **vivants**. Toute évolution suit la règle de changement
définie dans le workflow : on modifie d'abord la convention, puis on aligne le
reste. Un document de convention qui contredit le code est un bug à corriger.
