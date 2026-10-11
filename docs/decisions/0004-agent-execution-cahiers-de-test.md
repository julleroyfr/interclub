# ADR 0004 — Agent d'exécution (partielle) des cahiers de test

- **Statut** : **acceptée** (le 2026-09-02) — **Option A** retenue (formaliser
  l'hybride dans la convention 06) ; **pilote** sur le cahier
  [`13-espace-coach.cahier.md`](../tests/13-espace-coach.cahier.md) avant
  généralisation.
- **Décideurs** : julleroyfr (produit) + assistance technique
- **Portée** : outillage de test manuel (`docs/tests/*.cahier.md`), convention
  [`06-cahier-de-test.md`](../conventions/06-cahier-de-test.md)
- **Sources** :
  - [`docs/conventions/06-cahier-de-test.md`](../conventions/06-cahier-de-test.md)
    (le cahier comme validation manuelle, « irréductiblement manuel »)
  - [`docs/conventions/03-base-de-donnees-supabase.md`](../conventions/03-base-de-donnees-supabase.md)
    §5 (stack Supabase **locale** autorisée pour valider ; `db push`/`db diff`
    interdits)
  - Existant : `scripts/test-t5a.sh`, `test-t5b.sh`, `test-t5c.sh`, `test-t6.sh`
    (via `npm run test:t5a…`) ; `@playwright/test` + `npm run test:e2e` +
    `playwright.config.ts` déjà installés

## Contexte

La question posée : **peut-on avoir un agent qui « passe » les cahiers de test ?**

Aujourd'hui, les cahiers (`docs/tests/*.cahier.md`) sont la **traduction manuelle
et rejouable** des specs, pour tout ce qui touche la **base réelle, l'auth, les
policies RLS et le realtime** — que la convention 06 pose comme **irréductiblement
manuel** faute de Docker/CLI.

Or l'outillage a évolué et **contredit partiellement cette frontière** :

- **Playwright est installé** (`@playwright/test`, `npm run test:e2e`,
  `playwright.config.ts`) → le pilotage navigateur des parcours IHM est disponible.
- **Des scripts d'automatisation existent déjà** : `scripts/test-t5a/b/c.sh` et
  `test-t6.sh` rejouent automatiquement les cas **non-IHM** des cahiers (auth, RLS
  positives **et** négatives, jetons QR) en tapant l'API Supabase **locale**.
- La **stack locale Docker est autorisée** pour la validation (les cahiers eux-mêmes
  s'appuient sur `supabase db reset` + `npm run dev` port 3011). Seuls `db push` /
  `db diff` restent interdits.

Le pattern **hybride « bash/API pour l'auth+RLS, manuel pour l'UI »** est donc
**déjà en place** sur les tranches T5/T6 — sans avoir été formalisé.

## Faisabilité (par nature de cas)

En prenant le cahier `13-espace-coach.cahier.md` (CT-01 → CT-13) comme échantillon
représentatif :

| Nature du cas | Exemple (CT) | Automatisable ? | Moyen |
| --- | --- | --- | --- |
| Navigation + 404 selon rôle | CT-01, CT-09 | **Oui** | Playwright (URL, statut) |
| Formulaire IHM + état à l'écran | CT-02, CT-03, CT-08 | **Oui** | Playwright (DOM : jauge, badge, sélecteur) |
| Refus applicatif (message) | CT-04 | **Oui** | Playwright (présence du message) |
| Bascule d'état par SQL | CT-05, CT-06, CT-10 | **Oui** | SQL local (déjà décrit en SQL dans le cahier) |
| RLS négative (POST/SQL direct) | CT-06, CT-10, CT-13 | **Oui** | Script API sous rôle donné (pattern test-t6) |
| Session QR anonyme | CT-07, CT-11 | **Oui, délicat** | Playwright multi-contexte (onglet privé) |
| Multi-acteurs simultanés | CT-10 | **Oui, délicat** | Playwright `browser.newContext()` × N |
| Jugement de rendu (lisibilité, couleur, mobile) | badges, ergonomie | **Non** | Œil humain |

**Bilan** : sur cet échantillon, ~11 des 13 CT sont **observables et vérifiables**
par un agent. Ne restent **irréductiblement manuels** que les jugements **subjectifs
de rendu** (lisibilité, couleur exacte, ergonomie tactile). Un agent peut vérifier
la **présence/absence** d'un élément, pas **juger sa qualité visuelle**.

## Ce qu'un agent exécuteur ferait

Pour un cahier donné :

1. lever la stack locale (`supabase start` + `supabase db reset` = migrations +
   seed) et le serveur dev (`npm run dev`, port 3011) ;
2. lancer les scripts bash existants (auth/RLS/QR/migrations) ;
3. piloter Playwright pour les parcours IHM (navigation, formulaires, assertions
   DOM), y compris multi-contextes pour les sessions QR/admin simultanés ;
4. exécuter les bascules SQL décrites par le cahier (phases, insertions admin) ;
5. remplir le **registre d'exécution** (✅/❌ + version/commit) et, sur un ❌,
   qualifier la cause (code non conforme vs spec fausse → règle de changement).

## Limites & risques

- **Docker requis** : l'agent a besoin de Docker + CLI Supabase **en marche**
  localement. Sans stack, rien ne tourne.
- **Le subjectif reste manuel** : lisibilité, couleur de badge, ergonomie mobile.
  Le cahier resterait donc **partiellement** manuel — l'agent **ne remplace pas** le
  passage humain, il **absorbe la partie mécanique**.
- **Fragilité E2E** : les assertions IHM se cassent au moindre changement de DOM/
  libellé ; coût de maintenance non nul (comme tout E2E Playwright).
- **Multi-contextes** (permanent + QR anonyme + admin en parallèle) = point le plus
  délicat à scripter de façon fiable.
- **Traçabilité** : un registre rempli par un agent doit rester **distinguable** d'un
  passage humain (colonne « Testeur » = agent + commit).

## Impact sur la convention 06 (le vrai point à trancher)

La convention 06 affirme : « le cahier couvre l'irréductiblement manuel ». Or
l'existant (scripts T5/T6) **automatise déjà** une partie de ce qui y est décrit.
La convention est donc **en retard sur la pratique**. Deux options :

- **A — Formaliser l'hybride (recommandé)** : réécrire 06 pour distinguer, dans un
  cahier, les cas **« auto »** (script/Playwright, rejoués par l'agent/CI) des cas
  **« manuel »** (jugement de rendu). Le cahier reste la **source unique**, annotée
  par cas. L'agent exécute les « auto » et **liste** les « manuel » à faire par un
  humain.
- **B — Statu quo** : garder les cahiers 100 % manuels par principe et refuser
  l'agent. Cohérent mais **contredit l'outillage déjà en place** (T5/T6) qu'il
  faudrait alors reclasser.

## Décision (le 2026-09-02)

1. **Principe accepté** : un agent exécuteur **partiel** — il rejoue la mécanique
   **auto** (scripts API/RLS + Playwright) et **liste** les cas **manuel** (jugement
   de rendu) laissés au testeur humain. L'agent **ne remplace pas** le passage
   humain, il en absorbe la partie mécanique.
2. **Option A retenue** : formaliser l'hybride dans la convention 06 (marquage
   `auto` / `manuel` / `mixte` par cas de test).
3. **Périmètre pilote** : le seul cahier
   [`13-espace-coach.cahier.md`](../tests/13-espace-coach.cahier.md), avant toute
   généralisation.

## Suite (si accepté)

- Mettre à jour la convention 06 (marquage `auto` / `manuel` par cas de test).
- Écrire les specs Playwright du cahier pilote + réutiliser les scripts bash T5/T6.
- Définir la commande d'orchestration (skill `passer-cahier` ou script `npm run
  test:cahier <domaine>`) et le format de remplissage du registre.
