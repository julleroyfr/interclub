# Cahier de test : Affichage écran secondaire — classement mixte en boucle (spec #14)

> Couvre l'écran de **diffusion** `/admin/rencontres/[id]/affichage`, pensé pour
> un **second afficheur** (TV/vidéoprojecteur) pendant la compétition : liste
> **mixte** (Filles + Garçons mélangés), triée par **rang** puis **nom** puis
> **prénom** (R4/R5), étiquette **F/H** par ligne (R6), **défilement automatique**
> qui **recharge les données en boucle** (R9/R10), **sans abonnement temps réel**
> (R11) ni interaction (R8/R12), réservé à l'**admin authentifié** (R1), visible
> dès la ③ (R2). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/14-affichage-ecran-secondaire.md` (R1–R12) ;
  `docs/specs/07-classement.md` (source du calcul, R8b) ;
  `docs/specs/01-roles-et-autorisations.md` (R11–R13, garde admin).
- **Le tri/fusion pur est couvert par Vitest** (`src/domaine/affichageEcran.test.ts`,
  9 tests, R4–R6). Ce cahier vérifie le **rendu réel** (garde admin, gating de
  phase, IHM du défilement, absence de mise à jour immédiate) — non automatisable
  sans navigateur/Supabase.
- **Pré-requis** :
  - Migrations appliquées jusqu'à `202609221600_points_vitesse_trigger` incluse
    (mêmes prérequis que le cahier **18-classement**, dont cet écran réutilise le
    loader sans le modifier). En local : `supabase db reset`.
  - `SUPABASE_SERVICE_ROLE_KEY` renseignée (assemblage cross-club, ADR 0002/0003).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Réutilise le seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-RENCONTRE-ENFANT** (`33333333-…-3333`, phase `competition`).
- **JD-EQUIPE-A1** (Club A) = **JD-ANA-M2** (Ana **Alpha**, F, M2·M3·M4) +
  **JD-BOB-T1** (Bob **Alpha**, H, T1·T2·T3).
- **JD-EQUIPE-B1** (Club B) = **JD-CLEO-T2** (Cléo **Bravo**, F, T2·T3·T4).

> Les grimpeurs de club A partagent le **nom** de famille de test « Alpha », ceux
> du club B « Bravo » — pratique pour vérifier le **départage par nom** (R5) de
> façon déterministe : « Alpha » précède toujours « Bravo ».

**Saisies à faire en pré-condition** (écran de saisie, spec #6) pour obtenir une
liste mixte à rangs comparables :

| Grimpeur | Sexe | Résultats à saisir | Score attendu |
| -------- | ---- | ------------------- | -------------- |
| Bob (Alpha) | H | T1 = Top, B1 = 1er essai | **9 pts** (voie 5 + bloc 4) |
| Cléo (Bravo) | F | T2 = Top, B2 = 1er essai | **12 pts** (voie 6 + bloc 6) |
| Ana (Alpha) | F | M2 = Top, B1 = 1er essai | **9 pts** (voie 2 + bloc 4) |

Avec ces valeurs : classement **Filles** = 1. Cléo (12), 2. Ana (9) ; classement
**Garçons** = 1. Bob (9) — Bob seul, donc rang 1 par défaut.

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| JD-ADMIN (`admin@test.local`) | admin | Seul rôle habilité à ouvrir l'écran d'affichage ; change la phase pour les cas limites |
| JD-COACH-A (`coach@test.local`) | coach permanent Club A | Négatif d'accès (R1) ; saisit les résultats de pré-condition |
| JD-SANSMAP (`sansmapping@test.local`) | authentifié sans rôle | Négatif d'accès (R1) |

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R1)

- **Rôle** : admin.
- **Étapes** :
  1. Connecté admin, ouvrir `/admin/rencontres/33333333-…-3333`.
  2. Repérer le lien **« 📺 Écran d'affichage (second écran) → »** (visible dès la
     ③, à côté du lien classement).
  3. Le suivre → `/admin/rencontres/33333333-…-3333/affichage`.
- **Résultat attendu** : la page s'affiche en **plein écran** (pas de barre de
  navigation admin), sans erreur.
- **RLS / sécurité** :
  - (négatif) Avec **JD-COACH-A** (session coach), ouvrir directement l'URL
    `/admin/rencontres/33333333-…-3333/affichage` → **404**.
  - (négatif) Avec **JD-SANSMAP** (authentifié, aucun rôle) → **404**.
  - (négatif) Sans session (déconnecté) → **404** (ou redirection connexion selon
    la garde commune `/admin/**`).

### CT-02 — État d'attente avant la ③ (couvre R2)

- **Rôle** : admin.
- **Pré-condition** : faire repasser **JD-RENCONTRE-ENFANT** en **① pré-compétition**
  (`/admin/rencontres/[id]`).
- **Étapes** :
  1. Ouvrir directement `/admin/rencontres/33333333-…-3333/affichage`.
- **Résultat attendu** : aucune liste, aucun défilement ; un message d'attente
  (« Le classement s'affichera dès le début de la compétition ») est affiché.
- **Nettoyage** : remettre la rencontre en **③ compétition** avant la suite.

### CT-03 — Liste mixte, sans séparation par sexe (couvre R3, R4)

- **Pré-condition** : saisir les résultats du tableau ci-dessus pour Ana, Bob et
  Cléo (rencontre en ③).
- **Étapes** :
  1. Ouvrir l'écran d'affichage.
  2. Observer la liste.
- **Résultat attendu** : **une seule liste**, sans onglet ni bascule Filles/
  Garçons ; Ana, Bob et Cléo y figurent tous les trois **mélangés**. Aucun
  classement par équipe ni par club n'est présent (R3).

### CT-04 — Ordre (rang → nom → prénom) et étiquette de sexe (couvre R5, R6)

- **Pré-condition** : CT-03 joué (Cléo = 12 rang 1 Filles, Ana = 9 rang 2 Filles,
  Bob = 9 rang 1 Garçons).
- **Étapes** :
  1. Sur l'écran d'affichage, lire l'ordre des trois lignes.
- **Résultat attendu** :
  1. **Bob** (rang **1**, étiquette **H**) — nom « Alpha » précède « Bravo » à
     rang égal (R5).
  2. **Cléo** (rang **1**, étiquette **F**).
  3. **Ana** (rang **2**, étiquette **F**).

  Le score de Cléo (12) est **supérieur** à celui de Bob (9) mais Bob apparaît
  **avant** elle : l'ordre suit le **rang** (et le départage nom/prénom), **pas**
  une comparaison de score entre sexes — confirme qu'**aucun rang global n'est
  recalculé** (R4/R5). Chaque ligne affiche nom, prénom, club et score, en plus
  de l'étiquette F/H (R6).

### CT-05 — Bandeau officiel / non officiel (couvre R7)

- **Rôle** : admin.
- **Étapes** :
  1. Sur l'écran d'affichage (rencontre en ③), relever le bandeau d'état.
  2. Faire passer la rencontre en **⑤ résultats publics**.
  3. Recharger l'écran d'affichage.
- **Résultat attendu** : bandeau **« ● Non officiel »** en ③, **« ✓ Officiel »**
  après la ⑤ ; les lignes et leur ordre restent identiques (seul l'état change,
  comme spec #7 R10).
- **Nettoyage** : remettre la rencontre en **③ compétition**.

### CT-06 — Aucune interaction, aucune pagination (couvre R8, R12)

- **Étapes** :
  1. Sur l'écran d'affichage, chercher une **zone de recherche**, des **filtres**,
     ou une **pagination** (« ‹ Précédent · Suivant › »).
- **Résultat attendu** : **aucun** de ces éléments n'est présent — à la différence
  de l'écran de consultation (`/admin/rencontres/[id]/classement`, spec #7 R12b).
  La liste complète est affichée d'un bloc (le défilement, CT-07, en permet la
  lecture).

### CT-07 — Défilement automatique et boucle avec rechargement (couvre R9, R10, R11)

- **Rôle** : admin (écran d'affichage) + coach ou admin (deuxième fenêtre, pour
  modifier un résultat).
- **Pré-condition** : CT-03 joué (3 lignes). Avec seulement 3 lignes, la durée de
  boucle est la **durée minimale** de l'écran (≈ 10 s), pratique pour observer
  un cycle complet rapidement.
- **Étapes** :
  1. Ouvrir l'écran d'affichage dans une fenêtre ; observer qu'il **défile
     seul**, de haut en bas, sans action.
  2. **Pendant** que le défilement est en cours (ne pas attendre la fin de la
     boucle), dans une **seconde fenêtre**, modifier le résultat d'**Ana**
     (ex. M2 : Top → Échec, faisant chuter son score).
  3. Revenir à l'écran d'affichage **sans le recharger manuellement** : observer
     le score d'Ana pendant le **reste** de la boucle en cours.
  4. Laisser l'écran atteindre le **bas de la liste** et **reboucler** (retour en
     haut) ; observer à nouveau le score d'Ana.
- **Résultat attendu** :
  - Étape 1 : défilement **continu**, sans intervention (R9).
  - Étape 3 : le score d'Ana affiché est **toujours l'ancien** — la modification
    faite en cours de défilement **n'apparaît pas immédiatement** (R11, aucun
    canal temps réel).
  - Étape 4 : **une fois la boucle terminée** (retour en haut de liste), le score
    d'Ana affiché est **à jour** (nouvelle valeur) — la fin de boucle a bien
    **rechargé** les données puis **repris le défilement depuis le début** (R10).
- **Nettoyage** : remettre le résultat d'Ana à l'état d'origine (M2 = Top).

### CT-08 — Liste vide (couvre cas limite R4)

- **Pré-condition** : rencontre en ③ **sans aucun résultat saisi** (utiliser une
  rencontre fraîchement remise en ③ sans saisie, ou retirer temporairement tous
  les résultats des trois grimpeurs de test).
- **Étapes** :
  1. Ouvrir l'écran d'affichage.
- **Résultat attendu** : message indiquant qu'**aucun résultat** n'est disponible
  pour le moment ; pas de tentative de défilement sur une liste vide.
- **Nettoyage** : ressaisir les résultats du tableau (CT-03) si d'autres CT
  suivent.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | |
| | | | CT-02 | ✅ / ❌ | |
| | | | CT-03 | ✅ / ❌ | |
| | | | CT-04 | ✅ / ❌ | |
| | | | CT-05 | ✅ / ❌ | |
| | | | CT-06 | ✅ / ❌ | |
| | | | CT-07 | ✅ / ❌ | |
| | | | CT-08 | ✅ / ❌ | |
