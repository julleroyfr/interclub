# Analyse des traitements côté base — 2026-11-10

- **Périmètre** : toutes les Server Actions (`src/lib/**/*actions*.ts`,
  `src/lib/rencontres/cloture.ts`), tous les loaders, pages et route handlers,
  ainsi que les triggers, contraintes et policies de `supabase/migrations/`.
  Branche `develop`, commit `8c35d2c`.
- **Question** : qu'est-ce qui peut être confié à la base (agrégat, filtre,
  jointure, garde, transaction) au lieu d'être enchaîné ou calculé en
  TypeScript ?
- **Suite de** : [l'analyse du 2026-10-09](./2026-10-09-analyse-appels-supabase.md).
  Le suivi se fait dans [le plan d'action](./2026-10-09-plan-action-appels-supabase.md),
  lots 5 à 12.

## Décisions (2026-11-10)

- **Gardes** : on **conserve** les contrôles TypeScript, qui donnent des
  messages clairs. On **ajoute en base** les gardes qui n'y sont pas encore, pour
  que la base reste la frontière (appel forgé, course entre deux clics). Une
  lecture TS n'est pas supprimée au seul motif qu'elle double une contrainte.
- **Classement** : le calcul reste en TypeScript (`src/domaine/score.ts`, testé
  en Vitest). On réduit le nombre de requêtes et les relectures, pas le calcul.

## Synthèse

Les volumes réels sont faibles. Une rencontre compte environ 100 grimpeurs,
15 équipes et 8 clubs (specs #7 et #15), soit environ 1000 lignes lues par
classement. Les tests de volume (1100 lignes et plus) sont un pire cas, et
aucun calcul n'a besoin de passer en SQL pour des raisons de volume.

`score.ts` ne contient que des agrégats simples (barème, sommes, `rank()`).
Les règles vraiment métier sont déjà en SQL (barème de vitesse) ou spécifiques
à l'affichage (libellés, collation française).

Le coût du jour J vient de l'**amplification par le temps réel**. Un temps de
vitesse saisi réécrit toute la table `points_vitesse` de l'épreuve, et chaque
écran abonné relance un loader d'environ 11 requêtes. Une coche de contrôle
relance tous les classements alors que le score ne change pas.

Côté écritures, plusieurs actions font en TypeScript seulement des contrôles
que la base ne fait pas : phase de la structure, phase de la saisie admin,
phase ④ de la coche, plafond de 8, règles des prêts, licence générée. Un appel
forgé ou deux clics simultanés les contournent.

## Lectures

| Où | Loader / écran | Vagues | Volume lu | Constat | Piste côté base |
| --- | --- | --- | --- | --- | --- |
| `src/lib/classement/classement.ts:166` | classement (admin, coach, capitaine, affichage, PDF) | 1 (11 requêtes) | ≈ 1000 lignes | 6 requêtes sur 11 pour la structure | L1 : lecture imbriquée de la structure (11 → 6) |
| pages `…/classement`, `capitaine/classement` | `TempsReel` sur les résultats | relance à chaque évènement | ≈ 1000 × écrans × évènements | ni `grimpeursAffiches`, ni filtre de la coche | R2, R3 |
| trigger `recalculer_points_vitesse` | saisie juge | — | ~100 lignes réécrites par temps | `on conflict do update` sans condition | R1 |
| `src/lib/export/export-classement.ts:47` | `exportDisponible` | +3 requêtes par rechargement | ≈ 100 compositions | relu en ③/④ pour un export possible en ⑤ seulement | R5 |
| `src/lib/coach/resultats.ts:255` | saisie coach (`chargerSaisie`) | 1 (11 requêtes) | ≈ 1000 lignes, ~85 % jetées | toute la rencontre est lue pour un club | L2 |
| `src/lib/coach/resultats.ts:148` | saisie capitaine | 1 | toute la rencontre | filtre de l'équipe en JS | L2 |
| `src/lib/admin/controle.ts:91` | contrôle | 2 | ≈ 700 lignes, toutes affichées | lecture justifiée ; 2 relectures par coche | R4 |
| `src/lib/rencontres/cloture.ts:76` | NP de clôture | 4 | non paginé | troncature possible ; `resultat_bloc` non filtré par rencontre | B2 (lot 5) |
| `src/lib/jetons/jetons.ts:92` | jetons coach | 1 + N | toutes saisons | N+1 (P8) | L4 |
| `src/lib/jetons/jetons.ts:74` | jetons admin | 2 | toutes saisons | lecture en série (P10) | L4 |
| `src/lib/gabarit/gabarit.ts:77` | gabarit | 3 par catégorie | faible | P9 | L4 |
| `src/lib/admin/resultats.ts:52` | saisie admin | 2 | faible | noms des clubs à part (P11) | L4 |
| `src/lib/grimpeurs/eligibles.ts:34` | grimpeurs éligibles | 1 (paginée) | catalogue de la tranche | fusion des surclassés en JS | gain faible |

## Server Actions

Vagues comptées hors vague 0 (`compte` ou `getContexteCoach`) et hors re-rendu.

| Où | Action | Vagues | Constat | Piste côté base |
| --- | --- | --- | --- | --- |
| `admin/controle-actions.ts:25` | `basculerControle` | 2 | phase ④ gardée en TS seulement | E1 |
| `admin/resultats-actions.ts:68`, `:127`, `:184` | saisie admin voie, bloc, retrait | 2–3 | phase ③/④ gardée en TS seulement | E2 |
| `rencontres/structure-actions.ts:111`, `:147`, `:287`, `:320`, `:785` | ajout d'épreuve, voie, bloc, voie de vitesse, palier | 3 | phase ①/② en TS seulement ; `epreuveId` non vérifié contre la rencontre ; ordre lu puis écrit | E3 |
| `rencontres/structure-actions.ts` (modifications et suppressions) | repère, libellé, voie, palier… | 2 | phase en TS seulement (policies `*_all_admin` sans phase) | E3 |
| `gabarit/actions.ts:47`, `:180`, `:242`, `:310` | ajouts au gabarit | 2 | **bogue** `.single()` sur un parent vide | B1, E3 |
| `admin/engagement-actions.ts:91`, `:230`, `coach/actions.ts:279` | engager, changer d'équipe | 2 | plafond de 8 (enfant, ado) en TS seulement | E4 |
| `prets/prets-actions.ts:15` | `creerPretAction` | 2 | « déjà engagé » et « autre club » en TS seulement ; route revalidée inexistante | E4, B4 |
| `grimpeurs/actions.ts:122` | `modifierGrimpeur` | 2 | licence générée conservable en TS seulement | E5 |
| `rencontres/actions.ts:124` + `cloture.ts` | `changerPhaseRencontre` ③ → ④ | ≤ 9 | transition non conditionnée à la phase lue ; R17 et jour J en TS ; lectures non paginées | B2 (lot 5) |
| `rencontres/structure-actions.ts:405`, `gabarit/actions.ts:407` | barèmes de vitesse | 3–4 | update + delete + insert non atomiques | E6 (A1, A2) |
| `jetons/actions.ts:112` | `regenererJeton` | 4 | relecture du jeton + écritures non atomiques | E6 (P15, A3) |
| `invitations/actions.ts:133`, `:157`, `actions-admin.ts:33` | invitations | 2–3 | lecture inutile ; écritures non atomiques | E6 (A4, A5) |
| plusieurs (voir B3) | — | — | `{data}` lu sans `verifierLecture` | B3 |
| saisies coach et juge, imports, CRUD clubs, mapping | — | 1 | RPC ou écriture unique | ✔ modèle |

## Constats

Gravité : 🔴 justesse ou bogue · 🟠 latence le jour J · 🟡 latence hors jour J ·
⚪ atomicité ou garde manquante.

### Justesse et bogues

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| B1 | 🔴 | Ajout au gabarit : le dernier `ordre` est lu avec `.single()`. Sur une épreuve ou un bloc vide, la réponse est PGRST116 et `verifierLecture` lève une erreur : le premier élément ne peut pas être ajouté | `src/lib/gabarit/actions.ts:88` (et bloc, palier, voie de vitesse) |
| B2 | 🔴 | Clôture : compositions et `resultat_voie` non paginés ; `resultat_bloc` non filtré par rencontre ; transition sans `.eq('phase', courante)` (deux admins peuvent la passer) ; catégorie relue | `src/lib/rencontres/cloture.ts`, `src/lib/rencontres/actions.ts:124` |
| B3 | 🟠 | `{data}` lu sans `verifierLecture` (convention 02 §7) : une lecture en échec y passe pour « introuvable » | `ajouterGrimpeurAdmin`, `ajouterGrimpeurEquipeAdulte`, `creerPretAction`, `accorderSurclassement`, `revoquerSurclassement`, `modifierGrimpeur`, `importerGrimpeursCsv` |
| B4 | 🟡 | J5 confirmé : `revalidatePath('/admin/prets')` vise une route inexistante | `src/lib/prets/prets-actions.ts` |

### Amplification temps réel

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| R1 | 🟠 | Le recalcul des points de vitesse réécrit toutes les lignes de l'épreuve (~100 évènements par temps saisi). Chaque évènement relance les écrans de saisie et les classements abonnés à `points_vitesse` | trigger `recalculer_points_vitesse` |
| R2 | 🟠 | En ④, chaque coche de contrôle (UPDATE `controle_le`) relance tous les classements alors que le score ne change pas | `TempsReel` sur `resultat_voie` / `resultat_bloc` |
| R3 | 🟠 | Les écrans de classement ne passent pas `grimpeursAffiches` : les écritures des autres rencontres en cours les relancent aussi | pages `…/classement`, `capitaine/classement` |
| R4 | 🟠 | Contrôle : pas d'`ignorerMesEcritures`, en plus du `revalidatePath` de l'action, d'où 2 relectures complètes par coche. Touche la spec #11 R6bis | `src/app/admin/rencontres/[id]/controle/page.tsx` |
| R5 | 🟡 | `exportDisponible` (3 requêtes) est relu à chaque rechargement, alors que l'export n'est possible qu'en ⑤ | `src/lib/export/export-classement.ts` |

### Lectures

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| L1 | 🟠 | Structure du classement et de la saisie en 6 requêtes séparées : une seule lecture imbriquée suffit (11 → 6) | `classement.ts`, `coach/resultats.ts` |
| L2 | 🟠 | Saisie coach et capitaine : toute la rencontre est lue puis filtrée en JS | `src/lib/coach/resultats.ts` |
| L3 | 🟡 | Sans `rencontre_id` sur `resultat_voie` / `resultat_bloc`, chaque lecture passe par une jointure, et le temps réel ne peut pas être filtré par rencontre | schéma |
| L4 | 🟡 | P8–P11 de l'analyse du 2026-10-09, inchangés | lot 6 |

### Gardes et écritures

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| E1 | ⚪ | Phase ④ de la coche gardée en TS seulement : la RLS laisse passer l'admin | `basculerControle` |
| E2 | ⚪ | Phase ③/④ de la saisie admin gardée en TS seulement | `admin/resultats-actions.ts` |
| E3 | ⚪ | Phase ①/② de la structure gardée en TS seulement ; `epreuveId` non vérifié ; ordre ou numéro lu puis écrit (course) | `structure-actions.ts`, `gabarit/actions.ts` |
| E4 | ⚪ | Plafond de 8 (enfant, ado) et règles des prêts gardés en TS seulement | engagement, prêts |
| E5 | ⚪ | Licence générée conservable gardée en TS seulement | `modifierGrimpeur` |
| E6 | ⚪ | A1–A5 et P15 inchangés ; `revoquerInvitation` fait une lecture inutile | lot 7 |

## Écarts avec l'analyse du 2026-10-09

- **P3 et P6 corrigés** (lots 2 et 3). La garde de phase de la coche reste en TS
  seulement (E1).
- **P7 / J3 aggravés** par trois constats nouveaux (B2).
- **P13 élargi** : le même schéma « phase → ordre → insert » touche l'épreuve,
  la voie de vitesse et le palier (E3).
- **P14** : la lecture des paliers fait doublon avec le trigger
  `valider_resultat_bloc` et le CHECK. Selon la décision « TS conservé », on la
  garde ; la RPC admin (E2) la rendra inutile.
- **P15, A1–A5 et J5 inchangés.**
