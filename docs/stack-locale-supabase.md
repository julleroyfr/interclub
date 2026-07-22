# Stack Supabase locale (Docker) — installation & usage

Pas-à-pas pour valider **en local** les impacts base de données (rejouabilité des
migrations, contraintes, RLS, Auth, Realtime) **avant** toute application en
recette.

> ⚠️ **Rappel de convention.** La stack locale sert **uniquement** à valider.
> Le SQL écrit à la main dans `supabase/migrations/` reste la **seule vérité du
> schéma**, et l'application vers recette/prod est **manuelle** (SQL Editor).
> `supabase db push` et `supabase db diff` sont **interdits**.
> Réf. : [`docs/conventions/03-base-de-donnees-supabase.md`](conventions/03-base-de-donnees-supabase.md) §5.

## 1. Prérequis (Windows 11)

| Outil | Rôle | Installation |
| ------- | ------ | ------------- |
| **Docker Desktop** | Moteur de conteneurs (WSL2) | Déjà installé. Le **démarrer** avant toute commande `supabase`. |
| **CLI Supabase** | Pilote la stack locale | `scoop install supabase` **ou** `winget install Supabase.CLI` (déjà présent : `npm i -g supabase`). |

Vérifier que tout répond :

```powershell
docker version        # doit afficher un "Server: ..." (daemon démarré)
supabase --version    # ex. 2.102.0
```

> Si `docker` n'est pas reconnu alors que Docker Desktop tourne, ajouter à la
> session le dossier des binaires :
> `$env:PATH = "$env:ProgramFiles\Docker\Docker\resources\bin;$env:PATH"`.

## 2. Démarrer la stack

Depuis la racine du projet (`C:\git_source\interclub`) :

```powershell
supabase start
```

Au **premier lancement**, le CLI télécharge les images Docker (plusieurs minutes).
Ensuite, `supabase start` affiche les URLs et les clés **locales** :

| Service | URL locale (par défaut) |
| --------- | ------------------------ |
| API (PostgREST) | <http://127.0.0.1:54321> |
| Base PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (UI) | <http://127.0.0.1:54323> |
| Inbucket (e-mails) | <http://127.0.0.1:54324> |

Les clés `anon` / `service_role` affichées sont des clés **de démo locales**
(sans valeur en dehors de la machine) — inutile de les protéger.

Commandes utiles :

```powershell
supabase status       # ré-affiche URLs et clés de la stack en cours
supabase stop         # arrête la stack (conserve les données)
supabase stop --no-backup   # arrête et jette les données locales
```

## 3. Rejouer les migrations sur base neuve

C'est **le** test de rejouabilité exigé par la convention (§5) :

```powershell
supabase db reset
```

`db reset` :

1. recrée une base **vierge**,
2. rejoue **toutes** les migrations de `supabase/migrations/` dans l'ordre,
3. charge les seeds branchés dans `config.toml` (`[db.seed]`), s'il y en a.

Si une migration n'est pas rejouable (dépendance manquante, ordre, SQL non
idempotent), `db reset` **échoue** ici — donc **avant** recette/prod. C'est le but.

## 4. Valider les impacts BDD

Une fois `db reset` passé :

- **Studio** (<http://127.0.0.1:54323>) : inspecter tables, colonnes, contraintes,
  policies RLS du schéma `interclub`.
- **SQL Editor local** (dans Studio) ou `psql` : dérouler les vérifications du
  cahier de test (contraintes, RLS, cas nominaux/erreurs).
- **Auth / Realtime** : tester sessions, rôles et abonnements sur la base locale.

Le schéma `interclub` est exposé à l'API locale (réglé dans `config.toml` →
`[api].schemas`), comme en cloud (Dashboard → Settings → API → Exposed schemas).

## 5. Aligner la version PostgreSQL

Pour que le local reflète recette/prod, la version majeure de Postgres doit
correspondre :

1. Dashboard Supabase (projet **recette**) → **Settings → Database → Postgres version**.
2. Reporter le major dans `supabase/config.toml` → `[db] major_version`.
3. `supabase stop --no-backup` puis `supabase start` pour recréer la base sur la
   bonne version.

## 6. Ce qui reste MANUEL (garde-fous)

- ❌ **Jamais** `supabase db push` : l'application recette/prod passe **uniquement**
  par le SQL Editor Supabase, à la main.
- ❌ **Jamais** `supabase db diff` : on ne commite pas de SQL auto-généré ; le
  fichier de migration écrit à la main fait foi.
- ✅ Autorisés en local : `start`, `stop`, `status`, `db reset`.
- La **validation finale** d'une fonctionnalité touchant la base reste le
  **cahier de test** exécuté sur la base **réelle** (recette), car config,
  versions et données peuvent différer du local.

## 7. Cycle type pour un changement de schéma

```mermaid
flowchart TD
  A[Écrire la migration SQL<br/>supabase/migrations/] --> B[supabase db reset<br/>rejoue sur base neuve]
  B -->|échec| A
  B -->|succès| C[Valider en local<br/>Studio / RLS / cahier]
  C --> D[Appliquer à la main<br/>SQL Editor RECETTE]
  D --> E[Valider en recette<br/>cahier de test]
  E --> F[Rejouer à la main<br/>SQL Editor PROD]
  D -.-> G[JOURNAL.md + interclub.version]
  F -.-> G
```
