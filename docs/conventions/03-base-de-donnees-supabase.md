# 03 — Base de données & Supabase

## 1. Principes

- **PostgreSQL via Supabase** est la source de données.
- **Schéma dédié à l'application** : tous les objets métier vivent dans un schéma
  nommé **`interclub`** (pas dans `public`). cf. §2bis.
- **Le schéma en français** : tables et colonnes en `snake_case` français.
- **La sécurité vit dans la base** : Row Level Security (RLS) activée sur toute
  table exposée. Le front ne fait jamais autorité pour autoriser une action.
- **Le schéma est versionné** en SQL dans `supabase/migrations/`, même si
  l'application se fait à la main (cf. §5). Le suivi des migrations appliquées est
  matérialisé par une table **`interclub.version`** (cf. §5bis).

## 2. Conventions de nommage SQL

| Objet | Convention | Exemple |
| ------- | ----------- | --------- |
| Table | singulier, snake_case français | `rencontre`, `equipe`, `joueur` |
| Colonne | snake_case français | `date_rencontre`, `score_domicile` |
| Clé primaire | `id` (uuid par défaut) | `id` |
| Clé étrangère | `<table>_id` | `equipe_domicile_id` |
| Booléen | préfixe `est_`/`a_` | `est_forfait` |
| Index | `idx_<table>_<colonnes>` | `idx_rencontre_division_id` |
| Policy RLS | phrase décrivant l'accès | `"lecture rencontres publiques"` |

- Horodatage : `created_at`, `updated_at` (`timestamptz`, défaut `now()`).
- Préférer `uuid` pour les clés primaires.
- Contraintes d'intégrité (`foreign key`, `unique`, `check`) **dans la base**,
  pas seulement dans le code. La base garantit ce que la spec exige.
- Tous les objets sont **qualifiés par le schéma** : `interclub.rencontre`, etc.

## 2bis. Schéma dédié `interclub`

- L'application n'utilise **pas** `public` : ses tables/vues/fonctions vivent dans
  le schéma **`interclub`**, pour isoler le métier des objets techniques Supabase.
- Le schéma doit être **exposé à l'API** Supabase (Dashboard → Settings → API →
  *Exposed schemas* : ajouter `interclub`) pour être requêtable par le client.
- Depuis le code, préciser le schéma si besoin : `supabase.schema('interclub')`
  (ou configurer le schéma par défaut du client). Documenter le choix retenu.
- RLS s'applique par table, indépendamment du schéma : activer RLS sur chaque
  table exposée de `interclub`.

## 3. Row Level Security (RLS)

- **RLS activée par défaut** sur chaque table accessible depuis le client.
- Une table sans policy = aucun accès (fail-closed). C'est voulu.
- Policies distinctes par opération (`select`, `insert`, `update`, `delete`).
- S'appuyer sur `auth.uid()` et les rôles pour autoriser.
- **Chaque règle d'accès d'une spec doit correspondre à une policy** et être
  vérifiée par le cahier de test (cf. [06-cahier-de-test.md](./06-cahier-de-test.md)).

## 4. Authentification (Supabase Auth)

- On utilise **Supabase Auth** (pas d'auth maison).
- Côté serveur : client de `src/lib/supabase/server.ts`.
- Côté navigateur : client de `src/lib/supabase/client.ts`.
- Le rafraîchissement de session peut nécessiter un helper
  (`src/lib/supabase/middleware.ts`) **uniquement si** un middleware est justifié
  (cf. [00-architecture.md](./00-architecture.md) §2). Sinon, on s'en passe.
- Les rôles applicatifs (ex. capitaine, arbitre, administrateur) sont modélisés
  en base et pilotent les policies RLS.

## 5. Migrations — processus MANUEL

> ⚠️ **Contrainte de ce projet : pas de Docker, pas de CLI Supabase.**
> Les migrations sont **écrites en SQL versionné** puis **appliquées à la main**
> dans l'éditeur SQL Supabase. Il n'y a pas d'exécution automatisée.

Processus pour tout changement de schéma :

1. **Écrire** le SQL dans `supabase/migrations/` :
   `AAAAMMJJHHMM_description.sql` (ex. `202607121030_creation_table_rencontre.sql`).
   Un fichier = un changement cohérent. Idempotent si possible
   (`create table if not exists`, `alter … add column if not exists`).
   Terminer par l'insertion de la ligne de suivi dans `interclub.version` (§5bis).
2. **Relire** vis-à-vis de la spec (colonnes, contraintes, RLS).
3. **Appliquer d'abord en RECETTE** dans le SQL Editor Supabase, valider, **puis**
   rejouer en **PROD** (cf. [09-environnements-et-donnees.md](./09-environnements-et-donnees.md)).
4. **Consigner l'application** : dans `supabase/migrations/JOURNAL.md`
   (date + auteur + environnement) **et** via la table `interclub.version`.
5. **Valider** via le cahier de test (données, contraintes, RLS).

Règles :

- **Jamais** de modification de schéma « à la souris » sans fichier de migration
  correspondant. Le fichier SQL est la vérité du schéma.
- Le SQL doit être **rejouable** sur une base neuve pour reconstruire le schéma.
- Une migration appliquée n'est pas réécrite : on ajoute une nouvelle migration.

## 5bis. Table de suivi `interclub.version`

Une table en base trace **les migrations réellement installées** sur CHAQUE
environnement (recette et prod ayant chacun leur base, donc leur table).

Forme minimale attendue :

| Colonne | Type | Rôle |
| --------- | ------ | ------ |
| `version` | `text` (PK) | Identifiant de la migration = nom du fichier (`AAAAMMJJHHMM_description`) |
| `description` | `text` | Résumé lisible |
| `applique_le` | `timestamptz` (défaut `now()`) | Date d'application |
| `applique_par` | `text` | Qui a appliqué |

- Chaque fichier de migration se **termine** par un `insert into interclub.version …`
  de sa propre version (idempotent : `on conflict (version) do nothing`).
- Avant d'appliquer une migration, on peut vérifier l'état :
  `select version from interclub.version order by version;`
- La création de la table `interclub.version` est elle-même la **première
  migration** du projet.

## 6. Realtime

- **Supabase Realtime** pour la **messagerie** et les mises à jour live.
- Activer la réplication realtime uniquement sur les tables qui en ont besoin.
- Les abonnements realtime vivent dans des Client Components (`"use client"`),
  et sont **désabonnés** au démontage.
- RLS s'applique aussi au realtime : un client ne reçoit que ce qu'il a le droit
  de lire.

## 7. Accès aux données depuis l'app

- Toujours vérifier `error` sur chaque appel Supabase.
- Requêtes de lecture côté serveur quand possible (Server Components).
- Mutations via Server Actions.
- Ne pas dupliquer la logique métier dans les requêtes : le calcul (classement,
  éligibilité) reste dans `src/domaine/`, testé en isolation.

## 8. À ADAPTER pour un autre projet

- Le modèle de données (tables du domaine).
- Les rôles applicatifs et les policies RLS associées.
