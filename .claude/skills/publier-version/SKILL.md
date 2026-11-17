---
name: publier-version
description: Publier une version de l'application (mise en production develop → main ou hotfix) selon docs/conventions/10-versionnement.md — choix de l'incrément SemVer (majeur/mineur/correctif), vérification des préalables (recette, cahiers, migrations prod), fusion dans main, brouillon puis réécriture du CHANGELOG, commit et tag vX.Y.Z, push sur accord, retour de main dans develop, régénération des PDF des guides. À utiliser dès qu'on parle de mise en prod, de release, de nouvelle version, de tag ou de CHANGELOG.
---

# Publier une version

Référence : [`docs/conventions/10-versionnement.md`](../../../docs/conventions/10-versionnement.md).
En cas d'écart entre ce skill et la convention, **la convention fait foi**.

**Rappel** : un push sur `main` = **mise en production** (Vercel).
On ne pousse **jamais** sans accord explicite de l'utilisateur, donné pour
cette version.

## Étape 1 — Préalables (bloquants)

Vérifier et présenter le résultat à l'utilisateur avant d'aller plus loin :

1. Arbre de travail propre (`git status`), `develop` à jour avec `origin/develop`.
2. Contenu à publier : `git log --oneline main..develop` (ou la branche
   `hotfix/*`). S'il est vide, il n'y a rien à publier : s'arrêter.
3. **Recette validée** : les cahiers de test concernés ont été déroulés en
   recette (cf. mémoire et `docs/tests/`). Sinon, le signaler et demander si
   l'on continue.
4. **Migrations** : lister les migrations ajoutées depuis le dernier tag
   (`git diff --name-only --diff-filter=A <dernier tag>..develop -- supabase/migrations`)
   et vérifier dans `supabase/migrations/JOURNAL.md` qu'elles sont **appliquées
   en prod**. Sinon, **bloquer** : le code ne part pas en prod avant son schéma
   (convention 03 §5). L'application en prod se fait à la main par l'utilisateur.
5. Garde-fous habituels : `npm run lint`, `npm run typecheck`, `npm run test`,
   `npm run lint:md` passent (le hook `pre-push` les rejoue de toute façon).

## Étape 2 — Choisir l'incrément

Proposer un incrément, justifié par les commits (convention 10 §2) :

| Incrément | Quand |
|-----------|-------|
| `majeur` | Rupture pour les utilisateurs (nouvelle saison/règlement, rôle supprimé, migration non rétrocompatible) — et la toute première version `1.0.0` depuis `0.1.0` |
| `mineur` | Au moins une nouvelle fonctionnalité / évolution de spec (`feat`) |
| `correctif` | Uniquement des corrections (`fix`) sans changement de spec |

Plusieurs types mélangés → l'incrément le plus fort. Faire confirmer le choix.

## Étape 3 — Fusionner dans main et préparer

```bash
git checkout main
git pull
git merge --no-ff develop          # ou la branche hotfix/*
npm run version:preparer -- <majeur|mineur|correctif>
```

Le script incrémente `package.json` + `package-lock.json` et insère en tête de
`CHANGELOG.md` un **brouillon** (commits `feat` → Ajouté, `fix` → Corrigé,
migrations ajoutées → Migrations à appliquer). Il refuse de tourner hors de
`main` ou sur un arbre non propre.

## Étape 4 — Réécrire le CHANGELOG

Le brouillon n'est qu'une base. Réécrire la section de la version :

- **Langage utilisateur** : ce que l'on voit ou peut faire, pas le code.
  S'appuyer sur les specs (`docs/specs/`) et les guides (`docs/guides/`).
- **Regrouper** les commits d'une même fonctionnalité en une seule entrée.
- **Tracer** chaque entrée vers sa spec et ses règles : « (spec #3 R51–R55) ».
- Sections : Ajouté, Modifié, Corrigé, Supprimé, Migrations à appliquer ;
  omettre les sections vides. Un `feat` qui modifie un comportement existant va
  dans **Modifié**.
- Retirer ce qui n'a pas d'effet visible (refactor, docs internes, outillage).
- Garder la ligne de migration telle quelle (nom de fichier + renvoi au JOURNAL).

Montrer la section réécrite à l'utilisateur et la faire valider. Puis
`npm run lint:md`.

## Étape 5 — Commit et tag

```bash
npm run version:taguer
```

Commit `chore(release): vX.Y.Z` (package.json, lock, CHANGELOG) + tag annoté
`vX.Y.Z` sur `main`. Rien n'est poussé.

## Étape 6 — Mise en production (sur accord)

Demander explicitement : « Je pousse vX.Y.Z sur main (mise en production) ? ».
Sur accord :

```bash
git push origin main --follow-tags
git checkout develop
git merge main                     # develop repart de la nouvelle version
git push origin develop
```

## Étape 7 — Après la mise en production

1. Vérifier sur la prod que la page affiche la bonne version dans le code
   source : `<meta name="version" content="X.Y.Z+<commit>">` (convention 10 §5).
   Le demander à l'utilisateur si l'on n'a pas accès à la prod.
2. Régénérer les PDF des guides (`npm run doc:pdf`) : ils affichent la version
   de `package.json`. Ils sont ignorés par git, à rediffuser à part.
3. Mettre à jour la mémoire projet (version publiée, date).

## Variante — hotfix

Correctif urgent en prod : branche `hotfix/<description>` partie de `main`,
correction (spec → tests → code si une règle change), puis étapes 1 à 7 en
fusionnant la branche `hotfix/*` dans `main` à l'étape 3, avec l'incrément
`correctif`. L'étape 6 ramène le correctif dans `develop`.

## Compte rendu

Indiquer : version publiée et incrément choisi (avec la raison), préalables
vérifiés (recette, migrations prod), section du CHANGELOG finale, tag posé,
push effectué ou en attente d'accord, PDF régénérés ou non.
