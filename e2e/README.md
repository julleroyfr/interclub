# Tests E2E — exécution automatisée des cahiers (`[auto]`)

Ces specs Playwright rejouent la part **`[auto]`** des cahiers de test (parcours
IHM + gardes RLS observables), en complément des scripts API `scripts/test-t5*.sh`
/ `test-t6.sh`. Elles **ne remplacent pas** le passage humain : les cas `[manuel]`
et le résidu de rendu des cas `[mixte]` restent à vérifier à l'œil.

Cadre : [ADR 0004](../docs/decisions/0004-agent-execution-cahiers-de-test.md) ·
convention [06 §3.1](../docs/conventions/06-cahier-de-test.md).

## Pré-requis

- Stack Supabase **locale** up (`supabase start`) avec le seed `01` chargé
  (`npm run db:reset`).
- App dev sur le **port 3011** (`npm run dev`) — Playwright réutilise un serveur déjà
  lancé (`reuseExistingServer`).
- `docker` accessible (les pré-conditions SQL passent par
  `docker exec supabase_db_interclub psql …`, cf. `helpers/sql.ts`). Conteneur
  surchargeable via `SUPABASE_DB_CONTAINER`.

## Lancer

```bash
npm run test:cahier:coach     # cahier 13 — espace coach
npm run test:e2e              # tous les cahiers E2E
```

## Cartographie (cahier 13 — espace coach)

- **CT-01** : implémenté (nominal + négatif 404).
- **CT-02 → CT-13** : `test.fixme` — à décrocher un par un, chaque titre cite son
  `CT-xx` et ses règles `Rn`.
- **Résidu manuel** : CT-05, couleur violette du badge « Prêté » (`[mixte]`).

## Après un passage

Reporter les cas verts dans le **registre d'exécution** du cahier
(`docs/tests/13-espace-coach.cahier.md`), colonne **Testeur** = `agent/playwright`
et le commit courant. Un cas `[mixte]` n'est ✅ complet qu'une fois le résidu
manuel vérifié.
