# TODO — Initialisation du projet

Liste de référence des tâches d'initialisation, avec dépendances et statuts.
**Règle de rappel** : on ne remonte que les tâches **🔄 en cours** et **⏳ en
attente** (les tâches ✅ faites sont archivées en bas, pas rappelées).

Statuts : ✅ fait · 🔄 en cours · ⏳ en attente (à faire) · 🚫 bloqué (dépendance non levée)

Dernière mise à jour : 2026-07-22.

---

## 🔄 En cours

Aucune tâche en cours. **Prochaine étape : T5a** (auth permanente + rôle
courant), développée et validée sur la **stack locale** (cf. archive). L'archi
des sessions éphémères est **tranchée** (ADR 0001), donc T5d et T6 sont débloqués.

> ⏳ **Report recette/prod des migrations** : les 4 migrations
> (`202607221000` → `202607221200`) sont **validées en local** (`supabase db
> reset` : `interclub.version` = 4 lignes, 13 tables). Côté distant, seule la
> migration T3 (`202607221000_…`) est appliquée en **recette** ; les suivantes
> (socle, voie, auth/jetons QR) restent **à appliquer en recette** (à la main),
> puis en **prod à la bascule sur `main`**.

## ⏳ En attente (à faire)

| ID | Tâche | Dépend de | Notes |
| ---- | ------- | ----------- | ------- |
| T5 | Authentification Supabase (inscription/connexion) + mapping utilisateur ↔ rôle + jetons QR + affectation juge | T1, T4 | **Spec #2 validée** ; mécanisme éphémère **tranché** ([ADR 0001](decisions/0001-authentification-sessions-ephemeres-qr.md)). Découpage : **T5a** auth permanente + rôle courant · **T5b** mapping de rôle (admin) · **T5c** jetons QR (génération/affichage/révocation) · **T5d** ouverture session QR (anonymes + `session_qr` + RPC). Reste : migration auth/jetons QR (recette) puis code. cf. `expertise-supabase`. |
| T6 | Policies **RLS** selon la matrice de la spec rôles + [ADR 0001](decisions/0001-authentification-sessions-ephemeres-qr.md) (2 chemins : permanent via `compte`, éphémère via `session_qr`) | T4, T5 | Une policy par opération ; gating de phase ② ; vérifiées par cahier de test (négatifs inclus). |
| T7 | Jeux de données de test : `seed/01-jeu-de-test.sql` + `seed/99-purge-jeu-de-test.sql` (recette) | T4 | Idempotent + purge bornée. cf. `09` §3-4. |
| T8 | Premier écran + cahier de test associé (responsive, vérif mobile) | T4, T5 | Suivre `nouvelle-fonctionnalite` + `expertise-ihm-responsive`. |
| T9 | `<html lang="en">` → `lang="fr"` dans `src/app/layout.tsx` | — | Reporté (a11y). cf. mémoire `todo-differes`. |
| T10 | Export `viewport` (Next 16) dans le layout racine | — | cf. `07-standards-nextjs-16.md` §3 / `08` §3. |
| T11 | (Option) Hook local pre-push : `lint` + `typecheck` + `test` | — | Filet de sécurité car `push` = déploiement. |
| T12 | Supprimer `src/domaine/smoke.test.ts` | T-init | Dès le premier vrai test du domaine. |
| T13 | (Plus tard) Étendre l'E2E Playwright sur parcours stabilisés | T7 | Tant que recette non stable, cahier manuel prioritaire. |

## ✅ Fait (archive — non rappelé)

- **ADR 0001 — Auth des sessions QR éphémères**
  (`docs/decisions/0001-authentification-sessions-ephemeres-qr.md`), acceptée le
  2026-07-22. Tranche le mécanisme laissé « hors périmètre » par la spec #2 :
  connexions **anonymes** Supabase + table `interclub.session_qr` + RPC
  `ouvrir_session_qr` (`SECURITY DEFINER`), autorisation recalculée en RLS
  (coupure immédiate R13/R22/R23). **Débloque T5d et T6.**
- **Stack Supabase locale (Docker)** installée & validée le 2026-07-22 :
  `supabase start` + `supabase db reset` rejouent les 4 migrations sur base
  neuve. Convention 03 §5 **amendée** (validation locale autorisée ; `db push` /
  `db diff` **interdits** ; application recette/prod **manuelle**) ;
  `supabase/config.toml` versionné (`interclub` exposé, seed branché,
  `major_version = 17`) ; pas-à-pas `docs/stack-locale-supabase.md` ; CLI 2.109.1.
- **T3 — Migration initiale** (`202607221000_creation_schema_interclub_et_version.sql`) :
  schéma `interclub` + table `interclub.version`. Appliquée en **recette** le
  2026-07-22, schéma exposé à l'API. **Prod reportée** à la bascule sur `main`.
  Débloque T4.
- **T2 — Projets Supabase recette + prod** créés, variables Netlify par contexte
  (preview/branch→recette, production→prod). Débloque T3.
- **T1 — Spec #1 : Rôles & autorisations** (`docs/specs/01-roles-et-autorisations.md`),
  statut `validée` le 2026-07-12. Matrice rôles × actions + cycle de vie d'une
  rencontre. Débloque T4 (modèle de données), T5 (auth), T6 (RLS).
- Conventions & architecture (`docs/conventions/00→09`) + skills (`.claude/skills/`).
- Mise à jour **Next.js 16.2.10** (+ `eslint-config-next`).
- Standards **Next.js 16** (`07`), **IHM responsive** (`08`), **environnements &
  données** (`09`), **gitflow** (`05`).
- Outillage de test installé et vérifié : **Vitest + Testing Library** (`vitest.config.mts`,
  `vitest.setup.ts`), **Playwright + Chromium** (`playwright.config.ts`, dossier
  `e2e/`), scripts npm (`test`, `test:watch`, `test:coverage`, `test:e2e`,
  `typecheck`). Test fumée vert.
- Suivi migrations (`supabase/migrations/JOURNAL.md`) et seed (`supabase/seed/README.md`).

## Graphe de dépendances

```mermaid
flowchart LR
  T1["T1 · spec rôles"]
  T2["T2 · projets Supabase"]
  T3["T3 · schéma + version"]
  T4["T4 · modèle données"]
  T5["T5 · auth"]
  T6["T6 · RLS"]
  T7["T7 · seed/purge"]
  T8["T8 · 1er écran + cahier"]
  T13["T13 · E2E Playwright"]

  T1 --> T4
  T2 --> T3
  T3 --> T4
  T4 --> T5
  T5 --> T6
  T4 --> T7
  T7 --> T13
  T5 --> T8
  T4 --> T8

  I["Indépendants : T9 lang=fr · T10 viewport · T11 hook pre-push · T12 retrait smoke test"]
```
