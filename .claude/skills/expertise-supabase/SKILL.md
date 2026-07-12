---
name: expertise-supabase
description: Utiliser Supabase correctement dans ce projet (auth, RLS, realtime, accès données) avec @supabase/ssr sur Next 16. À utiliser dès qu'on touche à l'authentification, aux requêtes/mutations de données, aux policies RLS, au realtime ou au rafraîchissement de session. S'appuie sur les helpers existants et rappelle la contrainte migrations manuelles (pas de Docker/CLI).
---

# Expertise Supabase (avec @supabase/ssr sur Next 16)

Dépendances : `@supabase/supabase-js`, `@supabase/ssr`. Sécurité = **RLS** dans la
base. Conventions : `docs/conventions/03-base-de-donnees-supabase.md`.

## Les trois points d'entrée (déjà en place — les RÉUTILISER)

| Contexte | Helper | Usage |
|----------|--------|-------|
| Server Component / Server Action / Route Handler | `src/lib/supabase/server.ts` → `createClient()` | `const supabase = await createClient()` — utilise `await cookies()` |
| Client Component (`"use client"`) | `src/lib/supabase/client.ts` → `createClient()` | navigateur, realtime, interactivité |
| Rafraîchissement de session | `src/lib/supabase/middleware.ts` → `updateSession()` appelé par `src/proxy.ts` | tourne sur les requêtes (proxy Next 16) |

**Ne pas recréer de client à la main** ni instancier `createServerClient` ailleurs :
passer par ces helpers.

## Session & proxy (spécifique Next 16)

- Le rafraîchissement de session est le **seul** cas justifié de « middleware » —
  et en Next 16 il s'appelle **proxy** (`src/proxy.ts` exporte `proxy()`).
- Dans `updateSession`, **ne rien insérer entre `createServerClient` et
  `supabase.auth.getUser()`** (risque de déconnexions aléatoires).
- Dans un Server Component, `setAll` peut échouer (cookies en lecture seule) :
  c'est normal, le proxy gère le refresh (cf. commentaire dans `server.ts`).

## Authentification

- **Supabase Auth** uniquement (pas d'auth maison).
- Pour connaître l'utilisateur côté serveur : `await supabase.auth.getUser()`
  (jamais faire confiance à un état client pour autoriser).
- Les rôles applicatifs (capitaine, arbitre, admin…) sont **en base** et pilotent
  les policies RLS.

## Accès aux données

- **Toujours vérifier `error`** :
  ```ts
  const { data, error } = await supabase.from('rencontre').select('*')
  if (error) { /* traiter — ne jamais avaler */ }
  ```
- Lectures côté serveur quand possible (Server Components) ; mutations via Server
  Actions.
- **Pas de logique métier dans la requête** : classement, éligibilité, forfaits se
  calculent dans `src/domaine/` (pur, testé Vitest). Si un test exige de mocker
  Supabase, c'est le signal d'extraire le métier.

## RLS (la vraie barrière de sécurité)

- **RLS activée par défaut** sur toute table exposée. Table sans policy = aucun
  accès (fail-closed, voulu).
- Une policy par opération (`select`/`insert`/`update`/`delete`), basée sur
  `auth.uid()` et les rôles.
- Chaque règle d'accès d'une spec = une policy **+ un cas de cahier de test**
  (dont le négatif : ce qu'un autre rôle ne doit pas pouvoir faire/voir).

## Realtime

- Pour la **messagerie** et les mises à jour live. Abonnements dans des Client
  Components ; **se désabonner au démontage**.
- Activer la réplication realtime seulement sur les tables concernées.
- RLS s'applique au realtime : un client ne reçoit que ce qu'il peut lire.

## Migrations — MANUEL (pas de Docker/CLI)

- Écrire le SQL dans `supabase/migrations/AAAAMMJJHHMM_description.sql`, puis
  **l'appliquer à la main** dans le SQL Editor Supabase et le consigner.
- **Jamais** de modif de schéma « à la souris » sans fichier de migration.
- Le fichier SQL est la source de vérité du schéma ; il doit être rejouable.
- Détails : `docs/conventions/03-base-de-donnees-supabase.md` §5 ; validation via
  le skill `rediger-cahier-de-test`.

## Sécurité des clés

- Clé `anon` : publique (protégée par RLS). Clé `service_role` : **jamais** côté
  client, jamais commitée. Variables dans `.env.local` (non versionné).
