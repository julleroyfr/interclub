---
name: rediger-spec
description: Rédiger ou mettre à jour une spécification fonctionnelle détaillée (la source de vérité) dans docs/specs/. À utiliser avant d'écrire des tests ou du code pour toute règle métier. Produit des règles atomiques, numérotées et testables, tracées jusqu'aux sources (règlement, décisions).
---

# Rédiger une spécification fonctionnelle détaillée

La spec est la **vérité** (`docs/conventions/01-workflow-spec-first-tdd.md`).
Une spec par domaine/fonctionnalité, en **français**, dans `docs/specs/`.

## Avant d'écrire

- Identifier la ou les **sources** : article du règlement
  (`docs/reglement/…`), décision datée, contrainte technique.
- **Se baser sur la DERNIÈRE version du règlement** (PDF le plus récent dans
  `docs/reglement/`). Citer la version en source pour la traçabilité, mais la
  version la plus récente **fait toujours foi** : si le règlement évolue, réviser
  les specs impactées via la règle de changement.
- Vérifier qu'aucune spec existante ne couvre déjà le sujet (sinon, la compléter,
  et appliquer la règle de changement si on modifie un comportement validé).

## Squelette à remplir

```markdown
# Spec : <Nom de la fonctionnalité>

- **Statut** : brouillon | validée | obsolète
- **Sources** : règlement §…, décision du <AAAA-MM-JJ>

## Objectif
Pourquoi cette fonctionnalité existe (valeur métier).

## Vocabulaire
Termes du domaine, alignés avec le règlement (rencontre, division, forfait…).

## Règles fonctionnelles
R1. <règle atomique, sans ambiguïté, testable>
R2. …

## Scénarios
### Nominal
Étant donné … Quand … Alors …
### Cas limites / erreurs
- …

## Contraintes de données
Ce que la base doit garantir (unicité, intégrité, RLS attendue).

## Hors périmètre
Ce que cette spec ne couvre PAS.
```

## Diagrammes : toujours en Mermaid

Tout schéma d'une spec ou d'une doc (dev **ou** utilisateur) s'écrit en **Mermaid**
(bloc ` ```mermaid `), pas en image ni en ASCII. Choisir le type adapté :
`flowchart` (parcours/algorithme), `sequenceDiagram` (auth, realtime, appels
Supabase), `stateDiagram-v2` (cycle de vie d'une entité), `erDiagram` (modèle de
données). Garder le diagramme **synchrone** avec les règles `Rn`.
cf. `docs/conventions/01-workflow-spec-first-tdd.md` §4.

## Critères de qualité d'une règle `Rn`

- **Atomique** : une seule affirmation vérifiable.
- **Testable** : on peut écrire un test (auto ou cas de cahier) qui la prouve.
- **Non ambiguë** : pas de « généralement », « si possible ». Quantifier.
- **Traçable** : rattachée à une source quand elle vient du règlement.
- **Indépendante de l'implémentation** : décrit le _quoi_, pas le _comment_.

## Après rédaction

1. Relire chaque règle : « Comment la prouver ? ». Si impossible → reformuler.
2. Faire **valider** la spec (passer le statut à `validée`).
3. Enchaîner : tests (`cycle-tdd`) puis cahier (`rediger-cahier-de-test`).

## Règle de changement

Si la rédaction révèle qu'une spec **existante et validée** doit changer :
ne pas modifier en silence. Exposer l'écart et **demander** avant
(cf. `docs/conventions/01-workflow-spec-first-tdd.md` §3).
