# 07 — Standards Next.js 16

Version installée : **16.2.10** (App Router, React 19.2). Ce document fixe les
standards à respecter. **Il ne remplace pas la doc embarquée** :
`node_modules/next/dist/docs/01-app/` fait toujours foi (skill `expertise-nextjs`).

> ⚠️ Ne pas coder de mémoire : cette version a des breaking changes vs les
> versions antérieures. Vérifier le `.md` local du sujet avant d'écrire.

## 1. Server / Client Components

- **Server Components par défaut** (pages et layouts). On y fait : accès données
  près de la source, usage de secrets/clés, réduction du JS envoyé.
- **`"use client"` uniquement pour l'interactivité** : état, `onClick`/`onChange`,
  `useEffect`, APIs navigateur (`window`, `localStorage`), hooks custom.
- **La directive crée une frontière** : tout ce qu'un fichier `"use client"`
  importe part dans le bundle client. Donc **pousser `"use client"` le plus bas
  possible** (ex. un `<BoutonLike>` client, pas tout le layout).
- **Server → Client** : passer des **props sérialisables**. Un Server Component
  peut être passé en `children`/prop à un Client Component (pattern _slot_) : il
  reste rendu côté serveur.
- **Context providers** = Client Components, rendus **le plus profond possible**
  (wrapper `{children}`, pas tout le `<html>`).

## 2. Request APIs asynchrones (breaking change v16)

`cookies()`, `headers()`, `params`, `searchParams` sont **des `Promise`** → il
faut les **`await`**.

```tsx
// app/rencontre/[id]/page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // …
}
```

C'est déjà le cas dans `src/lib/supabase/server.ts` (`await cookies()`).

## 3. Protection des secrets (frontière serveur/client)

- Seules les variables préfixées **`NEXT_PUBLIC_`** sont exposées au client. Les
  autres sont remplacées par une chaîne vide côté client.
- Ne jamais importer de code à secret (clé `service_role`…) dans un module
  atteignable côté client. En cas de doute, protéger avec le package
  **`server-only`** (erreur au build si importé côté client).

## 4. Récupération & mutation des données

- **Lecture** : dans les Server Components, au plus près de la source (Supabase
  serveur). cf. `01-getting-started/06-fetching-data.md`.
- **Mutation** : **Server Functions / Server Actions** (`'use server'`), pas de
  route API custom tant que ça suffit. cf. `07-mutating-data.md`.
- ⚠️ **Sécurité** : une Server Action est joignable par POST direct, hors UI.
  **Vérifier authentification ET autorisation à l'intérieur de CHAQUE Server
  Action** (ne pas se fier à l'UI). En pratique : `await supabase.auth.getUser()`
  - contrôle du droit, en plus de la RLS. cf. guide `02-guides/data-security.md`.
- Après mutation, **revalider** le cache concerné (`revalidatePath` /
  `revalidateTag`) ou rediriger (`redirect`).

## 5. Proxy (ex-middleware) — standard v16

- Depuis Next 16, le middleware s'appelle **proxy**. Fichier unique
  **`src/proxy.ts`** (au niveau de `app`), export `proxy()` (défaut ou nommé) +
  `config.matcher`. C'est déjà en place.
- **Usage limité** : entêtes, réécritures, redirections, **vérifs optimistes**.
  Le proxy **n'est PAS** une solution de session/autorisation complète et **ne
  doit pas** faire de fetch lent. Ici il ne fait que **rafraîchir la session
  Supabase** (`updateSession` → `getUser`), ce qui est le seul cas justifié.
- `fetch` avec `cache`/`next.revalidate`/`next.tags` **n'a aucun effet** dans le
  proxy.

## 6. Structure des fichiers (App Router)

### Fichiers spéciaux (noms imposés, en anglais)

`layout` · `page` · `loading` · `error` · `global-error` · `not-found` ·
`template` · `default` · `route` (API). Ordre de rendu :
`layout → template → error → loading → not-found → page`.

### Organisation dans `app/`

- Un dossier = un segment d'URL. Une route n'est **publique** qu'avec un `page`
  ou `route`. On peut donc **colocaliser** sans risque de route accidentelle.
- **Dossiers privés `_dossier`** : hors routage — pour colocaliser du non-routable
  (ex. `app/rencontre/_composants/`, `app/rencontre/_domaine/`).
- **Groupes de routes `(groupe)`** : organisation sans impact sur l'URL
  (ex. `(public)`, `(admin)`), et layouts distincts par groupe.
- **Routes dynamiques** : `[segment]`, `[...segment]` (catch-all),
  `[[...segment]]` (catch-all optionnel). Valeurs via la prop `params` (async).

> Convention projet : le **domaine métier partagé** reste dans `src/domaine/`
> (pur, testé Vitest). Les dossiers privés `_domaine`/`_composants` servent au
> code **spécifique à une route**. Voir `docs/conventions/00-architecture.md`.

### Métadonnées par fichier

SEO/icônes via fichiers conventionnels : `favicon.ico`, `icon`, `apple-icon`,
`opengraph-image`, `twitter-image`, `sitemap`, `robots`. Préférer l'**API
Metadata** (export `metadata` / `generateMetadata`) aux balises manuelles.

## 7. Rendu, cache & navigation

- **Turbopack par défaut** (dev et build).
- Le cache est **explicite** en v16 : PPR, `cacheComponents`, directive
  `use cache`, `cacheLife`/`cacheTag`, `revalidateTag`/`updateTag`, `refresh`.
  **Lire `02-guides/upgrading/version-16.md` et `08-caching.md` avant** d'activer
  ou d'utiliser une API de cache — ne rien présumer d'une version antérieure.
- `next/image` : défauts modifiés en v16 (query strings locales,
  `minimumCacheTTL`, `imageSizes`, `qualities`, redirections). Vérifier avant de
  configurer.

## 8. Checklist « conforme Next 16 »

- [ ] Server Component par défaut ; `"use client"` seulement si interactivité, au
      plus bas.
- [ ] `params`/`searchParams`/`cookies`/`headers` **`await`és**.
- [ ] Mutations en Server Actions, avec **auth + autorisation vérifiées dedans**.
- [ ] Secrets jamais côté client (`NEXT_PUBLIC_` seulement ; `server-only` si doute).
- [ ] Un seul `src/proxy.ts`, limité au refresh de session.
- [ ] Dossiers privés `_x` / groupes `(x)` utilisés à bon escient.
- [ ] Aucune API de cache utilisée sans avoir lu la doc v16 correspondante.

## 9. À ADAPTER pour un autre projet

Rien : ce sont les standards du framework. Seuls changent les segments de routes
et le domaine métier.
