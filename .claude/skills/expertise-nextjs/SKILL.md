---
name: expertise-nextjs
description: Travailler correctement avec CETTE version de Next.js (16.2.6, App Router, React 19) qui a des breaking changes vs les versions connues. À utiliser avant d'écrire ou modifier du code Next (routes, composants, data fetching, mutations, proxy, images, cache). Renvoie aux docs locales exactes (node_modules/next/dist/docs/) et rappelle les pièges de la v16.
---

# Expertise Next.js (v16 App Router)

> ⚠️ **Ne pas coder de mémoire.** Cette version a des breaking changes. **Lire la
> doc locale concernée dans `node_modules/next/dist/docs/01-app/` AVANT d'écrire.**
> Version installée : `16.2.6` (vérifier : `node -e "console.log(require('next/package.json').version)"`).

## Où lire (doc embarquée, fait foi)

| Sujet | Fichier |
| ------- | --------- |
| Server & Client Components | `01-getting-started/05-server-and-client-components.md` |
| Récupérer des données | `01-getting-started/06-fetching-data.md` |
| Muter des données (Server Actions) | `01-getting-started/07-mutating-data.md` |
| Cache | `01-getting-started/08-caching.md`, `09-revalidating.md` |
| Gestion d'erreurs | `01-getting-started/10-error-handling.md` |
| Images | `01-getting-started/12-images.md` |
| Route Handlers | `01-getting-started/15-route-handlers.md` |
| **Proxy** (ex-middleware) | `01-getting-started/16-proxy.md` |
| Auth (guide) | `02-guides/authentication.md` |
| Forms | `02-guides/forms.md` |
| Tests | `02-guides/testing/{vitest,playwright}.md` |
| **Breaking changes v16** | `02-guides/upgrading/version-16.md` |
| Conventions de fichiers | `03-api-reference/03-file-conventions/` |
| Fonctions (`cookies`, `headers`…) | `03-api-reference/04-functions/` |

## Breaking changes v16 à garder en tête

- **Request APIs asynchrones** : `cookies()`, `headers()`, `params`,
  `searchParams` sont **`async`** → toujours `await`. (cf. `src/lib/supabase/server.ts`
  qui fait `await cookies()`).
- **`middleware` → `proxy`** : le fichier s'appelle `src/proxy.ts` et exporte
  `proxy()` (pas `middleware`). Voir le skill `expertise-supabase` et
  `version-16.md` §`middleware to proxy`.
- **Turbopack par défaut** en dev et build.
- **APIs de cache** : `revalidateTag`, `updateTag`, `refresh`, `cacheLife`/
  `cacheTag`, PPR — lire `version-16.md` avant d'utiliser une API de cache.
- **`next/image`** : défauts changés (query strings locales, `minimumCacheTTL`,
  `imageSizes`, `qualities`, redirections). Lire avant de configurer les images.
- **React 19.2** + React Compiler.

## Règles de travail (alignées conventions)

1. **Server-first.** Server Components par défaut ; `"use client"` **uniquement**
   pour l'interactivité réelle (état, événements, abonnements realtime).
2. **Mutations = Server Actions** plutôt que routes API custom (cf.
   `07-mutating-data.md`). Pas de `src/app/api/*` tant que Supabase suffit.
3. **Logique métier hors composant** : elle vit dans `src/domaine/` (pur, testé
   Vitest). Un composant orchestre, il ne calcule pas le règlement.
4. **Fichiers spéciaux** (`page`, `layout`, `loading`, `error`, `not-found`) :
   noms imposés par le framework (anglais). Le reste du code est en français.
5. **Accès données** : côté serveur via `src/lib/supabase/server.ts`, côté client
   via `src/lib/supabase/client.ts`.
6. Vérifier **lint + typecheck** (`npm run lint`, `npx tsc --noEmit`) avant push
   (push = déploiement Netlify).

## Réflexe avant d'écrire

1. Identifier le sujet → ouvrir le `.md` local correspondant.
2. Vérifier les avertissements de dépréciation / breaking change.
3. Coder selon la doc locale, pas selon la mémoire d'une version antérieure.

Conventions détaillées : `docs/conventions/00-architecture.md`,
`docs/conventions/02-conventions-code.md`.
