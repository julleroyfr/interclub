---
name: nouvelle-fonctionnalite
description: Piloter une nouvelle fonctionnalité ou évolution de bout en bout en spec-first / TDD. À utiliser dès qu'on ajoute ou modifie un comportement métier (règle du règlement, écran, accès données). Enchaîne spec → tests → code → cahier de test, dans cet ordre, et impose de DEMANDER avant tout changement impactant une spec existante.
---

# Nouvelle fonctionnalité (spec-first / TDD)

Conventions de référence : `docs/conventions/`. La spécification est la vérité.
Ordre non négociable : **spec → tests → implémentation**.

## Étape 0 — Cadrer et détecter l'impact

1. Reformuler le besoin en une phrase.
2. Chercher une spec existante dans `docs/specs/` couvrant ce comportement.
3. **Si le besoin modifie un comportement déjà spécifié → STOP.** Appliquer la
   règle de changement (`docs/conventions/01-workflow-spec-first-tdd.md` §3) :
   exposer la règle actuelle, le changement, les impacts, puis **demander
   validation** avant de toucher quoi que ce soit.

## Étape 1 — Spec

- Rédiger ou compléter la spec avec le skill `rediger-spec`.
- Chaque règle est atomique, testable, numérotée `Rn`.
- Faire **valider la spec** (statut `validée`) avant d'écrire des tests.

## Étape 2 — Tests (RED)

- Traduire chaque règle testable-sans-Supabase en test **Vitest** à côté du code
  (`src/domaine/…`). Citer la règle : `it("… (R3)")`.
- Isoler le métier dans `src/domaine/` (fonctions pures) pour ne pas dépendre de
  Supabase.
- Lancer les tests : ils doivent **échouer** (comportement pas encore codé).

## Étape 3 — Implémentation (GREEN)

- Écrire le **minimum** pour faire passer les tests.
- ⚠️ Cette version de Next a des breaking changes : **lire
  `node_modules/next/dist/docs/` avant d'écrire du code Next.**
- Schéma modifié ? Écrire une migration SQL versionnée (`supabase/migrations/`)
  puis **l'appliquer à la main** (pas de CLI/Docker ici) et la consigner.
  cf. `docs/conventions/03-base-de-donnees-supabase.md` §5.

## Étape 4 — Refactor

- Nettoyer sans changer le comportement. Tests toujours verts.

## Étape 5 — Cahier de test (manuel)

- Ce qui touche base réelle / auth / RLS / realtime n'est pas automatisable ici :
  générer/mettre à jour le cahier avec le skill `rediger-cahier-de-test`.
- Dérouler les cas concernés et tracer l'exécution.

## Étape 6 — Definition of Done

Vérifier la checklist de `docs/conventions/01-workflow-spec-first-tdd.md` §6
avant de considérer la fonctionnalité terminée. Committer/pousser seulement si
l'utilisateur le demande (push = déploiement Netlify).
