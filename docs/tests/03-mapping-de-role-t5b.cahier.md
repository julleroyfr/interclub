# Cahier de test : Mapping de rôle — écran admin (T5b)

> Couvre la tranche **T5b** : l'écran d'administration `/admin/mapping` où l'admin
> attribue un rôle applicatif (et un club pour un coach) à un compte existant.
> Règles dans [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R1–R5 : mapping de rôle ; R41–R46 : suppression d'un compte, rév. 2026-10-16) ; `docs/specs/01-roles-et-autorisations.md` (R4, R10).
- **Décision d'architecture** :
  [ADR 0002](../decisions/0002-liste-des-comptes-via-cle-service.md) — lecture des
  comptes / clubs via la clé `service_role`, écriture via RLS.
- **Pré-requis** :
  - Stack Supabase **locale** démarrée (`supabase start`) migrations jouées
    (`supabase db reset`, dont `202607221200`, `202607221300` et
    **`202607221400`** — grants `service_role` sans lesquels l'écran renvoie
    `42501 permission denied`).
  - `.env.local` pointant sur la stack locale, avec **`SUPABASE_SERVICE_ROLE_KEY`**
    renseigné (valeur `service_role` de `supabase status`). Sans cette clé,
    l'écran `/admin/mapping` renvoie une erreur (lecture des comptes indisponible).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Fourni par le **seed** `supabase/seed/01-jeu-de-test.sql`, chargé par
`supabase db reset` :

- Club « Club A ».
- 3 comptes Auth confirmés, **mot de passe commun : `interclub`** :
  `admin@test.local` (rôle admin), `coach@test.local` (coach, Club A),
  `sansmapping@test.local` (**aucun mapping** → cible des attributions ci-dessous).

> Certains cas **modifient** le mapping de `sansmapping@test.local`. Pour rejouer
> le cahier à l'identique, relancer `supabase db reset` avant une nouvelle passe
> (ou supprimer manuellement la ligne créée dans `interclub.compte`).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@test.local` | admin | Accède à `/admin/mapping`, attribue les rôles |
| `coach@test.local` | coach (Club A) | Non-admin : doit être refusé sur l'écran (négatif) |
| `sansmapping@test.local` | (aucun) | Compte **cible** des attributions (R5 → rôle) |

## Automatisation partielle

Les cas exigeant un **contournement de l'écran** (appel API direct) sont
automatisés par `scripts/test-t5b.sh` — RLS d'écriture et contrainte R3 :

```bash
npm run test:t5b        # (ou : bash scripts/test-t5b.sh)
```

Pré-requis : `supabase start` puis `supabase db reset` (charge le seed **et** la
migration `202607221400`). Le script couvre **CT-07** (non-admin ne peut pas
écrire, R4/R5) et **CT-05** au niveau base (contrainte `chk_compte_role_club`,
R3) ; aucune de ces écritures n'aboutit, l'état n'est donc pas modifié. Les cas
**UI** (CT-01..04, CT-06, CT-08) restent à dérouler à la main.

## Cas de test

### CT-01 — L'admin voit l'écran de mapping   (couvre : R4 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : connecté ; `SUPABASE_SERVICE_ROLE_KEY` renseigné.
- **Étapes** :
  1. Depuis l'accueil, cliquer « Administrer les rôles » (ou aller `/admin/mapping`).
- **Résultat attendu** : l'écran s'affiche ; le sélecteur **Compte** liste les
  3 comptes de test (par e-mail) ; le sélecteur **Club** liste « Club A » ; le
  tableau « Comptes » montre `admin@test.local` (admin, « (vous) »),
  `coach@test.local` (coach / Club A) et `sansmapping@test.local` (« sans
  rôle »). Aucun compte anonyme (session QR) n'y figure (R46).
- **RLS / sécurité** : la liste des comptes provient du client `service_role`
  côté serveur (ADR 0002), jamais exposé au navigateur.

### CT-02 — Attribuer le rôle coach + club   (couvre : R1, R3, R4 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : `sansmapping@test.local` sans mapping.
- **Étapes** :
  1. Sur `/admin/mapping`, choisir le compte `sansmapping@test.local`.
  2. Sélectionner le rôle **Coach**.
  3. Choisir le club **Club A**, valider « Attribuer ».
- **Résultat attendu** : message « Rôle attribué. » ; le tableau « Mappings
  existants » affiche désormais `sansmapping@test.local` → coach / Club A.
- **Vérif base** (facultatif) :
  `select role, club_id from interclub.compte where utilisateur_id = (select id from auth.users where email='sansmapping@test.local');`
  → `role = coach`, `club_id` = id de Club A.

### CT-03 — Attribuer le rôle admin (sans club)   (couvre : R1, R3 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : rejouer sur `sansmapping@test.local` (après `db reset` ou en
  ré-attribuant).
- **Étapes** :
  1. Choisir `sansmapping@test.local`, rôle **Admin**.
  2. Constater que **le sélecteur Club disparaît** (un admin n'a pas de club, R3).
  3. Valider.
- **Résultat attendu** : « Rôle attribué. » ; le tableau montre le compte en
  **admin** avec club « — ». En base, `club_id is null` (contrainte
  `chk_compte_role_club`).

### CT-04 — Changer un mapping existant   (couvre : R4 ; nominal, mise à jour)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Re-sélectionner un compte **déjà mappé** (p. ex. celui de CT-02), changer son
     rôle/club, valider.
- **Résultat attendu** : le mapping est **mis à jour** (pas de doublon) ; une seule
  ligne pour ce compte dans `interclub.compte` (upsert sur `utilisateur_id`).

### CT-05 — Coach sans club refusé   (couvre : R3 ; cas erreur)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Choisir un compte, rôle **Coach**, **ne pas** choisir de club.
  2. Tenter de valider.
- **Résultat attendu** : la soumission est **bloquée** (champ Club requis). Si
  contournée (POST direct sans club), la Server Action répond « Un coach doit être
  rattaché à un club (R3). » et **aucune** ligne n'est écrite.

### CT-06 — Un non-admin ne peut pas ouvrir l'écran   (couvre : R4 ; négatif)

- **Rôle / compte** : `coach@test.local` (puis `sansmapping@test.local`).
- **Étapes** :
  1. Connecté en coach, aller directement sur `/admin/mapping`.
- **Résultat attendu** : page **introuvable (404)** — l'existence de l'écran n'est
  pas révélée (`notFound()`). L'accueil du coach n'affiche pas « Administrer les
  rôles ».

### CT-07 — RLS : un non-admin ne peut pas écrire un mapping   (couvre : R4 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** (contournement de l'UI) :
  1. Avec le jeton du coach, tenter un `upsert`/`insert` sur `interclub.compte`
     (POST direct de la Server Action, ou appel `/rest/v1/compte`).
- **Résultat attendu** : **refusé**. Côté Server Action : « Seul un administrateur
  peut attribuer un rôle (R4). » Côté base : la policy admin rejette l'écriture même
  si la garde applicative était contournée (défense en profondeur, ADR 0002).

### CT-08 — Le compte mappé obtient ses droits   (couvre : R5 → attribution)

- **Rôle / compte** : le compte cible de CT-02 (`sansmapping@test.local` devenu
  coach).
- **Étapes** :
  1. Se déconnecter, se reconnecter avec ce compte.
- **Résultat attendu** : l'accueil affiche « Rôle : coach » (avant l'attribution il
  affichait « aucun rôle attribué », R5 fail-closed). Le mapping prend effet.

### CT-09 — Supprimer un compte coach   (couvre : R41, R42, R43 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : `coach@test.local` existe, coach du Club A.
- **Étapes** :
  1. Sur `/admin/mapping`, ligne `coach@test.local`, cliquer **Supprimer**.
  2. Vérifier la confirmation (e-mail rappelé, « Suppression définitive »),
     cliquer **Supprimer définitivement**.
  3. Dans une autre fenêtre, tenter de se connecter avec `coach@test.local`.
- **Résultat attendu** : « Compte supprimé. » ; la ligne disparaît du tableau et
  du sélecteur **Compte** ; la connexion échoue (identifiants invalides).
- **Vérif base** : `select count(*) from auth.users where email='coach@test.local';`
  → 0 ; aucune ligne `interclub.compte` orpheline.

### CT-10 — Annuler la confirmation   (couvre : R42 ; négatif)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** : cliquer **Supprimer** sur un compte, puis **Annuler** (ou Échap).
- **Résultat attendu** : la confirmation se ferme ; le compte est toujours listé.

### CT-11 — Supprimer un autre admin et un compte sans rôle   (couvre : R41 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : un second admin existe (cf. CT-03 ou invitation
  administrateur), `sansmapping@test.local` sans rôle.
- **Étapes** : supprimer le second admin, puis `sansmapping@test.local`.
- **Résultat attendu** : les deux suppressions réussissent ; `admin@test.local`
  reste admin et garde l'accès à l'écran.

### CT-12 — Pas de suppression de son propre compte   (couvre : R41, R45 ; négatif)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** :
  1. Constater que sa ligne affiche « (vous) » sans bouton **Supprimer**.
  2. (Contournement) Rejouer le POST de la Server Action `supprimerCompte` avec
     son propre `utilisateurId` (DevTools → copier la requête d'une autre
     suppression, changer l'id).
- **Résultat attendu** : « Vous ne pouvez pas supprimer votre propre compte. » ;
  rien n'est supprimé.

### CT-13 — Compte déjà supprimé   (couvre : R45 ; cas limite)

- **Rôle / compte** : `admin@test.local` dans **deux onglets**.
- **Étapes** : ouvrir la confirmation sur le même compte dans les deux onglets ;
  confirmer dans le premier, puis dans le second.
- **Résultat attendu** : le premier affiche « Compte supprimé. » ; le second
  « Compte introuvable : il a peut-être déjà été supprimé. ».

### CT-14 — Données conservées, session coupée   (couvre : R43, R44)

- **Rôle / compte** : `admin@test.local` + un coach ayant **saisi des
  résultats** (connecté dans un autre navigateur).
- **Étapes** :
  1. Supprimer ce coach depuis `/admin/mapping`.
  2. Dans le navigateur du coach, recharger son espace.
  3. Ouvrir le classement / contrôle de la rencontre concernée.
- **Résultat attendu** : le coach n'a plus aucun droit (accueil « aucun rôle »
  ou retour à la connexion) ; les résultats qu'il avait saisis sont **toujours
  présents** dans le classement ; l'auteur éventuellement affiché est « — ».
- **Vérif base** : noter avant suppression
  `select count(*) from interclub.resultat_voie where auteur_utilisateur_id = '<id du coach>';`
  (idem `resultat_bloc`) ; après suppression, ces lignes existent toujours avec
  `auteur_utilisateur_id is null`.

### CT-15 — Un non-admin ne peut pas supprimer   (couvre : R45 ; négatif)

- **Rôle / compte** : `coach@test.local` (avant CT-09, ou un autre coach).
- **Étapes** (contournement) : rejouer le POST de la Server Action
  `supprimerCompte` avec la session du coach.
- **Résultat attendu** : « Seul un administrateur peut supprimer un compte. » ;
  rien n'est supprimé.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-07-22 | julleroyfr | `57cc179` | CT-01 | ✅ | IHM |
| 2026-07-22 | julleroyfr | `57cc179` | CT-02 | ✅ | IHM |
| 2026-07-22 | julleroyfr | `57cc179` | CT-03 | ✅ | IHM |
| 2026-07-22 | julleroyfr | `57cc179` | CT-04 | ✅ | IHM |
| 2026-07-22 | julleroyfr | `57cc179` | CT-05 | ✅ | IHM ; aussi `test:t5b` (contrainte R3) |
| 2026-07-22 | julleroyfr | `57cc179` | CT-06 | ✅ | IHM (404 non-admin) |
| | | | CT-07 | ⏳ | à exécuter : `npm run test:t5b` (RLS écriture) |
| 2026-07-22 | julleroyfr | `57cc179` | CT-08 | ✅ | IHM |
| | | | CT-09 | ⏳ | suppression de compte (R41–R46) |
| | | | CT-10 | ⏳ | suppression de compte (R41–R46) |
| | | | CT-11 | ⏳ | suppression de compte (R41–R46) |
| | | | CT-12 | ⏳ | suppression de compte (R41–R46) |
| | | | CT-13 | ⏳ | suppression de compte (R41–R46) |
| | | | CT-14 | ⏳ | suppression de compte (R41–R46) |
| | | | CT-15 | ⏳ | suppression de compte (R41–R46) |
