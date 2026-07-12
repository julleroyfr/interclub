<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Règles de fonctionnement & architecture

Ce projet suit des conventions strictes, **spec-first / TDD**, code et BDD en
français. Avant de travailler, lire les règles :

- **Index** : [`docs/conventions/README.md`](docs/conventions/README.md)

Points non négociables :

- **La spec est la vérité.** Ordre : **spec → tests → code**. On n'écrit pas de
  test sans spec, ni de code sans test.
- **Règle de changement** : tout changement impactant une spec existante se fait
  **après validation explicite**, puis dans l'ordre spec → tests → code. Jamais
  le code en premier. (cf. `docs/conventions/01-workflow-spec-first-tdd.md` §3)
- **Pas de Docker/CLI Supabase** : migrations écrites en SQL versionné puis
  **appliquées à la main** ; tests base réelle / auth / RLS / realtime via
  **cahier de test manuel** (`docs/conventions/06-cahier-de-test.md`).
- Supabase-first, **pas de middleware ni d'API custom** sauf besoin justifié.
- **Push = déploiement Netlify** (pas de GitHub Actions).

Skills workflow disponibles : `nouvelle-fonctionnalite`, `rediger-spec`,
`cycle-tdd`, `rediger-cahier-de-test`.
