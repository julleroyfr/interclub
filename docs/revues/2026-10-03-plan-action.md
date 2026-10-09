# Plan d'action — revue globale du 2026-10-03

Plan de traitement des constats de la
[revue globale du 2026-10-03](./2026-10-03-revue-globale.md). Chaque lot suit
le workflow du projet : **spec → tests → code → cahier de test**. Les
migrations sont validées sur la stack locale, puis **appliquées à la main** en
recette (prod à la bascule sur `main`).

Statuts : ✅ fait · 🔄 en cours · ⏳ en attente (à faire) · ❓ décision requise ·
🚫 bloqué (dépendance non levée)

Dernière mise à jour : 2026-10-03.

## Décisions

Ces points relèvent de la **règle de changement** : validation explicite avant
de toucher une spec. **Toutes tranchées le 2026-10-03** par julleroyfr ; chaque
changement de spec suit ensuite l'ordre spec → tests → code.

| # | Question | Décision (2026-10-03) | Constat | Lot | Spec touchée |
| --- | --- | --- | --- | --- | --- |
| D-A | Plafond de 6 voies ado (spec #6 R14) : « règle applicative » ou garantie en base ? | ✅ **Trigger SQL** : la base refuse une 7ᵉ voie par grimpeur et épreuve ado (en plus de la Server Action) | M7 | 4 | #6 (modèle, R14) |
| D-B | Temps de vitesse d'un grimpeur retiré de la composition ? | ✅ **Purger** : retirer un grimpeur supprime ses temps de vitesse de la rencontre (trigger) ; la saisie reste refusée pour un non-engagé (#10 R7) | M3 | 4 | #10 (et #7 si besoin) |
| D-C | `service_role` en lecture transverse ? | ✅ **ADR 0005 + garde dans chaque loader** `service_role` (pas de retour aux lectures RLS) | M8 | 5 | — (ADR) |
| D-D | Session anonyme sans QR : lit-elle clubs, rencontres, résultats ③+ ? | ✅ **Fermer** : helper `est_acteur_identifie()` (compte mappé OU session QR active) dans les policies de lecture | m2 | 6 | #1 (matrice) / #12 à vérifier |
| D-E | Un coach peut-il réactiver un jeton QR révoqué ? | ✅ **Révocation définitive** : pour le coach, une mise à jour ne peut que révoquer (`actif` true → false), ni réactiver ni changer de rencontre ; rétablir = régénérer (R23) | m4 | 6 | aucune (application de #2 R20–R23) |
| D-F | Pages `/design-system` et `/templates/*` publiques ? | ✅ **Exclure de la prod** : `notFound()` hors développement local (invisibles en recette et en prod) | m1 | 6 | #12 (exception de routage) |
| D-G | Écran d'erreur technique (`error.tsx`) ? | ✅ **Oui, écran sobre** : message en français + « Réessayer » + lien vers l'accueil (`error.tsx` + `global-error.tsx`) | M6 | 6 | #12 (nouvelle règle) |

## Ordre des lots

```mermaid
flowchart TD
  L0[Lot 0 — Préparation] --> L1[Lot 1 — Durcissement sécurité en base<br/>C1, M1, M2]
  L0 --> L2[Lot 2 — Erreurs Supabase<br/>M5, M6, m8]
  L0 --> L3[Lot 3 — Transitions de phase<br/>M4]
  L1 --> L4[Lot 4 — Intégrité vitesse & plafond ado<br/>M3, M7]
  DA{{D-A / D-B ✅}} --> L4
  DC{{D-C ✅}} --> L5[Lot 5 — service_role / ADR<br/>M8]
  DDEF{{D-D / D-E / D-F / D-G ✅}} --> L6[Lot 6 — Mineurs<br/>m1–m9]
  L1 --> L7[Lot 7 — Outillage & traçabilité<br/>suggestions]
  L2 --> L6
```

Le lot 1 est prioritaire (faille critique exploitable avec la clé anon).
Les lots 2 et 3 n'ont besoin d'aucune décision et peuvent avancer en parallèle.

## Lot 0 — Préparation

- [x] ✅ Créer la branche `feature/durcissement-securite` depuis `develop`
  (worktree séparé pour permettre du travail en parallèle).
- [x] ✅ Commiter le rapport de revue et ce plan sur `develop` (`14792ec`).
- [ ] ⏳ Trancher les décisions D-A à D-F (au fil de l'eau, sans bloquer les
  lots 1 à 3).

## Lot 1 — Durcissement sécurité en base (C1, M1, M2) — 🔴 prioritaire — 🔄 en cours

Migration `202610031100_durcissement_securite`, branche
`feature/durcissement-securite`. Validée en transaction annulée sur la base
locale le 2026-10-03 (C1, M1, M2, fermeture par défaut).

Aucune spec ne change : on impose en base ce que les specs exigent déjà
(#3 R12, #2 R30–R33, #16 R11/R13, #9 R14).

### C1 — `creer_rencontre_avec_gabarit`

- [x] ✅ Migration : garde `if not interclub.est_admin() then raise exception
  'acces_refuse'` dans la fonction (réécriture `create or replace`).
- [x] ✅ Migration : `revoke execute … from public` puis
  `grant execute … to authenticated`.

### M1 — `finaliser_inscription_coach`

- [x] ✅ Migration : `revoke execute … from public, anon, authenticated`
  (seul `service_role` garde EXECUTE).
- [x] ✅ Migration : `set search_path = ''` et noms de tables qualifiés.

### M2 — Colonnes d'audit et de contrôle

- [x] ✅ Migration : trigger `before insert or update` sur `resultat_voie` et
  `resultat_bloc` — si non admin, `controle_le` / `controle_par` reprennent
  leur ancienne valeur (`null` à l'insertion).
- [x] ✅ Migration : même trigger force `auteur_utilisateur_id = auth.uid()` et
  `auteur_role` au rôle réel, sur `resultat_voie`, `resultat_bloc` et
  `temps_vitesse`.
- [ ] ⏳ Vérifier que les Server Actions admin (contrôle, saisie admin) et coach
  continuent de fonctionner (E2E cahiers 17, 19, 20, 27).

### Fermeture par défaut (suggestion 1)

- [x] ✅ Migration : `alter default privileges for role postgres revoke
  execute on functions from public;` (la variante `in schema` ne peut
  qu'ajouter aux privilèges globaux : inopérante pour révoquer).
- [x] ✅ Inventorier toutes les fonctions `security definer` existantes et
  ré-accorder explicitement EXECUTE au strict nécessaire.

### Validation et livraison

- [ ] ⏳ Valider sur la stack locale (`db reset`, prévenir avant : réinitialise
  la base locale) : appels `curl` avec la clé anon et un compte coach → refus.
- [x] ✅ Rédiger le cahier `28-securite-appels-directs.cahier.md` (suggestion
  2) : RPC en anonyme, PATCH des colonnes d'audit, rôle forgé.
- [ ] ⏳ Faire passer `npm test`, `typecheck`, `lint`, `lint:md` et les E2E
  concernés.
- [x] ✅ Mettre à jour `supabase/migrations/JOURNAL.md`.
- [x] ✅ Contrôle permanent dans `npm run db:verifier` : aucune fonction
  ouverte à PUBLIC, `anon` limité aux 4 RPC des sessions QR.
- [x] ✅ Appliquer la migration **à la main** en recette (SQL Editor) —
  2026-10-03.
- [x] ✅ Automatiser le cahier 28 : `npm run test:cahier:securite`
  (`e2e/securite-appels-directs.spec.ts`, 9 tests, stack locale).
- [ ] ⏳ Dérouler le cahier 28 en recette.

## Lot 2 — Erreurs Supabase avalées (M5, M6, m8) — 🔄 en cours

Aucune spec ne change (convention 02 §7, spec #6 R18). Branche
`feature/erreurs-supabase`. Helper pur `verifierLecture(reponse, quoi)`
(`src/lib/supabase/lecture.ts`, 4 tests Vitest) : une lecture en échec lève
`LectureImpossibleError` au lieu d'être lue comme « aucune donnée ».

### M6 — Loader du classement

- [x] ✅ `src/lib/classement/classement.ts` : les 14 lectures passent par
  `verifierLecture`.
- [ ] ❓ Affichage d'erreur côté écran : **aucun `error.tsx` dans l'app**. Une
  erreur technique affiche la page d'erreur générique de Next (bruyante, mais
  plus jamais un classement faux). Écran d'erreur dédié = nouvel écran, à
  décider (décision D-G).

### M5 — NP automatique de clôture

- [x] ✅ `src/lib/rencontres/cloture.ts` : chaque lecture vérifiée, les deux
  `upsert` lèvent une erreur en cas d'échec.
- [x] ✅ `src/lib/rencontres/actions.ts` : `catch {}` vide retiré ; si le NP
  échoue, la phase reste changée et l'admin reçoit un message d'erreur
  explicite (« repassez en compétition puis en clôture ») au lieu d'un succès.
- [ ] ⏳ Évaluer une RPC transactionnelle « changement de phase + NP »
  (si retenue : migration + cahier). Non fait : le message suffit à ne plus
  masquer l'échec ; à reconsidérer avec le lot 3 (garde de transition).

### Les autres lectures

> Recensement corrigé : `prets.ts`, `clubs.ts`, `rencontres.ts`,
> `tableau-de-bord.ts`, `jetons.ts`, `invitations.ts`, `grimpeurs.ts`,
> `export-classement.ts`, `auth/mapping.ts` et l'essentiel d'`engagement.ts`
> vérifiaient **déjà** leurs erreurs (`if (xxxRes.error) throw`) : la revue les
> avait comptés à tort.

- [x] ✅ `src/lib/coach/resultats-actions.ts` (9 lectures, dont `existantes` du
  plafond ado — M7, partie indépendante de D-A).
- [x] ✅ `src/lib/admin/resultats-actions.ts` (9 lectures).
- [x] ✅ `src/lib/admin/controle.ts` (11 lectures, dont la résolution des
  auteurs) et `controle-actions.ts` (4 lectures ; m8 : `type`, `coche` et
  `resultatId` validés à l'exécution).
- [x] ✅ Reste de `src/lib` : `admin/resultats.ts`, `coach/resultats.ts`,
  `coach/actions.ts`, `coach/engagement.ts` (`clubRes` + noms des clubs
  prêteurs), `rencontres/structure(-actions).ts`, `gabarit/actions.ts`,
  `jetons/actions.ts`, `invitations/actions.ts`, `auth/actions.ts`. Scan final :
  plus aucune lecture `const { data } = await` ni `xxxRes.data` non vérifiée.

### Validation

- [x] ✅ Typecheck, lint, Vitest (330 tests) ; **suite E2E complète** (117 tests,
  chromium) au vert sur le code de la branche.
- [ ] ⏳ Le chemin « NP en échec → message à l'admin » n'est pas couvert par un
  test automatisé (il faut provoquer une panne de lecture) : cas à ajouter au
  cahier 17.

## Lot 3 — Transitions de phase (M4) — ✅ fait (branche `feature/transitions-phase`)

La spec #3 R17 impose déjà les transitions adjacentes : seuls tests et code
changent.

- [x] ✅ Test Vitest rouge `peutTransiter(courante, cible, date, aujourdhui)`
  citant « spec #3 R17 » (avancer, revenir, saut interdit, bornes, phase
  courante) — 6 tests, dont l'**exception** retour ③ → ① hors jour J (spec #1
  R5, `phasePrecedenteEffective`).
- [x] ✅ `peutTransiter` dans `src/domaine/rencontre.ts` (vert).
- [x] ✅ `changerPhaseRencontre` relit **toujours** la phase et la date en base et
  refuse toute transition non adjacente (« La rencontre est en phase « … » :
  ce changement de phase n'est plus possible. Rechargez la page. »). Les deux
  surfaces (liste, tableau de bord) passent par cette action.
- ~~Trigger SQL de garde sur `rencontre.phase`~~ — non retenu : l'écriture de
  phase est réservée à l'admin (RLS) et passe par l'action ; un trigger
  bloquerait aussi les pré-conditions SQL des E2E et du seed.
- [x] ✅ Cahier 12 : CT-17 `[auto]` (écran périmé : ④ en base, « ← Préparation »
  refusé), automatisé (`npm run test:cahier:phase`) ; CT-13 étape 4 (POST direct)
  renvoyée aux tests Vitest de `peutTransiter`. Vérifié par mutation (ancienne
  action ⇒ CT-17 échoue).

## Lot 4 — Intégrité vitesse et plafond ado (M3, M7)

Débloqué : D-A (trigger) et D-B (purge) tranchés le 2026-10-03. — 🔄 en cours,
branche `feature/integrite-vitesse-plafond`, migration
`202610031200_integrite_vitesse_plafond_changement_equipe`.

Révisions de specs **validées le 2026-10-03** : #6 R14 (plafond en base),
spec #10 R7bis/R18/R18bis, et **spec #3 R41d** (nouvelle : changement d'équipe admin, club
d'affectation uniquement — demandé par l'utilisateur pour que le changement
d'équipe conserve le temps de vitesse au lieu de le purger).

### M3 — Temps de vitesse bornés aux grimpeurs engagés

- [x] ✅ Spec #10 révisée (R7bis, R18, R18bis) ; spec #7 inchangée (R20 recalcule
  déjà à la suppression).
- [x] ✅ Migration : trigger « grimpeur engagé » sur `temps_vitesse` (tous les
  écrivains, admin compris — plutôt qu'une condition RLS).
- [x] ✅ Migration : trigger AFTER DELETE sur `composition` qui purge le temps de
  vitesse ; nettoyage des temps orphelins existants.
- [x] ✅ Changement d'équipe (spec #3 R41d) : domaine `verifierChangementEquipe` /
  `equipesCiblesChangement` (9 tests), trigger `verifier_changement_equipe`,
  `grant update(equipe_id)`, action `changerEquipeAdmin`, contrôle dans le
  panneau admin.
- [x] ✅ Cahiers 15 (CT-06/07) et 20 (CT-12/13), automatisés
  (`npm run test:cahier:integrite`).

### M7 — Plafond de 6 voies ado garanti en base

- [x] ✅ Spec #6 révisée (R14, modèle de données, cas limites).
- [x] ✅ Migration : trigger plafond (correction de la même voie permise,
  insertions sérialisées) ; refus traduit par le message du domaine.
- [x] ✅ `src/lib/coach/resultats-actions.ts` : `error` vérifiée sur
  `existantes` (fait au lot 2).
- [x] ✅ Cahier 17 CT-16 (7ᵉ voie par écriture directe → refus), automatisé.

### Livraison

- [x] ✅ Validation locale (transaction annulée, application + rejeu,
  `db:verifier`, Vitest 339, E2E complète 124 + mutation), `JOURNAL.md`.
- [x] ✅ Application manuelle en recette — 2026-10-03.
- [ ] ⏳ Déroulage des cahiers 15 (CT-06/07), 17 (CT-16), 20 (CT-12/13) en recette.

## Lot 5 — `service_role` et ADR (M8) — ✅ fait (branche `feature/adr-service-role`)

Débloqué : D-C tranché le 2026-10-03 (option a).

- [x] ✅ ADR [`0005-lecture-transverse-service-role`](../decisions/0005-lecture-transverse-service-role.md)
  (lecture transverse acceptée, garde par loader, exceptions justifiées) ;
  ADR 0002 renvoie vers lui.
- [x] ✅ Gardes de lecture `src/lib/auth/garde-lecture.ts` (`exigerLectureAdmin`,
  `exigerLectureAdminOuCoach`, `exigerLectureCoachDuClub`) en tête des **12**
  loaders ; exceptions : `resoudreInvitation`, `inscrireCoach` (secret
  d'invitation), `exportDisponible` / `reponseExportPdf` (demandeur, spec #15).
- [x] ✅ Test d'architecture `src/lib/supabase/garde-service-role.test.ts` (rouge
  sur les 12 loaders avant la correction) — il a aussi repéré une garde mal
  placée pendant l'implémentation.
- ~~Option (b) : retour aux lectures RLS~~ — écartée (D-C).
- [x] ✅ Commentaire de `src/lib/supabase/admin.ts` mis à jour ; grille de l'agent
  `revue-code-architecture` complétée (gardes ADR 0005, `grant execute`).
- [x] ✅ Vitest (348) et E2E complète (130) au vert : aucun parcours légitime
  bloqué.

## Lot 6 — Mineurs (m1–m9)

- [x] ✅ m1 / D-F — spec #12 R24 (validée le 2026-10-03) ; garde
  `exigerDeveloppementLocal()` dans les layouts `/design-system` et
  `/templates/nuit` (`src/lib/maquettes.ts`, 3 tests) ; cahier 23 CT-13
  (manuel en recette ; vérifié sur build de production local).
- [x] ✅ m2 / D-D — spec #1 « acteur identifié » + R8 (validée le 2026-10-03) ;
  migration `202610031400_lecture_acteur_identifie` ; cahier 28 CT-10
  automatisé ; scripts `test-resultats` / `test-t6` adaptés (23/23 chacun).
  Appliquée en recette le 2026-10-03.
- [x] ✅ m3 — Redirection ouverte : `cheminDeRetour` (`src/lib/chemin-retour.ts`,
  6 tests) n'accepte qu'un chemin interne (pas `//`, `/\`, schéma ni URL).
- [x] ✅ m4 / D-E — migration `202610031300_jeton_qr_revocation_definitive` :
  update limité à `actif`, réactivation interdite à un non-admin ; cahier 04
  CT-11 automatisé (`npm run test:cahier:securite`). Appliquée en recette le
  2026-10-03.
- [x] ✅ D-G — spec #12 R25 (validée le 2026-10-03) ; composant `EcranErreur`
  (3 tests de composant), `app/error.tsx` (`unstable_retry`, Next 16) et
  `app/global-error.tsx` ; cahier 23 CT-14 automatisé
  (`npm run test:cahier:erreur`, panne simulée ; mutation vérifiée).
- [x] ✅ m5 — `/scan` : spec #2 R34 et spec #12 R9 (validées le 2026-10-09). Un
  compte permanent connecté garde sa session ; choix « Aller à mon espace » ou
  « Me déconnecter et ouvrir la session QR » (déconnexion locale à l'appareil).
  `decisionScan` (domaine, 4 tests) ; cahier 23 CT-15 automatisé.
- [x] ✅ m6 — `messageEchecCreationCompte` (domaine, 4 tests) : seul un e-mail
  déjà utilisé donne le message R32 (spec #2).
- [x] ✅ m7 — `src/lib/resultats/contexte-saisie.ts` (contextes voie/bloc,
  voies ado déjà saisies) ; garde locale renommée `verifierAdminSaisie`.
- [x] ✅ m8 — Traité dans le lot 2.
- [x] ✅ m9 — Avertissement de lint corrigé (lint à 0).

## Lot 7 — Outillage et traçabilité (suggestions)

- [ ] ⏳ Suggestion 1 — traitée dans le lot 1.
- [ ] ⏳ Suggestion 2 — cahier 28, lot 1.
- [x] ✅ Suggestion 3 — 66 `describe` de `src/domaine/` préfixés
  « spec #N — » (attribution vérifiée une à une : `rencontre.test.ts` relève de
  la spec #1, le barème R47/R48 de la spec #3).
- [x] ✅ Suggestion 4 — décision du 2026-10-03 : **script psql** (sans nouvel
  outil ni convention à changer). `scripts/test-points-vitesse.sh`
  (`npm run test:points-vitesse`) : 20 cas spec #7 R15–R20 (rang par sexe, ex
  æquo et saut de rang, barème par échelons, chute / non-présentation /
  absence, recalcul au fil des écritures) sur un jeu d'essai dédié, en
  transaction annulée. Vérifié par mutation (`dense_rank` ⇒ 6 KO). Le plafond
  ado et la purge au retrait sont déjà couverts (cahiers 17 CT-16, 20 CT-13).
- [x] ✅ `scripts/test-t5a.sh` CT-06 : comparé au nombre réel de comptes (8/8).
- [ ] ⏳ Relancer l'agent `revue-code-architecture` après les lots 1 à 4 pour
  vérifier la fermeture des constats.
