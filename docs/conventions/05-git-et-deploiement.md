# 05 — Git & Déploiement

## 1. Déploiement

- **Netlify déploie automatiquement au `push`.** Il n'y a **pas de GitHub
  Actions** ni de pipeline CI externe.
- Configuration dans `netlify.toml` (+ `@netlify/plugin-nextjs`).
- Mapping branche → environnement (cf.
  [09-environnements-et-donnees.md](./09-environnements-et-donnees.md)) :
  - `main` → **production** (base Supabase prod).
  - `develop` → **recette** (base Supabase recette).
  - `feature/*` → **preview** Netlify, sur base **recette**.
- **Conséquence directe : un `push` sur `main` = mise en ligne prod.** On n'y
  arrive qu'après passage en recette et cahier de test joué.

### Garde-fou avant push

Avant tout `push` :

- [ ] `npm run lint` passe.
- [ ] `npm run typecheck` OK.
- [ ] `npm run test` (Vitest) vert.
- [ ] Migrations SQL éventuelles **appliquées en recette** et consignées
      (cf. [03-base-de-donnees-supabase.md](./03-base-de-donnees-supabase.md) §5).
- [ ] Cahier de test concerné exécuté en recette (ou explicitement planifié).

## 2. Branches — Gitflow

On suit **Gitflow** : le code remonte **`feature/*` → `develop` → `main`**.

```
feature/*  ──►  develop  ──►  main
 (preview)      (recette)     (prod)
```

- **`main`** : production. Ne reçoit que des fusions depuis `develop` (ou
  `hotfix/*`). Toujours déployable.
- **`develop`** : intégration continue en recette. Cible des fusions de features.
- **`feature/<domaine>-<description>`** : une fonctionnalité (ex.
  `feature/classement-calcul`). Part de `develop`, y retourne.
- **`fix/*`**, **`refactor/*`**, **`docs/*`**, **`chore/*`** : partent aussi de
  `develop`.
- **`hotfix/<description>`** : correctif urgent de prod, part de `main`, fusionné
  dans `main` **et** `develop`.
- Une feature ne fusionne dans `develop` que quand la Definition of Done est
  remplie (cf. [01-workflow-spec-first-tdd.md](./01-workflow-spec-first-tdd.md) §6).
- La promotion `develop → main` se fait après validation en recette.

## 3. Commits

- **Messages en français**, style Conventional Commits :

  ```
  feat(classement): calcul du classement d'une division
  fix(rencontre): corrige le report d'un forfait sur le score
  docs(conventions): ajoute le cahier de test
  test(composition): couvre la règle R3
  ```

- Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Un commit = une intention cohérente. Éviter les commits fourre-tout.
- Committer ou pousser **uniquement quand l'utilisateur le demande**.

## 4. Ce qui ne se commite jamais

- `.env.local` et tout secret (clé `service_role` Supabase notamment).
- `node_modules/`, `.next/`.
- `.env.example` **se** commite (documentation des variables, sans valeur).

## 5. À ADAPTER pour un autre projet

- Le nom de l'hébergeur si différent de Netlify (le principe « push = déploiement »
  et le garde-fou avant push restent valables).
