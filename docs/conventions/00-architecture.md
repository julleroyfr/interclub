# 00 — Architecture

## 1. Vue d'ensemble

Application web de gestion de compétitions **interclub**.

| Couche | Choix | Rôle |
|--------|-------|------|
| Front / Rendu | **Next.js 16 (App Router, React 19)** | UI, routes, Server Components, Server Actions |
| Backend / Données | **Supabase** (PostgreSQL) | Base de données, API auto-générée, RLS |
| Auth | **Supabase Auth** | Authentification, sessions, gestion des rôles |
| Temps réel | **Supabase Realtime** | Messagerie et mises à jour live |
| Hébergement | **Netlify** | Déploiement automatique au `push` |

> ⚠️ **Cette version de Next.js n'est PAS celle que vous connaissez.**
> Elle contient des _breaking changes_ (APIs, conventions, structure de fichiers).
> **Avant d'écrire du code Next.js, lire le guide concerné dans**
> `node_modules/next/dist/docs/`. Respecter les avertissements de dépréciation.
> (cf. `AGENTS.md` à la racine)

## 2. Principes d'architecture

1. **Supabase est la source de données, pas seulement une base.** On s'appuie sur
   l'API Supabase (client officiel `@supabase/supabase-js` + `@supabase/ssr`) et
   sur RLS pour la sécurité. On n'écrit pas de couche API custom (routes
   `/api/*`) tant que l'API Supabase suffit.
2. **Pas de proxy sauf nécessité réelle.** En Next 16 le middleware s'appelle
   **proxy** (`src/proxy.ts`). On ne l'ajoute que pour un besoin transverse
   incontournable — ici, uniquement le rafraîchissement de session Supabase. Le
   garder minimal ; ce n'est **pas** une couche d'autorisation.
   cf. [07-standards-nextjs-16.md](./07-standards-nextjs-16.md) §5.
3. **La sécurité vit dans la base (RLS), pas dans le front.** Le front ne fait
   jamais confiance à lui-même pour autoriser une action ; les Row Level Security
   policies sont la barrière. En complément, **chaque Server Action vérifie auth +
   autorisation en interne** (joignable par POST direct).
   cf. [03-base-de-donnees-supabase.md](./03-base-de-donnees-supabase.md) et
   [07-standards-nextjs-16.md](./07-standards-nextjs-16.md) §4.
4. **Server-first.** Par défaut, Server Components et Server Actions. On ne passe
   `"use client"` que pour l'interactivité réelle (état local, événements,
   abonnements realtime), **au plus bas dans l'arbre**. Les standards détaillés :
   [07-standards-nextjs-16.md](./07-standards-nextjs-16.md).
5. **Français partout** : code, base de données, UI, specs. cf.
   [02-conventions-code.md](./02-conventions-code.md).

## 3. Structure des dossiers

```
src/
  app/                    # Routes (App Router). Un dossier = un segment d'URL.
    layout.tsx            # Layout racine
    page.tsx              # Page d'accueil
    globals.css
    # (public)/          # Groupe de routes — organise sans impacter l'URL
    # rencontre/[id]/    # Route dynamique (params async)
    #   _composants/     # Dossier privé (non routable) : UI locale à la route
    #   page.tsx
  proxy.ts                # Proxy Next 16 (ex-middleware) — refresh session Supabase
  lib/
    supabase/
      client.ts           # Client navigateur (Client Components)
      server.ts           # Client serveur (Server Components / Actions)
      middleware.ts       # Helper session appelé par proxy.ts
  # domaine/              # Logique métier pure (À CRÉER au besoin, testable sans réseau)

docs/
  conventions/            # Ces règles réutilisables
  specs/                  # Specs fonctionnelles détaillées (source de vérité)
  reglement/              # Sources brutes (PDF du règlement, etc.)

supabase/
  migrations/             # Migrations SQL versionnées (source de vérité du schéma)

.claude/
  skills/                 # Skills workflow (spec-first, tdd, etc.)
```

## 4. Séparation des responsabilités

- **`src/app/`** — Orchestration UI et accès aux données. Fin, pas de logique
  métier complexe embarquée.
- **`src/domaine/`** (à créer) — **Règles métier pures** : calcul de classement,
  validation d'une composition d'équipe, application du règlement. Aucune
  dépendance à Next ou au réseau ⇒ **testable unitairement en isolation**. C'est
  ici que vit le cœur du règlement interclub.
- **`src/lib/supabase/`** — Accès données (requêtes, mutations). Encapsule
  l'appel Supabase.
- **PostgreSQL / RLS** — Contraintes d'intégrité et autorisations.

## 5. Ce qu'on n'utilise PAS (sauf décision explicite tracée dans une spec)

- ❌ Routes API custom (`src/app/api/*`) quand l'API Supabase suffit.
- ❌ Proxy (ex-middleware, Next 16) au-delà du refresh de session Supabase. Un
  seul `src/proxy.ts`, minimal ; ce n'est pas une couche d'autorisation.
  cf. [07-standards-nextjs-16.md](./07-standards-nextjs-16.md) §5.
- ❌ ORM tiers (Prisma, Drizzle…) : on utilise le client Supabase + SQL.
- ❌ GitHub Actions pour le déploiement : Netlify déploie directement au `push`.
  cf. [05-git-et-deploiement.md](./05-git-et-deploiement.md).
- ❌ State manager global (Redux…) tant que Server Components + realtime suffisent.

Tout écart à cette liste doit être **justifié dans la spec concernée** avant d'être
codé.

## 6. Variables d'environnement

- `.env.example` liste les variables **sans valeur** (documentation).
- `.env.local` contient les valeurs locales, **jamais commité**.
- Clés Supabase : la clé `anon` est publique (protégée par RLS) ; la clé
  `service_role` ne doit **jamais** être exposée côté client.

## 7. À ADAPTER pour un autre projet

- Le domaine métier (`src/domaine/`) et le règlement associé.
- Les variables d'environnement spécifiques.
- Le contenu fonctionnel des specs (pas le processus).
