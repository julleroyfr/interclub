# Cahier de test : Espace coach — engagement d'un club (spec #5)

> Couvre le **parcours d'engagement** du coach : accueil `/coach` (liste des
> rencontres), écran `/coach/rencontres/[id]` (équipes, composition, groupe de
> départ), pour le coach **permanent** et le coach **temporaire** (session QR).
> Inclut le **bornage de phase** (édition ①/②, gel ③+), le **garde-fou date** de
> la préparation, et l'**ouverture de session QR en préparation** (migration
> `202609011500`, spec #2 R12).
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** :
  `docs/specs/05-espace-coach.md` (R1–R21) ;
  `docs/specs/01-roles-et-autorisations.md` (R6, R16, R17, R27, R35, R36) ;
  `docs/specs/02-authentification-et-sessions-qr.md` (R12, validité QR
  nature-dépendante) ;
  [ADR 0001](../decisions/0001-authentification-sessions-ephemeres-qr.md).
- **Pré-requis** :
  - Migrations appliquées jusqu'à **`202609021000_pret_grimpeur`** incluse (dont
    la visibilité/gestion et le **prêt persistant** du grimpeur prêté, R12/R13/R36)
    — lancer `supabase db reset` en local (migrations + seed 01/02/03).
  - `supabase/config.toml` → `enable_anonymous_sign_ins = true`.
  - App lancée : `npm run dev` → l'app écoute sur le **port 3011**.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Seed `01-jeu-de-test.sql` appliqué via `supabase db reset` :

- Clubs : **Club A**, **Club B**.
- Comptes (mdp `interclub`) : `admin@test.local` (admin), `coach@test.local`
  (coach **permanent** Club A), `sansmapping@test.local` (aucun rôle).
- **Rencontre** `33333333-…-3333` : date **2026-09-19**, catégorie **enfant**,
  portée par Club A, phase initiale **`competition`**.
- Équipes Club A : **A1** (`6666…6666`, contient Ana Alpha + Bob Alpha), **A2**
  (`6666…6602`, vide). Équipe Club B : **B1** (`7777…7777`, contient Cléo Bravo).
- Grimpeurs Club A engagés dans A1 : **Ana Alpha** (2015), **Bob Alpha** (2016),
  plus un **pool de 8 grimpeurs Club A libres** (Chloé, David, Emma, Félix, Gaby,
  Hugo, Iris, Jade — `…00a3`→`…00aa`) : matière pour l'ajout au roster (CT-02) et le
  remplissage d'une équipe à 8/8 (CT-04). Grimpeur Club B **Devi Bravo** (2016)
  reste **libre** (matière à prêt, R35/R36).
- Jeton QR **coach temporaire Club A** actif — valeur (secret) :
  `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa` → URL de scan :
  `http://localhost:3011/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
- Jeton QR **juge Voie 1** actif — valeur `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`.

> **Basculer la phase** (SQL Editor) :
> `update interclub.rencontre set phase = '<phase>' where id = '33333333-3333-3333-3333-333333333333';`
> phases : `pre_competition` → `preparation` → `competition` → `cloture` →
> `resultats_publics`.
>
> **Basculer la date** (pour le garde-fou jour J) :
> `update interclub.rencontre set date_rencontre = current_date where id = '33333333-3333-3333-3333-333333333333';`
> (et `'2026-09-19'` pour revenir à une date ≠ aujourd'hui).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Change la phase, rattache un prêt, corrige en gel |
| `coach@test.local` | coach permanent (Club A) | Acteur principal ①/② |
| *(anonyme via scan)* | coach temporaire (Club A) | Acteur jour J (préparation) |
| `sansmapping@test.local` | aucun | Négatif : pas d'accès espace coach |

## Cas de test

> **Marquage d'exécution** (cf. [convention 06 §3.1](../conventions/06-cahier-de-test.md#31-cas-exécutables-par-un-agent-marquage-auto--manuel--mixte)) :
> chaque cas porte `[auto]` (rejouable par l'agent : Playwright + scripts API/RLS),
> `[manuel]` (jugement de rendu) ou `[mixte]`. Ici un seul résidu manuel (CT-05, la
> couleur du badge « Prêté »). Pilote de l'[ADR 0004](../decisions/0004-agent-execution-cahiers-de-test.md).

### CT-01 `[auto]` — Accueil coach : liste triée par priorité   (couvre : R6, R7, R8 ; nominal)

- **Rôle / compte** : `coach@test.local`.
- **Pré-condition** : phase `pre_competition` (SQL).
- **Étapes** :
  1. Se connecter via `/connexion`, aller sur `http://localhost:3011/coach`.
- **Résultat attendu** :
  - La rencontre du **19 sept. 2026 — Club A** apparaît en carte, avec le badge
    de phase **Pré-compétition** et le compte d'équipes/grimpeurs du club
    (2 équipes · 2 grimpeurs).
  - La carte est un lien vers `/coach/rencontres/33333333-…`.
- **RLS / sécurité** : `sansmapping@test.local` sur `/coach` → **404** ; un
  visiteur non connecté sur `/coach` → **404**.

### CT-02 `[auto]` — Créer une équipe et composer (permanent, pré-compétition)   (couvre : R9, R10, R11, R12, R15 ; nominal)

- **Rôle / compte** : `coach@test.local`.
- **Pré-condition** : phase `pre_competition`.
- **Étapes** :
  1. Ouvrir la rencontre. Créer une équipe **« A3 »** (formulaire « Nouvelle équipe »).
  2. Dans A3, ajouter **Chloé Alpha** (grimpeur libre du pool) depuis le roster.
- **Résultat attendu** :
  - A3 apparaît (effectif **0/8** puis **1/8** après ajout), la jauge se met à jour
    (revalidation, R18).
  - Le sélecteur d'ajout ne propose que des grimpeurs **non déjà engagés** dans la
    rencontre (Ana et Bob, déjà dans A1, n'y figurent pas) **et éligibles à la
    catégorie** (tranche d'âge, R34 / spec #1) : un grimpeur **hors tranche d'âge**
    (ex. un ado sur une rencontre enfant) **n'est pas proposé**.
- **RLS / sécurité** : recréer « A3 » (même nom) → **refusé** (nom unique par
  rencontre, R10). Un POST direct ajoutant un grimpeur **hors tranche d'âge** est
  **refusé** côté serveur (message R34).

### CT-03 `[auto]` — Groupe de départ (rencontre enfant)   (couvre : R19, R20, R21 ; nominal)

- **Rôle / compte** : `coach@test.local`.
- **Pré-condition** : phase `pre_competition` ; A2 contient au moins un grimpeur
  (ajouter Ana Alpha à A2 si besoin — la retirer d'abord de A1, cf. R14).
- **Étapes** :
  1. Dans le formulaire d'ajout, choisir un grimpeur et le **groupe de départ « M2 »**.
  2. Observer l'indice de voies avant validation.
- **Résultat attendu** :
  - L'indice affiche **« M2 · M3 · M4 »** (3 voies croissantes, R20).
  - La liste des groupes s'arrête à **T8** (pas de T9/T10, R19).
  - Après ajout, le grimpeur porte le badge **« Groupe M2 »** ; un grimpeur sans
    groupe porte **« à définir »** (R21). L'éditeur inline permet de changer le groupe.
- **RLS / sécurité** : sur une rencontre **ado**, aucun champ ni badge de groupe
  n'apparaît (R19).

### CT-04 `[auto]` — Refus : double engagement (R14) et plafond 8 (R15)   (couvre : R14, R15 ; cas limite)

- **Rôle / compte** : `coach@test.local`.
- **Pré-condition** : phase `pre_competition` ; Ana Alpha engagée dans A1.
- **Étapes** :
  1. Tenter d'ajouter **Ana Alpha** à A2.
  2. Remplir une équipe à **8/8** avec les 8 grimpeurs libres du pool (Chloé…Jade).
- **Résultat attendu** :
  - Ana Alpha n'est **pas proposée** (déjà engagée dans la rencontre, R14) ; toute
    tentative directe est refusée avec un message explicite.
  - À 8/8, le formulaire d'ajout **disparaît**, remplacé par « Équipe complète —
    plafond de 8 atteint (R15) » (aucun 9ᵉ ajout possible).

### CT-05 `[mixte]` — Grimpeur prêté : prêt admin persistant, gestion coach   (couvre : R12, R13, R21, R35, R36 ; nominal + négatif)

- **Pré-condition** : phase `pre_competition` ; migrations **`202609020900`** et
  **`202609021000`** appliquées.
- **Étapes** :
  1. **Coach** : ouvrir la rencontre → **Devi Bravo** (Club B) n'est **pas** au roster (R13).
  2. **Admin** (SQL Editor, R35) — créer le **prêt** :
     `insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id) values ('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111');`
  3. **Coach** : recharger → **affecter** Devi à A2 depuis le roster.
  4. **Coach** : définir le **groupe de départ** du prêté (liste déroulante → « M2 » → OK).
  5. **Coach** : **retirer** Devi de A2, puis le **ré-affecter** à A1.
- **Résultat attendu** :
  - `[auto]` Étape 1 : sans prêt, Devi n'est **pas proposé** au roster (R13).
  - `[auto]` Étape 3 : après le prêt, Devi apparaît dans le **roster** avec le libellé
    **« Devi Bravo (prêté · Club B) »** (R12). Une fois affecté, sa ligne porte son
    **nom** et le badge **« Prêté · Club B »** (R13).
  - `[auto]` Étape 4 : le groupe **persiste** (le sélecteur reste sur « M2 », R21).
  - `[auto]` Étape 5 : après retrait, Devi **revient au roster** (le prêt persiste) et
    est **ré-affectable** à A1 **sans** intervention admin (R36) ; le coach ne peut
    **pas** créer de prêt lui-même (R13/R35).
  - `[manuel]` vérifier à l'œil : le badge « Prêté » est bien rendu en **violet**
    (couleur, R13).

### CT-06 `[auto]` — Garde-fou date : préparation ET compétition jour J   (couvre : spec #1 R5 rév. 2026-09-02 ; cas limite)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : phase `pre_competition` ; **date ≠ aujourd'hui**
  (`date_rencontre = '2026-09-19'`).
- **Étapes** :
  1. Sur `/admin/rencontres` (ou le tableau de bord), repérer la rencontre.
  2. Observer le bouton **« Préparation jour J → »** (hors jour J).
  3. Passer la date à aujourd'hui (`date_rencontre = current_date`), recharger,
     cliquer **« Préparation jour J → »**.
  4. Repasser la date à `'2026-09-19'` (hors jour J), recharger, observer
     **« Compétition → »**.
  5. Basculer en `competition` (SQL), toujours hors jour J, recharger, observer le
     bouton de **retour arrière**.
- **Résultat attendu** :
  - Étape 2 : bouton **désactivé**, indice « … le jour de la rencontre (R5) ».
  - Étape 3 : passage en **préparation accepté**.
  - Étape 4 : **« Compétition → » désactivé** hors jour J (la compétition est aussi
    jour J).
  - Étape 5 : le bouton de retour cible **« ← Pré-compétition »** (et non
    « préparation ») ; un clic ramène la rencontre en **pré-compétition** (hors jour
    J, la préparation jour-J est sautée).
- **RLS / sécurité** : un POST direct de `changerPhaseRencontre` vers `preparation`
  **ou** `competition` **hors jour J** est **refusé** côté serveur (message R5).

### CT-07 `[auto]` — Ouverture de session QR coach temporaire en préparation   (couvre : spec #2 R12, migration 202609011500 ; nominal)

- **Rôle / compte** : navigateur anonyme (sans compte), 2ᵉ navigateur / onglet privé.
- **Pré-condition** : phase **`preparation`** (SQL) ; jeton coach temp. actif.
- **Étapes** :
  1. Ouvrir `http://localhost:3011/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`.
- **Résultat attendu** :
  - La page `/scan` affiche « Session ouverte — redirection… » puis redirige vers
    `/coach` (auparavant refusé hors compétition ; désormais la fenêtre coach temp.
    couvre **préparation + compétition**, R12).
  - Une ligne est créée dans `interclub.session_qr`.
- **RLS / sécurité** : scanner le **jeton juge**
  (`bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb`) en **préparation** → **refusé**
  (« Ce QR n'est pas encore ouvert… ») : la fenêtre juge reste **compétition seule**.

### CT-08 `[auto]` — Coach temporaire : édition de l'engagement en préparation   (couvre : R16 ; spec #1 R6, R27 ; nominal)

- **Rôle / compte** : coach temporaire (session ouverte au CT-07).
- **Pré-condition** : phase `preparation`.
- **Étapes** :
  1. Sur `/coach`, ouvrir la rencontre (la seule visible pour la session).
  2. Créer une équipe **« TMP »**, y ajouter **Chloé Alpha** (grimpeur libre ;
     Ana/Bob sont déjà engagés en A1, R14), fixer un **groupe de départ « M2 »**.
- **Résultat attendu** :
  - Les opérations sont **acceptées** — **mêmes droits** que le coach permanent le
    jour J (R16, spec #1 R27). L'écran reflète l'état à jour (R18).
- **RLS / sécurité** : le coach temporaire **ne voit pas** l'écran des jetons
  `/coach/jetons` (réservé au permanent) et ne peut **pas** générer de QR (spec #5 R16).

### CT-09 `[auto]` — Coach temporaire borné à SA rencontre   (couvre : spec #1 R27 ; négatif)

- **Rôle / compte** : coach temporaire (Club A).
- **Pré-condition** : créer (admin) une **2ᵉ rencontre** Club A ; noter son `id`.
- **Étapes** :
  1. Session temp. ouverte, visiter `/coach/rencontres/<id-2e-rencontre>`.
- **Résultat attendu** :
  - **404** : la session temporaire ne couvre que la rencontre de son jeton.
  - Sur `/coach`, **seule** la rencontre de son jeton est listée.

### CT-10 `[auto]` — Gel de l'engagement en compétition   (couvre : R16, R17 ; spec #1 R6, R27 ; gel)

- **Pré-condition** : phase **`competition`**.
- **Étapes** :
  1. **Coach permanent** : ouvrir la rencontre.
  2. **Coach temporaire** (session encore active) : ouvrir la rencontre.
  3. **Admin** : corriger l'engagement (ex. retirer un grimpeur) via l'IHM/SQL.
- **Résultat attendu** :
  - Étapes 1 & 2 : l'écran est en **lecture seule** — **aucun formulaire**
    (création/ajout/retrait/groupe) n'est affiché (R17) ; une note « phase sans
    édition » est visible.
  - Toute écriture directe d'un coach (permanent **ou** temporaire) sur `equipe`/
    `composition` est **refusée par la RLS** (R16, spec #1 R6/R27).
  - Étape 3 : **seul l'admin** peut encore modifier l'engagement.

### CT-11 `[auto]` — Gel dès la pré-compétition pour le coach temporaire   (couvre : R16, spec #1 R28 ; négatif)

- **Pré-condition** : phase **`pre_competition`**.
- **Étapes** :
  1. Tenter d'ouvrir une session coach temp. via `/scan?jeton=aaaaaaaa-…`.
- **Résultat attendu** :
  - **Refusé** : le jeton coach temp. n'est **pas** valide en pré-compétition
    (fenêtre = préparation + compétition, R12). Aucune édition temp. possible avant
    le jour J.

### CT-12 `[auto]` — Lecture seule : rencontre terminée (permanent)   (couvre : R17 ; cas limite)

- **Rôle / compte** : `coach@test.local`.
- **Pré-condition** : phase `cloture` puis `resultats_publics`.
- **Étapes** :
  1. Ouvrir la rencontre depuis `/coach`.
- **Résultat attendu** :
  - Badge de phase « Clôture » / « Résultats publics », écran **consultable**,
    **aucun formulaire** (R17). Le badge reflète la phase (lecture seule).

### CT-13 `[auto]` — Périmètre inter-club interdit   (couvre : R2 ; spec #1 R16 ; RLS négative)

- **Rôle / compte** : `coach@test.local` (Club A).
- **Étapes** :
  1. Sur l'écran d'engagement, vérifier les équipes affichées.
  2. Tenter (POST direct / SQL sous le rôle coach A) d'ajouter un grimpeur à
     l'équipe **B1** (Club B).
- **Résultat attendu** :
  - Seules les équipes **du Club A** sont visibles/éditables ; l'équipe B1 n'apparaît
    pas côté coach A.
  - L'écriture sur une équipe d'un autre club est **refusée par la RLS** (R2).

## Registre d'exécution

> **Testeur** : `agent/playwright` pour un passage machine, un nom pour un passage
> humain. Un cas `[mixte]` n'est **✅ complet** que si sa part `auto` (agent) **et**
> sa part `manuel` (humain) sont passées (cf. convention 06 §5).

| Date | Testeur | Version/commit | Cas | Marque | Résultat | Remarque |
|------|---------|----------------|-----|--------|----------|----------|
| | | | CT-01 | auto | ✅ / ❌ | IHM |
| | | | CT-02 | auto | ✅ / ❌ | IHM |
| | | | CT-03 | auto | ✅ / ❌ | IHM (enfant) |
| | | | CT-04 | auto | ✅ / ❌ | IHM |
| | | | CT-05 | mixte | ✅ / ❌ | auto: SQL admin + badge ; manuel: couleur violette |
| | | | CT-06 | auto | ✅ / ❌ | garde-fou date |
| | | | CT-07 | auto | ✅ / ❌ | session QR prépa |
| | | | CT-08 | auto | ✅ / ❌ | coach temp édite |
| | | | CT-09 | auto | ✅ / ❌ | bornage rencontre |
| | | | CT-10 | auto | ✅ / ❌ | gel compétition |
| | | | CT-11 | auto | ✅ / ❌ | gel pré-compétition |
| | | | CT-12 | auto | ✅ / ❌ | lecture seule |
| | | | CT-13 | auto | ✅ / ❌ | RLS inter-club |
