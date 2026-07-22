<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Règles de fonctionnement & architecture

Ce projet suit des conventions strictes, **spec-first / TDD**, code et BDD en
français. Avant de travailler, lire les règles :

- **Index** : [`docs/conventions/README.md`](docs/conventions/README.md)

Points non négociables :

- **La spec est la vérité.** Ordre : **spec → tests → code**. On n'écrit pas de
  test sans spec, ni de code sans test.
- **Règle de changement** : tout changement impactant une spec existante se fait
  **après validation explicite**, puis dans l'ordre spec → tests → code. Jamais
  le code en premier. (cf. `docs/conventions/01-workflow-spec-first-tdd.md` §3)
- **Migrations : validation locale, application manuelle.** SQL versionné écrit
  à la main = vérité du schéma. Stack Supabase **locale** (Docker) autorisée pour
  valider les impacts BDD ; `supabase db push` / `db diff` **interdits**.
  Application vers recette/prod **à la main** (SQL Editor). Validation finale sur
  base réelle via **cahier de test manuel**. (cf.
  `docs/conventions/03-base-de-donnees-supabase.md` §5, `06-cahier-de-test.md`)
- Supabase-first, **pas de middleware ni d'API custom** sauf besoin justifié.
- **Push = déploiement Netlify** (pas de GitHub Actions).

Skills workflow disponibles : `nouvelle-fonctionnalite`, `rediger-spec`,
`cycle-tdd`, `rediger-cahier-de-test`.
