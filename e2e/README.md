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

- **CT-01 → CT-13 : tous implémentés et verts** — accueil + 404, création/
  composition, groupe de départ, double engagement + plafond, prêt persistant,
  garde-fou date (préparation + compétition), sessions QR coach temporaire
  (ouverture, édition, périmètre, gel), composition figée, périmètre inter-club. Plus
  un test dédié « filtre catégorie » (R34).
- **Résidu manuel** : CT-05, couleur violette du badge « Prêté » (`[mixte]`).
- Voir aussi `admin-prets.spec.ts` (écran admin de prêts, cahier 14).

> Ces tests mutent la même rencontre en base → exécution **série, un seul profil**
> (`test:cahier:coach` = `--project=chromium --workers=1`). Un `beforeEach` remet
> l'engagement à l'état seed (idempotence) ; les tests de scan nettoient les
> sessions QR.

## Cartographie (cahier 27 — contrôle des résultats)

- `admin-controle.spec.ts` : **CT-02 → CT-12 implémentés et verts** (CT-01 =
  migration, vérifié en SQL). Crée au besoin un 2ᵉ admin local
  `admin2@test.local` (API Auth admin + `compte`) pour le temps réel (CT-08/09).
  Remet la rencontre pilote sans résultats et en ③ à la fin.
- **Résidu manuel** : CT-12 sur un vrai téléphone.

## Cartographie (cahier 17 — saisie des résultats)

- `coach-saisie-resultats.spec.ts` (`npm run test:cahier:resultats`) : **CT-01 →
  CT-12, CT-14 et CT-15** (16 tests, dont boutons ≥ 44 px sur téléphone) — accès, deux vues, navigation ‹/›, voies enfant/ado,
  issues par type, correction, plafond/retrait ado, blocs, coach temporaire, saisie
  fermée hors ③, NP à la clôture (via le pilotage admin), vitesse en lecture seule.
  CT-13 (RLS) reste dans `npm run test:resultats`.
- Pose la rencontre enfant en ③ « aujourd'hui », la remet à l'état seed à la fin.
- **Résidus manuels** : couleurs des pastilles, geste de balayage, rendu des vues.

## Cartographie (cahier 18 — classement)

- `classement.spec.ts` (`npm run test:cahier:classement`) : **CT-01 → CT-13**
  (13 tests) — visibilité dès la ③, score + décomposition, au fil de l'eau,
  Femmes/Hommes, ex æquo, équipe/club, prêté, officiel, cross-club + « mon
  club », recherche/filtres/pagination (20 grimpeuses de volume insérées puis
  retirées), coach temporaire, vue admin. Résultats posés en SQL.
- **Résidus manuels** : couleurs (pastilles, rangs), liseré « mon club ».

## Cartographie (cahier 19 — saisie admin des résultats)

- `admin-saisie-resultats.spec.ts` (`npm run test:cahier:saisie-admin`) : **CT-01 →
  CT-10** (11 tests) — accès, liste tous clubs, saisie cross-club, correction NP →
  Top en ④, coexistence admin/coach + auteur, refus hors ③/④ (y compris
  re-soumission après passage en ⑤), entrée tableau de bord, responsive (≥ 44 px).

> **Suite complète** : les fichiers mutent les mêmes rencontres seed → lancer en
> série, `npx playwright test --project=chromium --workers=1`, sur une base au
> seed (`npm run db:reset`).

## Après un passage

Reporter les cas verts dans le **registre d'exécution** du cahier
(`docs/tests/13-espace-coach.cahier.md`), colonne **Testeur** = `agent/playwright`
et le commit courant. Un cas `[mixte]` n'est ✅ complet qu'une fois le résidu
manuel vérifié.
