# Interclub

Next.js + Supabase + Netlify

## Stack

- **Framework**: Next.js (App Router)
- **Base de données / Auth**: Supabase
- **Déploiement**: Netlify

## Démarrage

```bash
npm install
cp .env.example .env.local
# Remplir les variables dans .env.local
npm run dev
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (serveur uniquement) |

## Structure

```
src/
  app/          # Pages (App Router)
  lib/
    supabase/   # Clients Supabase (browser, server, middleware)
  middleware.ts # Refresh session Supabase
```
