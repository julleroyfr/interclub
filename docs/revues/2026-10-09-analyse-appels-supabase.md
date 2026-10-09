# Analyse des appels Supabase par écran et par action — 2026-10-09

- **Périmètre** : toutes les pages (`src/app/**/page.tsx`, routes PDF) et toutes
  les Server Actions (`src/lib/**/*actions*.ts`), branche `develop` (commit
  `0a59df1`).
- **Question** : quels chargements de page et quelles actions font **plus d'un
  appel Supabase**, et combien d'allers-retours **séquentiels** ?
- **Statut** : constats à traiter — plan :
  [2026-10-09-plan-action-appels-supabase.md](./2026-10-09-plan-action-appels-supabase.md).

## Pourquoi compter les vagues

Les fonctions Netlify tournent en Ohio, la base Supabase de recette à Dublin
(plans gratuits, région figée). Un aller-retour coûte 150 à 1000 ms. Ce qui
compte n'est donc pas le nombre de requêtes, mais le nombre de **vagues** : des
`await` successifs, dont chacun attend le précédent. Des requêtes lancées dans un
même `Promise.all` forment une seule vague.

Règles de comptage :

- `proxy.ts` → `getClaims()` vérifie le jeton **en local** (JWKS en cache) :
  0 appel, sauf rafraîchissement du jeton.
- **Vague 0** de toute requête serveur authentifiée : `getUtilisateurCourant()`
  lit `compte` (1 appel, mis en cache pour la requête). Côté coach,
  `getContexteCoach()` lance `compte` et la RPC `contexte_coach_temporaire` en
  parallèle : 1 vague, 2 appels.
- Une Server Action qui appelle `revalidatePath` **re-rend la page** dans la même
  réponse. Coût réel = vagues de l'action + vagues du loader de la page.
- `TempsReel` déclenche `router.refresh()` à chaque évènement (anti-rebond de
  400 ms) : le loader est relancé en entier. L'écran `affichage` se rafraîchit
  aussi à intervalle fixe.

## Synthèse

Le modèle existe déjà : `chargerSaisie` (`src/lib/coach/resultats.ts`) lit toute
une rencontre en **une vague** (jointures `!inner`, relations embarquées,
pagination), et les saisies coach et juge ne coûtent qu'**un appel** (RPC,
saisie optimiste). Le classement, le contrôle, l'engagement du coach et la
clôture n'ont pas été construits ainsi : ils enchaînent 5 à 10 vagues. Or ce
sont justement les écrans rafraîchis en direct le jour J.

La même lecture révèle des **risques de justesse** : plusieurs loaders lisent
les résultats d'une rencontre sans pagination. Au-delà de 1000 lignes (plafond
`max_rows`), le résultat est tronqué sans erreur.

## Chargements de page

| Écran | Vagues | Appels | Chaîne | Constat |
| --- | --- | --- | --- | --- |
| `/admin` (tableau de bord) | 2 | 5 | compte → 4 // | J4 |
| `/admin/clubs` | 2 | 5 | compte → 3 // + invitations | J4 |
| `/admin/grimpeurs` | 2 | 3 | compte → RPC + clubs | ✔ |
| `/admin/rencontres` | 2 | 5 | compte → 4 // | ✔ |
| `/admin/mapping` | 2 | 5 | compte → `listUsers` + 3 // | ✔ |
| `/admin/gabarit` | 4 | ~11 | compte → (épreuves → 4 // → paliers) × 2 catégories | P9 |
| `/admin/jetons?rencontre=` | 3 | 5 | compte → rencontres → (clubs, voies, jetons) | P10 |
| `/admin/rencontres/[id]` | 3 (①–③) · 7 (④/⑤) | ~18 · ~28 | compte → // [structure, prêts, engagement, contrôle] | P4 |
| `/admin/rencontres/[id]/classement` | 8 | ~15 | compte → rencontre → épreuves → voies/blocs/équipes → 6 // → grimpeurs → clubs → export | P1, P12, J1 |
| `/admin/rencontres/[id]/affichage` | 7 | ~13 | idem sans l'export, rafraîchi en boucle | P1, J1 |
| `/admin/rencontres/[id]/controle` | 8 | ~14 + N | compte → rencontre → épreuves → voies/blocs → 5 // → grimpeurs → clubs → N × `getUserById` | P2, J2 |
| `/admin/rencontres/[id]/resultats` | 3 | ~12 | compte → saisie (1 vague) → noms des clubs | P11 |
| `…/classement/pdf` (admin et coach) | 8 | ~15 | compte → état de la rencontre → classement | P1, P12 |
| `/coach` | 2 | 5 | (compte ∥ RPC) → 3 // | ✔ |
| `/coach/rencontres/[id]` | 5 | 8 | contexte → rencontre → 4 // → grimpeurs → clubs des prêtés | P5 |
| `/coach/rencontres/[id]/resultats` | 2 | ~11 | contexte → saisie (1 vague) | ✔ modèle |
| `/coach/rencontres/[id]/classement` | 8 | ~15 | comme le classement admin | P1, P12 |
| `/coach/jetons` | 3 | 2 + N | compte → rencontres du club → **N ×** `jeton_qr` | P8 |
| `/juge` | 2 | 2 | RPC `contexte_juge` → RPC `liste_grimpeurs_vitesse` | ✔ |
| `/inscription?invitation=` | 2 | 2 | compte → invitation | ✔ |

## Server Actions

Vagues de l'action seule. Le re-rendu de la page (`revalidatePath`) s'y ajoute.

| Action | Vagues | Chaîne | Constat |
| --- | --- | --- | --- |
| `basculerControle` | 6 | compte → résultat → voie/bloc → épreuve → rencontre → update | P3 |
| `changerPhaseRencontre` (③ → ④) | ≤ 10 | compte → rencontre → update → rencontre (relue) → épreuves → voies/blocs → compositions → résultats → upsert voie → upsert bloc | P7, J3 |
| Coach : `ajouterGrimpeurEquipe` | 5 | contexte → équipe → rencontre → 4 // → insert | P6 |
| Coach : renommer, supprimer, retirer, définir le groupe | 4 | contexte → équipe → rencontre → écriture | P6 |
| `mettreAJourBaremeVitesse` | 5 | compte → phase → update → delete → insert | A1 |
| `mettreAJourBaremeVitesseGabarit` | 4 | compte → update → delete → insert | A2 |
| Structure : ajouter voie / bloc | 4 | compte → phase → prochain ordre → insert | P13 |
| `saisirResultatBlocAdmin` | 4 | compte → contexte du bloc → palier → upsert | P14 |
| `regenererJeton` | 5 | compte → jeton gérable → même jeton relu → révocation → insert | P15, A3 |
| `regenererInvitation` (coach) | 4 | compte → gérable → révocation → insert | A4 |
| `genererInvitationAdmin` | 3 | compte → révocation → insert | A5 |
| `creerPretAction` | 3 | compte → 2 // → insert | J5 |
| Autres actions (CRUD, import, saisie admin voie, mapping, connexion) | 2–3 | compte → (contexte) → écriture | ✔ |
| `enregistrerSaisieCoach`, `enregistrerTempsVitesse` | 1 | RPC | ✔ modèle |

## Constats

Gravité : 🔴 justesse des résultats · 🟠 latence le jour J (écran en direct ou
clic répété) · 🟡 latence hors jour J · ⚪ atomicité.

### Latence

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| P1 | 🟠 | Classement : 6 vagues dans le loader, 5 consommateurs (2 écrans, affichage, 2 PDF), tous rafraîchis en direct | `src/lib/classement/classement.ts` |
| P2 | 🟠 | Contrôle : 6 vagues + une lecture `getUserById` par auteur | `src/lib/admin/controle.ts` |
| P3 | 🟠 | `basculerControle` : 4 lectures en série pour retrouver la phase, à chaque coche | `src/lib/admin/controle-actions.ts` |
| P4 | 🟡 | Tableau de bord de rencontre : la rencontre est relue 4 fois, les clubs 2 fois, la structure 2 fois ; le contrôle complet (6 vagues) est chargé pour une simple progression | `src/app/admin/rencontres/[id]/page.tsx` |
| P5 | 🟠 | Engagement coach : 5 vagues (grimpeurs puis clubs relus après coup) | `src/lib/coach/engagement.ts` |
| P6 | 🟠 | Actions d'engagement coach : équipe puis rencontre lues en 2 vagues | `src/lib/coach/actions.ts` |
| P7 | 🟡 | Clôture : jusqu'à 10 vagues, catégorie relue, upserts en série | `src/lib/rencontres/cloture.ts` |
| P8 | 🟡 | Jetons du coach : une requête `jeton_qr` par rencontre (N+1) | `src/app/coach/jetons/page.tsx` |
| P9 | 🟡 | Gabarit : 3 vagues par catégorie | `src/lib/gabarit/gabarit.ts` |
| P10 | 🟡 | Jetons admin : la rencontre est lue avant les jetons alors que l'id est dans l'URL | `src/app/admin/jetons/page.tsx` |
| P11 | 🟡 | Saisie admin : noms des clubs lus dans une vague à part | `src/lib/admin/resultats.ts` |
| P12 | 🟠 | Export : l'état de la rencontre est lu en série avec le classement | `src/lib/export/export-classement.ts` |
| P13 | 🟡 | Structure : la phase et le prochain ordre sont lus en série | `src/lib/rencontres/structure-actions.ts` |
| P14 | 🟡 | Saisie admin bloc : le contexte et le palier sont lus en série | `src/lib/admin/resultats-actions.ts` |
| P15 | 🟡 | `regenererJeton` relit le jeton déjà lu par `jetonGerable` | `src/lib/jetons/actions.ts` |
| T1 | 🟠 | Vague 0 `compte` sur toutes les requêtes (le rôle n'est pas dans le JWT) | `src/lib/auth/session.ts` |

### Justesse

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| J1 | 🔴 | Classement : `resultat_voie` / `resultat_bloc` (et compositions) non paginés → classement tronqué sans erreur au-delà de 1000 lignes | `src/lib/classement/classement.ts` |
| J2 | 🔴 | Contrôle : mêmes lectures non paginées ; la lecture des `grimpeur` ne passe pas par `verifierLecture` | `src/lib/admin/controle.ts` |
| J3 | 🟠 | Clôture : `resultat_bloc` filtré par grimpeur sur **toutes** les rencontres, sans pagination (l'upsert ignore les doublons, d'où un effet limité) | `src/lib/rencontres/cloture.ts` |
| J4 | 🟠 | Compteurs de grimpeurs calculés en lisant les lignes → faux au-delà de 1000 licenciés | `tableau-de-bord.ts`, `clubs/clubs.ts` |
| J5 | 🟡 | `creerPretAction` / `revoquerPretAction` revalident `/admin/prets`, une route inexistante (à vérifier : rafraîchissement de l'écran) | `src/lib/prets/prets-actions.ts` |

### Atomicité

| # | Gravité | Constat | Où |
| --- | --- | --- | --- |
| A1 | ⚪ | Barème de vitesse d'une rencontre : update + delete + insert en 3 appels | `src/lib/rencontres/structure-actions.ts` |
| A2 | ⚪ | Barème de vitesse du gabarit : idem | `src/lib/gabarit/actions.ts` |
| A3 | ⚪ | Régénération de jeton : révocation puis insert | `src/lib/jetons/actions.ts` |
| A4 | ⚪ | Régénération d'invitation coach : idem | `src/lib/invitations/actions.ts` |
| A5 | ⚪ | Génération d'invitation admin : idem | `src/lib/invitations/actions-admin.ts` |
