# 09 — Environnements & jeux de données

## 1. Deux environnements, deux bases

| Environnement | Base de données | Déployé depuis | Usage |
|---------------|-----------------|----------------|-------|
| **Recette** | Projet Supabase **recette** | branche `develop` **et** branches de feature (previews Netlify) | Intégration, tests manuels (cahier), validation avant prod |
| **Production** | Projet Supabase **prod** | branche `main` | Utilisateurs réels |

Règles :

- **Les branches de feature pointent vers la base de recette.** Jamais vers la
  prod. Idem pour les preview deploys Netlify.
- **Une migration est d'abord appliquée en recette**, validée, puis rejouée en
  prod (application manuelle — cf. [03-base-de-donnees-supabase.md](./03-base-de-donnees-supabase.md) §5).
- Chaque environnement a son **jeu de variables** (`.env.local` en local pointant
  vers la recette ; variables Netlify par contexte de déploiement).
- **Ne jamais** exécuter un cahier de test destructeur sur la prod.

### Variables par environnement

- Local & recette : `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  du projet **recette**.
- Netlify : définir les variables par **contexte** (`production` ← projet prod ;
  `deploy-preview` / `branch-deploy` ← projet recette).
- La clé `service_role` (si utilisée côté serveur) reste secrète, jamais exposée
  au client, différente par environnement.

## 2. Correspondance avec le gitflow

On suit **Gitflow** (cf. [05-git-et-deploiement.md](./05-git-et-deploiement.md)) :

```mermaid
flowchart LR
  F["feature/*<br/>preview · base recette"] --> D["develop<br/>recette · base recette"] --> M["main<br/>prod · base prod"]
```

- `feature/*` → preview Netlify sur **base recette**.
- `develop` → environnement **recette**.
- `main` → **production**.

## 3. Jeux de données de test

Les tests (cahier manuel, et E2E à terme) ont besoin de données de départ
**reproductibles** et **effaçables** pour être rejoués.

### Organisation

```text
supabase/
  migrations/        # Schéma (structure) — versionné, appliqué à la main
  seed/
    README.md        # Mode d'emploi
    01-jeu-de-test.sql       # INSERT des données de test (idempotent)
    99-purge-jeu-de-test.sql # DELETE pour tout remettre à zéro (rejouable)
```

### Principes

- **Seed = données de test uniquement**, appliqué en **recette** (jamais en prod).
- **Idempotent** : rejouer le seed ne duplique pas (upsert / `on conflict do
  nothing`, ou purge puis insert).
- **Purge dédiée** : un script `99-purge-…` supprime **exactement** les données de
  test pour pouvoir **rejouer** un cahier proprement. Il ne touche qu'aux données
  identifiables comme « de test » (préfixe, plage d'`id`, marqueur `est_jeu_de_test`).
- **Comptes de test par rôle** (joueur, capitaine, responsable de club, arbitre,
  admin) créés via Supabase Auth en recette, documentés dans le cahier
  ([06-cahier-de-test.md](./06-cahier-de-test.md)).
- Scripts **versionnés** et **rejouables**, appliqués à la main dans le SQL Editor
  (pas de CLI/Docker).

### Cycle « rejouer un cahier »

1. `99-purge-jeu-de-test.sql` — nettoie l'état précédent.
2. `01-jeu-de-test.sql` — recharge un état initial connu.
3. Dérouler les cas du cahier, tracer les résultats.

## 4. Isolation des données de test

- Marquer les données de test de façon **non ambiguë** (préfixe de nom, colonne
  `est_jeu_de_test`, ou plage d'identifiants réservée) afin que la purge soit
  **sûre** et ne touche jamais à de vraies données.
- La purge doit être **prouvablement bornée** aux données de test (clause `where`
  explicite). En cas de doute, ne pas exécuter.

## 5. À ADAPTER pour un autre projet

- Le nombre d'environnements et le mapping branche → base.
- Le contenu des jeux de données et la stratégie de marquage/purge.
