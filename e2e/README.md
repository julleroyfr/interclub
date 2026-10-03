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

## Filet « aucune erreur de page »

Les specs importent `test`/`expect` depuis `helpers/fixtures.ts`, **pas**
directement depuis `@playwright/test`. Une fixture automatique y fait échouer
tout test dont une page lève une erreur non interceptée (`pageerror`), y compris
dans les contextes ouverts par `browser.newContext()`. Chaque écran visité est
ainsi aussi un test « la page ne plante pas » (cf. incident PGRST203 du
2026-10-03, que CT-12 du cahier 23 ne voyait pas).

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

## Cartographie (cahier 12 CT-17 — pilotage de phase)

- `pilotage-phase.spec.ts` (`npm run test:cahier:phase`) : changement de phase
  refusé depuis un écran périmé (④ en base, « ← Préparation » refusé, spec #3
  R17) et transition adjacente acceptée. Remet la rencontre pilote en ① et à sa
  date seed.

## Cartographie (intégrité engagement & résultats — lot 4, 2026-10-03)

- `integrite-engagement.spec.ts` (`npm run test:cahier:integrite`) : cahier 15
  **CT-06/CT-07** (changement d'équipe dans le club d'affectation, résultats
  conservés ; hors club refusé par la base), cahier 17 **CT-16** (7ᵉ voie ado
  refusée par la base, correction permise), cahier 20 **CT-12/CT-13** (vitesse
  refusée pour un non-engagé ; retrait ⇒ résultat purgé, rangs recalculés).
- Remet la rencontre pilote à l'état seed (① , sans temps) et nettoie les
  résultats ado posés.

## Cartographie (cahier 28 — sécurité en base, appels directs)

- `securite-appels-directs.spec.ts` (`npm run test:cahier:securite`) : **CT-01 →
  CT-07 et CT-09** (9 tests, sans navigateur : API PostgREST/Auth via `request`
  et SQL) — fonctions fermées à PUBLIC et `anon` limité aux RPC QR, création de
  rencontre refusée (anon, coach) / acceptée (admin), `finaliser_inscription_coach`
  hors `service_role`, fonction future fermée, coche/auteur non falsifiables
  (coach, juge), coche conservée après correction.
- CT-08 (non-régression) = suites des cahiers 17, 19, 20 et 27.
- Nettoie ses données (rencontre du 01/12/2026, ligne de résultat, temps de
  vitesse, sessions QR) et remet la rencontre pilote en ① à la fin.

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

## Cartographie (cahiers 20 et 21 — vitesse)

- `juge-vitesse.spec.ts` (`npm run test:cahier:juge`) : **CT-01 → CT-11** (11
  tests) — session juge et roster par sexe, temps / chute / non-présentation,
  correction, filtres, temps invalide, fenêtre ③, espace masqué, périmètre RLS
  (impersonation SQL du juge, transaction annulée), lecture seule coach,
  responsive.
- `vitesse-classement.spec.ts` (`npm run test:cahier:vitesse`) : **CT-01 →
  CT-09** (9 tests) — barème (édition ①, lecture seule ③), points matérialisés,
  ex æquo + saut de rang, chute/NP/à saisir, recalcul du sexe, propagation
  équipe/club, barème ado, `points_vitesse` réservée au trigger.

> **Suite complète** : les fichiers mutent les mêmes rencontres seed → lancer en
> série, `npx playwright test --project=chromium --workers=1`, sur une base au
> seed (`npm run db:reset`).

## Après un passage

Reporter les cas verts dans le **registre d'exécution** du cahier
(`docs/tests/13-espace-coach.cahier.md`), colonne **Testeur** = `agent/playwright`
et le commit courant. Un cas `[mixte]` n'est ✅ complet qu'une fois le résidu
manuel vérifié.
