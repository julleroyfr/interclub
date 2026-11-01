---
name: mettre-a-jour-guides
description: Mettre à jour les guides utilisateur (docs/guides/ — admin, coach, juge, capitaine) après un changement visible par un utilisateur — écran, champ, libellé, message, règle métier perceptible. À utiliser en fin de fonctionnalité (étape 5bis de nouvelle-fonctionnalite) ou à la demande. Détermine les guides et sections touchés, réécrit le texte en langage utilisateur, décide si les captures numérotées doivent être refaites, puis régénère les PDF et valide le Markdown.
---

# Mettre à jour les guides utilisateur

Les guides sont la documentation **destinée aux utilisateurs** (pas à l'équipe) :
ils décrivent ce que l'on voit et ce que l'on fait, jamais le code.

| Guide | Public | Format des captures |
|-------|--------|---------------------|
| `docs/guides/admin/guide-admin.md` | organisateurs / admins | ordinateur |
| `docs/guides/coach/guide-coach.md` | coachs (permanents et temporaires) | téléphone |
| `docs/guides/juge/guide-juge.md` | juges (vitesse, QR) | ordinateur |
| `docs/guides/capitaine/guide-capitaine.md` | capitaines d'équipe adulte (QR) | téléphone |

Scripts de captures : `scripts/captures/guide-<rôle>.captures.ts` (outils
partagés : `scripts/captures/outils.ts`). PDF : `scripts/guides/generer-pdf.mjs`.

## Étape 1 — Identifier ce qui change pour l'utilisateur

1. Partir du diff (`git diff develop...HEAD` ou modifications en cours) et de la
   spec modifiée : lister les **changements perceptibles** (écran, champ,
   libellé, bouton, message de succès/erreur, comportement, droits d'accès).
   Un changement purement technique (refactor, migration sans effet visible,
   perf) **ne touche pas** les guides : le dire et s'arrêter.
2. Pour chaque changement, trouver le **rôle** qui le voit (route
   `src/app/admin/**` → admin ; `coach/**` → coach ; juge, capitaine…) puis la
   **section** du guide : `Grep` sur le nom de l'écran, du bouton ou du libellé
   dans `docs/guides/`. Penser aussi aux **Questions fréquentes** en fin de
   guide et aux mentions croisées dans les autres guides.

## Étape 2 — Réécrire le texte

- **Langage utilisateur** : vouvoiement/impératif comme le reste du guide,
  phrases courtes, libellés d'écran **exacts** en gras (copier le texte de
  l'IHM, ex. **Ajouter le grimpeur**).
- **Jamais** de référence interne : pas de `Rn`, pas de « spec #… », pas de nom
  de table, de fonction, de RPC ni de migration.
- Corriger **toute** affirmation devenue fausse (ex. « obligatoire » devenu
  « facultatif »), pas seulement ajouter un paragraphe.
- Une nouvelle situation courante ou source de confusion → une entrée en
  **Questions fréquentes** (question en gras, réponse en 1–3 phrases).
- Nouvelle section → mettre à jour le **Sommaire** (ancres GitHub).

## Étape 3 — Captures : à refaire ou non ?

Une capture est à refaire **seulement si** l'élément modifié est **visible sur
la capture** telle qu'elle est prise (formulaire replié, onglet non affiché ou
écran non photographié → pas de capture à refaire). Lire le scénario du
`*.captures.ts` pour le savoir.

Si oui :

1. Ajuster le scénario (`numeroter(page, [...])` : l'ordre des cibles donne les
   numéros 1, 2, …) et, si besoin, ajouter un `test(...)` / `capturer(...)`.
2. Aligner le tableau **« N° »** du guide sur les repères (même ordre, même
   nombre) et la balise `<img src="captures/…png" alt="…">`.
3. Pré-requis : stack Supabase locale **au seed** (`npm run db:reset`) ; puis
   `npm run doc:captures` (démarre l'app sur le port 3011 si besoin). Les PNG
   de `docs/guides/<rôle>/captures/` sont réécrits.
4. **Regarder** les PNG produits (outil Read) : repères bien placés, pas de
   donnée parasite, rien de tronqué.

Le seed est lourd : si aucune capture n'est à refaire, ne pas lancer
`db:reset`.

## Étape 4 — PDF et contrôle

1. `npm run doc:pdf` (ou `node scripts/guides/generer-pdf.mjs <guide.md>` pour
   un seul guide). Les PDF sont **ignorés par git** et diffusés à part : le
   signaler dans le compte rendu.
2. `npm run lint:md` doit passer.

## Compte rendu

Indiquer : guides et sections modifiés (avec ce qui a changé), captures
refaites ou non (et pourquoi), PDF régénérés, résultat de `lint:md`.
