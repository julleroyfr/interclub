# Cahier de test : Realtime — mises à jour en direct (spec #11)

> Couvre le **live** des écrans **authentifiés** : dès qu'une écriture survient
> (`resultat_voie` / `resultat_bloc` / `temps_vitesse` / `points_vitesse`), les
> **autres écrans ouverts** (saisie coach #6, saisie admin #9, classement #7,
> écran juge #10) se **rafraîchissent d'eux-mêmes**, sans rechargement. Vérifie
> aussi la **migration** de publication, la **RLS** (aucune fuite `anon` /
> public), l'**anti-rebond**, l'**indicateur d'état** et le **rattrapage à la
> reconnexion**. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/11-realtime.md` (R1–R12 + « Contraintes de
  données » + « Points à surveiller ») ; s'appuie sur `06` (R22/R23),
  `07` (R10/R15/R20), `08` (aucune RLS `anon`), `09`, `10`.
- **Pré-requis** :
  - Migrations appliquées jusqu'à **`202609231000_realtime_publication`** incluse —
    en local : `supabase db reset` (migrations + seed).
  - **Realtime actif** (stack locale : conteneur `realtime` lancé par
    `supabase start` ; `config.toml` → section `[realtime] enabled = true`).
  - `config.toml` → `enable_anonymous_sign_ins = true` (session juge).
  - **Implémentation réalisée** : composant client d'abonnement +
    `router.refresh()` anti-rebondi + indicateur d'état, branché sur les 4 écrans.
    *(Ce cahier s'exécute après l'implémentation ; avant, seuls CT-01 et CT-11b
    — niveau base — sont jouables.)*
  - **Deux appareils ou deux onglets/navigateurs** (fenêtre « écrivain » +
    fenêtre « observateur ») ; DevTools ouvert pour CT-07/08/09/12.
  - App lancée : `npm run dev` → port **3011**.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Rencontre **ENFANT** `JD-RENCONTRE-ENFANT` (`33333333-…-3333`, phase
`competition`), ses épreuves **voie** `…8801` / **bloc** `…8802` / **vitesse**
`…8803`, la structure `JD-STRUCTURE-ENFANT` + `JD-BLOCS-ENFANT`, le barème
`JD-BAREME-VITESSE-ENFANT`, les voies de vitesse `JD-VITESSE` et le jeton
`JD-JETON-JUGE`. Compétiteurs (deux clubs, deux sexes) : **Ana** (`JD-ANA-M2`,
Club A, F) et **Bob** (`JD-BOB-T1`, Club A, G) — équipe A1 ; **Cléo**
(`JD-CLEO-T2`, Club B, F) — équipe B1. Aucun résultat ni temps n'est seedé (état
« avant saisie ») ; les écritures sont produites pendant le déroulé.

> **Basculer la phase** (SQL Editor) :
> `update interclub.rencontre set phase = '<phase>' where id = '33333333-3333-3333-3333-333333333333';`

Routes utilisées :

- Saisie coach : `/coach/rencontres/33333333-3333-3333-3333-333333333333/resultats`
- Classement coach : `/coach/rencontres/33333333-3333-3333-3333-333333333333/classement`
- Saisie admin : `/admin/rencontres/33333333-3333-3333-3333-333333333333/resultats`
- Écran juge : `/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb` → `/juge`
- Page publique : `/rencontres/33333333-3333-3333-3333-333333333333`

## Comptes / sessions de test

| Compte / session | Rôle | Usage |
| --- | --- | --- |
| `admin@test.local` (`JD-ADMIN`) | admin | Écrit (saisie admin) ; change la phase |
| `coach@test.local` (`JD-COACH-A`) | coach permanent Club A | Écrit / observe (saisie + classement) |
| `coach2@test.local` (`JD-COACH-A2`) | 2ᵉ coach permanent Club A | 2ᵉ observateur Club A (CT-03/06/07/08/09/11) |
| `coachb@test.local` (`JD-COACH-B`) | coach permanent Club B | Observateur Club B — bornage cross-club (CT-03/10/11) |
| Scan `JD-JETON-JUGE` | juge (session QR) | Écrit les temps de vitesse |
| `sansmapping@test.local` (`JD-SANSMAP`) | authentifié sans rôle | Négatif : ne reçoit rien sur ces tables |
| *(aucune session)* | visiteur `anon` / public | Négatif : page publique sans live |

## Cas de test

### CT-01 — Migration : publication & identité de réplication (couvre : Contraintes de données, migration 202609231000)

- **Rôle / accès** : SQL Editor (base locale).
- **Pré-condition** : migration `202609231000_realtime_publication` appliquée.
- **Étapes** :
  1. `select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='interclub' order by 1;`
  2. `select relname, relreplident from pg_class where relnamespace='interclub'::regnamespace and relname in ('resultat_voie','resultat_bloc','points_vitesse','temps_vitesse');`
  3. `select version from interclub.version where version='202609231000_realtime_publication';`
- **Résultat attendu** : (1) les **4 tables** sont listées ; (2) `relreplident = 'f'`
  (**FULL**) pour les 4 ; (3) la ligne de version existe. Rejouer la migration une
  2ᵉ fois **ne produit pas d'erreur** (idempotence).

### CT-02 — Live saisie coach → classement (même club) (couvre : R1, R2, R3, R4)

- **Rôle / compte** : `coach@test.local`, **deux onglets**.
- **Pré-condition** : rencontre en ③.
- **Étapes** :
  1. Onglet **A** : ouvrir la **saisie coach**. Onglet **B** : ouvrir le
     **classement** (vue individuel), le laisser affiché **sans y toucher**.
  2. Dans l'onglet **A**, saisir une **issue de voie** pour **Bob** (ex. voie
     réussie) et valider.
- **Résultat attendu** : l'onglet **B** se met à jour **tout seul** en quelques
  secondes (**sans rechargement**) : le **score** de Bob et son **rang** évoluent.
  L'onglet A reflète aussi l'écriture (revalidation, R6).

### CT-03 — Live saisie admin → saisie coach (cross-acteur) (couvre : R1, R2, R3, R6)

- **Rôles** : `admin@test.local` (`JD-ADMIN`, écrivain) + `coach@test.local` (`JD-COACH-A`, observateur) + *(optionnel)* `coachb@test.local` (`JD-COACH-B`, 2ᵉ observateur cross-club).
- **Étapes** :
  1. Fenêtre **admin** : ouvrir la **saisie admin**. Fenêtre **coach A** : ouvrir la
     **saisie coach**, sur le détail d'**Ana**. *(Optionnel)* Fenêtre **coach B** :
     ouvrir la **saisie coach** (vue équipe B1).
  2. Dans la fenêtre **admin**, saisir un **palier de bloc** pour **Ana**.
- **Résultat attendu** : la fenêtre **coach A** met à jour l'**issue du bloc** d'Ana
  et son **score** **sans rechargement**. L'écran admin reflète aussi son écriture
  (R6) — le live **complète**, ne remplace pas, la revalidation de l'auteur.
  *(Optionnel)* La fenêtre **coach B** reçoit aussi la mise à jour (R1 : tous les
  authentifiés ③ concernés reçoivent le live, pas seulement le même club).

### CT-04 — Un temps de vitesse se propage partout (couvre : R1, R3, R4 ; scénario nominal)

- **Rôles / sessions** : juge (écrivain) + `coach@test.local` (saisie **et**
  classement) + un **2ᵉ écran juge** (2ᵉ scan `JD-JETON-JUGE`).
- **Pré-condition** : rencontre en ③.
- **Étapes** :
  1. Ouvrir en parallèle : **juge #1**, **juge #2**, **coach saisie** (détail Bob),
     **coach classement**.
  2. Sur **juge #1**, saisir un **temps** pour **Bob** (ex. `8.123`).
- **Résultat attendu**, **sans rechargement** :
  - **coach classement** : le classement **bouge** (points de vitesse pris en
    compte — `points_vitesse` observée) ;
  - **coach saisie** : la pastille ⚡ de Bob affiche **« 8,123 s »** et le **score
    (voie + bloc + vitesse)** est réévalué (`temps_vitesse` + `points_vitesse`) ;
  - **juge #2** : le **temps** de Bob apparaît (`temps_vitesse`).

### CT-05 — Rang par sexe recalculé en direct — cascade (couvre : R3, R4 ; spec #7 R15/R20)

- **Rôles** : juge (écrivain) + `coach@test.local` (classement, observateur).
- **Pré-condition** : **Ana** et **Cléo** (les deux **Filles**) ont chacune un
  **temps**, Ana devant Cléo au classement vitesse.
- **Étapes** :
  1. Laisser le **classement** affiché (vue individuel **Filles**).
  2. Sur l'écran **juge**, **corriger le temps de Cléo** pour qu'il devienne
     **meilleur** que celui d'Ana.
- **Résultat attendu** : le classement **Filles** se **réordonne en direct** — le
  rang **d'Ana ET de Cléo** change (recalcul par sexe). Démontre pourquoi la
  **relecture** (R4) est nécessaire : une seule écriture modifie **plusieurs**
  lignes affichées (pas de simple « valeur changée »).

### CT-06 — Anti-rebond sur saisie en rafale (couvre : R9)

- **Rôles** : `coach@test.local` (`JD-COACH-A`, écrivain) + `coach2@test.local` (`JD-COACH-A2`, classement, observateur — navigateur séparé pour éviter le partage de session).
- **Étapes** :
  1. Laisser le **classement** affiché dans la fenêtre **coach2** (observateur).
  2. Dans la fenêtre **coach** (écrivain), saisir **rapidement** 4–5 résultats de voie/bloc
     (quelques secondes).
- **Résultat attendu** : l'observateur **ne clignote pas** à chaque écriture ; les
  évènements rapprochés sont **regroupés** en un (ou très peu de) rafraîchissement,
  et l'état **final** est **cohérent** avec les saisies. Pas de rafale de reloads.

### CT-07 — Indicateur d'état de connexion (couvre : R10)

- **Rôle** : `coach2@test.local` (`JD-COACH-A2`, classement) — utiliser un compte dédié évite de perturber les autres fenêtres coach ouvertes.
- **Étapes** :
  1. Ouvrir le **classement** : repérer l'**indicateur** temps réel (**« en direct »
     / connecté**).
  2. DevTools → onglet **Network** → passer en **Offline** (ou couper le Wi-Fi).
- **Résultat attendu** : à l'ouverture, l'indicateur est **connecté** ; après la
  coupure, il passe à **interrompu** (l'utilisateur sait que l'écran peut ne plus
  être à jour). L'écran **reste affiché et utilisable** (R12).

### CT-08 — Reconnexion & rattrapage (couvre : R11, R12)

- **Rôles** : `coach2@test.local` (`JD-COACH-A2`, observateur, prolonge CT-07 en **Offline**) +
  un écrivain (`admin@test.local` ou juge).
- **Étapes** :
  1. Observateur **Offline** (CT-07). Depuis l'écrivain, produire **une écriture**
     (ex. un temps, ou une issue de voie).
  2. Remettre l'observateur **Online**.
- **Résultat attendu** : pendant l'`Offline`, l'observateur reste **fonctionnel**
  mais **figé** (R12). À la **reconnexion**, l'indicateur repasse **connecté** (R10)
  **et** l'écran **relit tout** → l'écriture manquée **apparaît** (R11), **sans
  rechargement manuel**. Aucun évènement perdu à l'écran.

### CT-09 — Cycle de vie de l'abonnement (couvre : R7)

- **Rôle** : `coach2@test.local` (`JD-COACH-A2`) — fenêtre isolée pour observer le WS sans ambiguïté.
- **Étapes** :
  1. Ouvrir le **classement** ; DevTools → **Network / WS** : repérer le canal
     temps réel **ouvert**.
  2. **Naviguer ailleurs** (ou fermer l'onglet).
- **Résultat attendu** : le canal se **ferme** au démontage de l'écran — pas de
  connexion temps réel **résiduelle** après avoir quitté l'écran.

### CT-10 — Négatif public / `anon` : pas de live, aucune fuite (couvre : R1, R5 ; spec #8)

- **Rôles** : visiteur **anon** (page publique) + un écrivain authentifié.
- **Étapes** :
  1. Sans session, ouvrir la **page publique** de la rencontre.
  2. Depuis un écran authentifié, saisir un résultat.
  3. *(Technique)* Dans la console du visiteur, tenter un abonnement Realtime
     `anon` sur `interclub.resultat_voie` (client browser).
- **Résultat attendu** : (1–2) la page publique **ne se met pas à jour toute
  seule** — il faut **recharger** (public **hors périmètre**, R1) ; aucune donnée
  poussée. (3) l'abonnement `anon` **ne reçoit aucun évènement** (ni policy ni grant
  pour `anon` → spec #8 préservée, R5).

### CT-11 — Bornage & absence d'évènement hors ③/④ (couvre : R7, R8)

- **Rôles** : `coach@test.local` (`JD-COACH-A`) + *(optionnel)* `coachb@test.local` (`JD-COACH-B`) pour vérifier le bornage cross-club.
- **Étapes** :
  1. **(a)** En ③, ouvrir le **classement** de la rencontre enfant ; si des
     écritures d'une **autre** rencontre autorisée surviennent, observer l'écran.
  2. **(b)** Basculer la rencontre en **`preparation`** (②) ; ouvrir les écrans.
- **Résultat attendu** : **(a)** un éventuel rafraîchissement déclenché par une
  autre rencontre est **sans effet visible** (le loader ne lit que la rencontre
  courante, R8) ; **(b)** en ② aucune écriture de résultat n'est possible → **aucun
  évènement**, aucun live attendu (comportement normal, R7).

### CT-12 — Mesure du payload de relecture (couvre : Points à surveiller, R4)

- **Rôle** : `coach@test.local` (classement).
- **Étapes** :
  1. Remplir la rencontre de résultats (plusieurs grimpeurs, voie + bloc + vitesse)
     pour un cas **réaliste**.
  2. DevTools → **Network** ; déclencher **une** écriture depuis un autre écran.
  3. Relever la **taille** de la requête de rafraîchissement (payload RSC du
     `router.refresh()`).
- **Résultat attendu** : rafraîchissement **fonctionnel** ; **noter la taille**
  dans la colonne *Remarque* du registre. Repère : de l'ordre de **quelques
  dizaines de Ko** → la relecture reste le bon choix ; au-delà (avec fan-out réel),
  ouvrir la piste **diff/Broadcast serveur** (décision « à l'usage »).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-09-25 | julleroyfr | a76fcdf | CT-01 | ✅ | migration appliquée manuellement via Docker ; idempotence partielle (INSERT version sans ON CONFLICT) |
| 2026-09-25 | julleroyfr | a76fcdf | CT-02 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-03 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-04 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-05 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-06 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-07 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-08 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-09 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-10 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-11 | ✅ | |
| 2026-09-25 | julleroyfr | a76fcdf | CT-12 | ✅ | payload = 6 Ko — relecture légère, choix confirmé |
