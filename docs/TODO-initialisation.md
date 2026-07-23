# TODO — Initialisation du projet

Liste de référence des tâches d'initialisation, avec dépendances et statuts.
**Règle de rappel** : on ne remonte que les tâches **🔄 en cours** et **⏳ en
attente** (les tâches ✅ faites sont archivées en bas, pas rappelées).

Statuts : ✅ fait · 🔄 en cours · ⏳ en attente (à faire) · 🚫 bloqué (dépendance non levée)

Dernière mise à jour : 2026-07-22.

---

## 🔄 En cours

**T5c codé** (2026-07-23) : écrans `/admin/jetons` et `/coach/jetons`, domaine
`jeton-qr` (16 tests Vitest), Server Actions gardées + RLS, migration
`202607230900` (policies `jeton_qr` + `club_courant()`), vrai QR côté serveur
([ADR 0003](decisions/0003-affichage-qr-et-lecture-catalogues.md)).
**Prochaine étape : T5d** (ouverture de session QR au scan).

> 🧪 **À faire côté utilisateur** :
>
> - Appliquer la migration `202607230900` en **local** (`supabase db reset`,
>   charge aussi le seed `02-jetons-de-test.sql`) puis en **recette** (à la main).
> - Dérouler le cahier T5c (`docs/tests/04-jetons-qr-t5c.cahier.md`) + lancer
>   `npm run test:t5c` (CT-06..09).
> - Rappel T5b : dérouler le cahier `03-...` + `npm run test:t5b` (CT-07) si pas
>   encore fait.
>
> ✅ **T5a entièrement clos** ; **T5b** fusionné dans `develop` (migration
> `202607221400` appliquée en recette).

## ⏳ En attente (à faire)

| ID | Tâche | Dépend de | Notes |
| ---- | ------- | ----------- | ------- |
| T5d | Ouverture de session QR au scan (sessions anonymes + `session_qr` + RPC `ouvrir_session_qr`) | T5c, [ADR 0001](decisions/0001-authentification-sessions-ephemeres-qr.md) | Activer les connexions anonymes Supabase ; migration `session_qr` + RPC ; purge des anonymes. |
| T6 | Policies **RLS** selon la matrice de la spec rôles + [ADR 0001](decisions/0001-authentification-sessions-ephemeres-qr.md) (2 chemins : permanent via `compte`, éphémère via `session_qr`) | T4, T5 | Une policy par opération ; gating de phase ② ; vérifiées par cahier de test (négatifs inclus). |
| T7 | Jeux de données de test : `seed/01-jeu-de-test.sql` + `seed/99-purge-jeu-de-test.sql` (recette) | T4 | Idempotent + purge bornée. cf. `09` §3-4. |
| T8 | Premier écran + cahier de test associé (responsive, vérif mobile) | T4, T5 | Suivre `nouvelle-fonctionnalite` + `expertise-ihm-responsive`. |
| T9 | `<html lang="en">` → `lang="fr"` dans `src/app/layout.tsx` | — | Reporté (a11y). cf. mémoire `todo-differes`. |
| T10 | Export `viewport` (Next 16) dans le layout racine | — | cf. `07-standards-nextjs-16.md` §3 / `08` §3. |
| T11 | (Option) Hook local pre-push : `lint` + `typecheck` + `test` | — | Filet de sécurité car `push` = déploiement. |
| T12 | Supprimer `src/domaine/smoke.test.ts` | T-init | Dès le premier vrai test du domaine. |
| T13 | (Plus tard) Étendre l'E2E Playwright sur parcours stabilisés | T7 | Tant que recette non stable, cahier manuel prioritaire. |

## ✅ Fait (archive — non rappelé)

- **T5c — Jetons QR (génération/affichage/révocation/régénération)** (2026-07-23) :
  domaine pur `src/domaine/jeton-qr.ts` (R9/R15–R23, 16 tests Vitest), migration
  `202607230900` (helper `club_courant()` + grants + policies RLS `jeton_qr` :
  admin tout, coach temp. de son club), loaders `src/lib/jetons/jetons.ts`
  (catalogues via `service_role`, jetons via RLS, **vrai QR** côté serveur via
  `qrcode`), Server Actions `src/lib/jetons/actions.ts` (générer/révoquer/
  régénérer, gardées `peutGererJeton` + RLS), écrans `/admin/jetons` (tout
  périmètre + affectation juge) et `/coach/jetons` (jeton de son club), seed
  `02-jetons-de-test.sql`. Décision : [ADR 0003](decisions/0003-affichage-qr-et-lecture-catalogues.md).
  Cahier `docs/tests/04-jetons-qr-t5c.cahier.md` + script `scripts/test-t5c.sh`
  (`npm run test:t5c`, CT-06..09). Reste (utilisateur) : appliquer la migration +
  dérouler le cahier. **Débloque T5d.**
- **T5b — Mapping de rôle (écran admin)** (2026-07-22) : domaine pur
  `src/domaine/mapping-de-role.ts` (validation R1–R5, 7 tests Vitest), écran
  `/admin/mapping` (`src/app/admin/mapping/`) sur le design system « Nuit »,
  loaders `src/lib/auth/mapping.ts` + Server Action `mapping-actions.ts`
  (`attribuerMapping`, garde admin + upsert via RLS), client `service_role`
  `src/lib/supabase/admin.ts` (lecture comptes/clubs), lien « Administrer les
  rôles » sur l'accueil (admin). Décision : [ADR 0002](decisions/0002-liste-des-comptes-via-cle-service.md).
  Cahier `docs/tests/03-mapping-de-role-t5b.cahier.md`. **Aucune migration**
  (modèle `compte` + policies datent de T5a). Reste (utilisateur) : dérouler le
  cahier. Design system « Nuit » appliqué aussi aux écrans accueil + connexion.
  **Débloque T5c.**
- **T5a — Auth permanente + rôle courant** (2026-07-22) : migration
  `202607221300` (fonctions `role_courant()`/`est_admin()` `SECURITY DEFINER` +
  grants + policies RLS de `compte`), schéma client par défaut = `interclub`, DAL
  `src/lib/auth/session.ts`, Server Actions connexion/déconnexion
  (`src/lib/auth/actions.ts`), écran `/connexion` + accueil reflétant la session,
  seed `supabase/seed/01-utilisateurs-de-test.sql` (3 comptes de test), cahier
  `docs/tests/02-authentification-t5a.cahier.md` et script `scripts/test-t5a.sh`
  (`npm run test:t5a`, 8/8 OK). Validé sur la stack locale. **Débloque T5b, T5c.**
  Reste (utilisateur) : dérouler les cas UI du cahier.
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
