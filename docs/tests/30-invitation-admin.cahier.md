# Cahier de test : Invitation administrateur (spec #2 R35–R40)

> Couvre l'**invitation administrateur** : génération d'un QR/URL à usage unique,
> valable 15 minutes, sur l'écran « Mapping de rôle » (`/admin/mapping`) ;
> inscription par l'écran public `/inscription?invitation_admin=…` ; compte créé
> avec le rôle **admin**. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R35–R40, rév. 2026-10-09 — TODO D7 ; R3, R4, R30, R32).
- **Migration** : `202610091300_invitation_admin` (table `invitation_admin`, RLS
  admin, RPC `finaliser_inscription_admin` réservée à `service_role`).
- **Automatisé** : `e2e/invitation-admin.spec.ts` (CT-01 à CT-08) et
  `e2e/securite-appels-directs.spec.ts` (CT-09 = cahier 28 CT-05b). Domaine pur :
  `src/domaine/invitation-admin.test.ts` (état, durée, temps restant, droits).
- **Pré-requis** :
  - Stack Supabase **locale** démarrée, migrations jouées (dont
    **`202610091300`**), seed `01-jeu-de-test.sql` chargé.
  - `.env.local` avec **`SUPABASE_SERVICE_ROLE_KEY`**.
  - App lancée : `npm run dev` (port 3011).
  - Un **second navigateur** (ou une fenêtre privée) pour la personne invitée.
- **Environnement** : local (stack Docker) / recette — version/commit : `______`

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| `admin@test.local` (mdp `interclub`) | admin | Génère, révoque, régénère |
| `coach@test.local` (mdp `interclub`) | coach Club A | Négatif : pas d'accès à l'écran |
| Nouvel e-mail (ex. `admin2@test.local`) | — | Personne invitée |

## Cas de test

### CT-01 — Génération d'une invitation   (couvre : R35, R40 ; nominal)

- **Rôle / compte** : `admin@test.local`.
- **Étapes** : ouvrir `/admin/mapping` ; dans « Inviter un administrateur »,
  cliquer « **Générer une invitation** ».
- **Résultat attendu** : état « **Valable** », décompte « expire dans 15:00 »
  qui diminue chaque seconde, **QR** et **URL**
  `…/inscription?invitation_admin=<uuid>`, boutons « Régénérer l'invitation » et
  « Révoquer ».

### CT-02 — Inscription via l'invitation   (couvre : R36, R38, R30 ; nominal)

- **Rôle / compte** : personne invitée (second navigateur, non connecté).
- **Étapes** : scanner le QR (ou ouvrir l'URL) ; l'écran « Créer votre compte
  administrateur » s'affiche ; saisir un e-mail neuf, le mot de passe deux fois,
  valider ; se connecter avec ce compte.
- **Résultat attendu** : arrivée sur `/connexion` (message de compte créé), puis
  sur `/admin` après connexion ; le compte apparaît en **admin**, sans club, dans
  « Mappings existants ».

### CT-03 — Usage unique   (couvre : R36, R40 ; négatif)

- **Rôle / compte** : `admin@test.local`, puis anonyme.
- **Étapes** : après CT-02, recharger `/admin/mapping` ; rouvrir l'URL de
  l'invitation dans un navigateur non connecté.
- **Résultat attendu** : état « **Utilisée** », plus de QR ; l'URL affiche
  « **Invitation invalide** », aucun formulaire.

### CT-04 — Régénération : l'ancienne est invalidée   (couvre : R37 ; négatif)

- **Rôle / compte** : `admin@test.local`, puis anonyme.
- **Étapes** : générer une invitation, noter l'URL, cliquer « Régénérer
  l'invitation » ; ouvrir l'**ancienne** URL puis la **nouvelle**.
- **Résultat attendu** : ancienne → « Invitation invalide » ; nouvelle →
  formulaire d'inscription administrateur.

### CT-05 — Révocation   (couvre : R37 ; négatif)

- **Rôle / compte** : `admin@test.local`, puis anonyme.
- **Étapes** : générer une invitation, cliquer « **Révoquer** », ouvrir l'URL.
- **Résultat attendu** : état « **Révoquée** », plus de QR ; l'URL →
  « Invitation invalide ».

### CT-06 — Expiration après 15 minutes   (couvre : R36, R40 ; négatif)

- **Rôle / compte** : `admin@test.local`, puis anonyme.
- **Étapes** : générer une invitation et attendre **15 minutes** (ou, en local,
  avancer l'échéance :
  `update interclub.invitation_admin set expire_le = now() - interval '1 second' where actif;`).
- **Résultat attendu** : à zéro, le décompte laisse place à « **Expirée** » sans
  recharger ; le QR disparaît ; l'URL → « Invitation invalide ».

### CT-07 — Formulaire envoyé après l'expiration   (couvre : R39 ; négatif)

- **Rôle / compte** : personne invitée.
- **Étapes** : ouvrir le formulaire pendant la validité ; laisser l'invitation
  expirer (ou SQL ci-dessus) ; remplir et envoyer.
- **Résultat attendu** : message « Cette invitation a expiré ou a déjà été
  utilisée… » ; **aucun** compte créé.

### CT-08 — Deux inscriptions sur la même invitation   (couvre : R38 ; négatif)

- **Rôle / compte** : deux navigateurs non connectés.
- **Étapes** : ouvrir l'URL dans les deux ; s'inscrire dans le premier, puis
  envoyer le formulaire du second avec un autre e-mail.
- **Résultat attendu** : un **seul** compte créé (le premier) ; le second reçoit
  le message d'invitation expirée ou déjà utilisée, sans compte créé.

### CT-09 — Consommation réservée au serveur   (couvre : R38, sécurité ; négatif)

- **Rôle / compte** : clé `anon`, puis jetons de `coach@test.local` et de
  `admin@test.local`.
- **Étapes** : appeler directement la RPC
  `POST /rest/v1/rpc/finaliser_inscription_admin` (en-tête
  `Content-Profile: interclub`).
- **Résultat attendu** : **refus de privilège** (`42501`) dans les trois cas,
  même pour l'admin : seul le serveur (`service_role`) consomme une invitation.

### CT-10 — Écran réservé à l'admin   (couvre : R35 ; négatif)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** : ouvrir `/admin/mapping` ; tenter un `insert` direct dans
  `invitation_admin` avec le jeton du coach.
- **Résultat attendu** : **404** ; écriture refusée par la RLS.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-10-09 | Playwright e2e | develop | CT-01 → CT-08 | ✅ | `invitation-admin.spec.ts` (expiration simulée en SQL) |
| 2026-10-09 | Playwright e2e | develop | CT-09 | ✅ | `securite-appels-directs.spec.ts` CT-05b |
| 2026-10-09 | agent | `local` | Migration | ✅ | 2 passes, transaction de contrôle annulée : usage unique, une seule active, expirée/révoquée refusées, RPC `service_role` seul, `utilisee_le` non modifiable par `authenticated` |
| | | | CT-06 (15 min réelles) | ✅ / ❌ | recette |
| | | | CT-10 | ✅ / ❌ | recette |
