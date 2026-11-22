# Cahier de test : Réinitialisation du mot de passe (spec #2 R48–R53)

> Couvre le **mot de passe oublié** d'un compte permanent : lien « Mot de passe
> oublié ? » de la connexion, demande par e-mail (`/mot-de-passe-oublie`), lien
> reçu par e-mail (`/auth/confirm?token_hash=…&type=recovery`), écran « Nouveau
> mot de passe » (`/mot-de-passe/nouveau`). Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/02-authentification-et-sessions-qr.md`
  (R48–R53, rév. 2026-11-22 ; R5, R30).
- **Migration** : aucune.
- **Configuration Supabase** (pas une migration — réglages du Dashboard, à
  faire **à la main** sur chaque projet ; en local, `supabase/config.toml`) :
  - **Authentication → URL Configuration → Site URL** = l'URL de l'application
    de l'environnement (prod : `https://interclub-virid.vercel.app`) : le lien
    de l'e-mail est construit dessus.
  - **Authentication → Emails → « Reset password »** : sujet « Réinitialisation
    de votre mot de passe — Interclub », corps recopié de
    `supabase/templates/reinitialisation-mot-de-passe.html` (lien
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`).
  - **Authentication → Providers → Email → Email OTP Expiration** = `3600`
    secondes (1 heure, R50).
  - **SMTP** : un serveur d'envoi personnalisé est recommandé (l'envoi par
    défaut de Supabase est limité à quelques e-mails par heure).
- **Automatisé** : `e2e/reinitialisation-mot-de-passe.spec.ts` (CT-01 à CT-07,
  boîte de test Mailpit locale). Domaine pur :
  `src/domaine/reinitialisation-mot-de-passe.test.ts`.
- **Pré-requis** :
  - Stack Supabase **locale** démarrée (après modification de `config.toml` :
    `supabase stop` puis `supabase start`), seed `01-jeu-de-test.sql` chargé.
  - Boîte de test **Mailpit** : <http://127.0.0.1:54324> (local uniquement).
  - App lancée : `npm run dev` (port 3011).
- **Environnement** : local (stack Docker) / recette / prod — version/commit :
  `______`

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| `coach2@test.local` (mdp `interclub`) | coach Club A | Compte qui réinitialise (local) ; mot de passe remis au seed après les tests |
| `inconnu-e2e@test.local` | — | Adresse sans compte (R49) |
| Un compte réel de l'environnement | admin ou coach | CT-08 / CT-09 (recette, prod) |

## Cas de test

### CT-01 — Parcours nominal   (couvre : R48, R50, R51 ; nominal) `[auto]`

- **Étapes** :
  1. `/connexion` → cliquer **« Mot de passe oublié ? »**.
  2. Saisir `coach2@test.local` → **« Recevoir le lien »**.
  3. Ouvrir l'e-mail dans Mailpit, cliquer **« Choisir un nouveau mot de
     passe »**.
  4. Saisir deux fois un nouveau mot de passe → **« Enregistrer »**.
  5. Se déconnecter ; se reconnecter avec l'**ancien** puis le **nouveau** mot
     de passe.
- **Résultat attendu** : (2) message « Si un compte existe pour cette adresse,
  un e-mail vient de lui être envoyé. Le lien est valable 1 heure. » ; (3)
  l'écran « Nouveau mot de passe » s'ouvre ; (4) arrivée **connecté** sur
  `/coach` ; (5) l'ancien mot de passe est refusé (« Identifiants invalides. »),
  le nouveau mène à `/coach`.

### CT-02 — Adresse inconnue   (couvre : R49) `[auto]`

- **Étapes** : demander une réinitialisation pour `inconnu-e2e@test.local`.
- **Résultat attendu** : **le même message** qu'en CT-01 ; **aucun e-mail**
  n'arrive dans Mailpit.

### CT-03 — Adresse mal formée   (couvre : R49) `[auto]`

- **Étapes** : demander une réinitialisation pour `pas@valide`.
- **Résultat attendu** : « L'e-mail n'est pas valide. », aucun envoi.

### CT-04 — Nouveau mot de passe refusé, lien conservé   (couvre : R51, R52) `[auto]`

- **Étapes** : depuis le lien reçu, saisir `abcde` (×2), puis deux saisies
  différentes, puis un mot de passe valide (×2).
- **Résultat attendu** : « Le mot de passe doit contenir au moins 6
  caractères. », puis « Les deux mots de passe ne correspondent pas. » ; le
  troisième essai **réussit** avec le même lien (arrivée sur `/coach`).

### CT-05 — Lien ouvert par un robot, puis réutilisé   (couvre : R52) `[auto]`

- **Étapes** :
  1. Ouvrir le lien reçu **une première fois** sans rien saisir (simule l'analyse
     d'une messagerie), puis l'ouvrir à nouveau et enregistrer un nouveau mot de
     passe.
  2. Ouvrir **le même lien** dans un autre navigateur et enregistrer un autre
     mot de passe.
- **Résultat attendu** : (1) l'enregistrement **réussit** malgré la première
  ouverture ; (2) « Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau
  lien. » avec le lien **« Demander un nouveau lien »** ; le mot de passe de
  l'étape 1 reste valable.

### CT-06 — Lien invalide   (couvre : R52) `[auto]`

- **Étapes** : ouvrir `/auth/confirm?token_hash=pasvalide&type=recovery`,
  saisir un nouveau mot de passe (×2).
- **Résultat attendu** : message « lien expiré ou déjà utilisé » ; mot de passe
  **inchangé** en base.

### CT-07 — Écran réservé au lien   (couvre : R53) `[auto]`

- **Étapes** :
  1. Non connecté, ouvrir `/mot-de-passe/nouveau` (sans lien).
  2. Connecté en `coach2@test.local`, ouvrir `/mot-de-passe/nouveau`.
  3. Connecté, ouvrir `/mot-de-passe/nouveau?token_hash=x`, vider le champ caché
     du lien, enregistrer un mot de passe (appel direct sans lien).
- **Résultat attendu** : (1) renvoi vers `/mot-de-passe-oublie` ; (2) renvoi
  vers la demande puis vers l'espace coach — l'écran ne s'affiche pas ; (3)
  « lien expiré ou déjà utilisé », mot de passe **inchangé**.

### CT-08 — E-mail réel et autre appareil   (couvre : R50, R51) `[manuel]`

- **Environnement** : recette, puis prod (configuration ci-dessus faite).
- **Étapes** :
  1. Sur un **ordinateur**, demander la réinitialisation pour un compte réel.
  2. Ouvrir l'e-mail sur un **téléphone** (autre appareil) et suivre le lien.
  3. Enregistrer un nouveau mot de passe.
- **Résultat attendu** : l'e-mail arrive (vérifier aussi les indésirables),
  sujet et texte **en français**, expéditeur attendu ; le lien pointe vers
  l'**URL de l'environnement** (pas `localhost`) ; sur le téléphone, l'écran
  « Nouveau mot de passe » s'ouvre, l'enregistrement mène **connecté** à
  l'espace du rôle. Vérifier à l'œil : lisibilité de l'e-mail et de l'écran sur
  mobile.

### CT-09 — Lien expiré après 1 heure   (couvre : R50, R52) `[manuel]`

- **Environnement** : recette.
- **Étapes** : demander un lien, attendre **plus d'une heure**, l'utiliser.
- **Résultat attendu** : « lien expiré ou déjà utilisé », proposition de
  demander un nouveau lien ; mot de passe inchangé.

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
| | | | CT-09 | ✅ / ❌ | |
| 2026-11-22 | agent/playwright (local) | develop (non commité) | CT-01 → CT-07 | ✅ (local) | `e2e/reinitialisation-mot-de-passe.spec.ts` (7 tests, chromium et mobile) ; e-mails lus dans Mailpit ; CT-08/CT-09 manuels en recette puis prod |
