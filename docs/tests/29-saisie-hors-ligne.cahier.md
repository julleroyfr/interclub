# Cahier de test : Saisie hors ligne (spec #17)

> Le coach (voie, bloc) et le juge (vitesse) voient leur saisie **dès le clic**,
> « en attente » ; la requête part ensuite et la réponse la confirme
> (« enregistré ») ou la rejette (retour à la valeur du serveur + motif). Le
> ressenti se vérifie sur la **recette** (latence réelle), de préférence sur
> téléphone. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/17-saisie-hors-ligne.md` (lot 1 : R13, R18,
  R22, R23 — CT-01 à CT-06 ; lot 2 : R6–R12, R14–R20, R24–R28 — CT-07 à CT-14) ;
  spec #6 R13bis/R20bis, spec #9 R6, spec #10 R11bis/R14bis ; maquette
  `docs/maquettes/saisie-hors-ligne.html` (tous les écrans).
- **Migrations** : `202610091000_enregistrement_saisie_un_appel` et
  `202610091100_heure_saisie` appliquées.
- **Automatisé** : CT-07 à CT-10 rejoués par l'E2E `e2e/saisie-hors-ligne.spec.ts` ;
  règles de base (R7–R11, R19, R20) par `npm run test:heure-saisie`.
- **Pré-requis** : rencontre pilote en **③ compétition** ; comptes du jeu de test ;
  DevTools → **Network** pour CT-03 et CT-05 (limitation « Slow 4G » recommandée
  pour rendre l'attente visible).
- **Environnement** : recette (déploiement de branche Netlify) ou local —
  version/commit : `______`

## Jeu de données initial

- Rencontre pilote (`33333333-…`, enfant) en ③, épreuves voie / bloc / vitesse
  seedées ; Bob Alpha (Club A, groupe de départ T1) sans résultat.
- Rencontre ado (`adadadad-…`) en ③ pour CT-04.

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `coach@test.local` | coach permanent Club A | Saisie voie / bloc (CT-01 à CT-04) |
| `admin@test.local` | administrateur | Correction plus récente (CT-03) |
| Jeton QR juge | juge | Saisie vitesse (CT-05, CT-06) |

## Cas de test

### CT-01 — Voie : affichage immédiat puis « enregistré » (couvre : R22, R23, spec #6 R20bis)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** :
  1. Saisie des résultats → **Bob Alpha** → voie **T1** → **Top**.
- **Résultat attendu** :
  - la pastille « Top » apparaît **immédiatement**, en pointillé, avec la mention
    **⏳ En attente** ; le compteur de voies passe aussitôt à **1/3** ;
  - à la réponse du serveur, la pastille devient pleine et **✓ Enregistré**
    s'affiche environ 2 s ; le score est mis à jour ;
  - les mentions comportent une **icône et un texte** (pas seulement une couleur).

### CT-02 — Enchaînement rapide sans perte (couvre : R22, spec #6 R13)

- **Rôle / compte** : `coach@test.local`.
- **Étapes** :
  1. Sur Bob Alpha, cliquer très vite **T2 → Prise valorisée**, **T3 → Échec**,
     **B1 → 1er essai**, puis **T2 → Top** (correction).
  2. Attendre la disparition de toutes les mentions « en attente ».
  3. Recharger la page.
- **Résultat attendu** : chaque saisie s'affiche dès son clic ; aucune valeur ne
  « clignote » vers l'ancienne ; après rechargement : T1 Top, T2 **Top**, T3
  Échec, B1 1er essai (la correction a remplacé, un seul résultat par voie).

### CT-03 — Rejet : retour à la valeur du serveur + motif (couvre : R18, R22, R23)

- **Rôles** : `coach@test.local` + `admin@test.local`.
- **Étapes** :
  1. Fenêtre **admin** : passer la rencontre en **④ clôture** (sans recharger
     l'écran du coach).
  2. Fenêtre **coach** (écran resté ouvert) : saisir **B2 → Échec** pour Bob.
- **Résultat attendu** : « Échec » s'affiche aussitôt « en attente », puis la
  saisie est **rejetée** : la pastille revient à la valeur du serveur (vide),
  **⚠ Rejetée** et le message « La compétition est clôturée : cette saisie n'a
  pas été enregistrée. Signalez-la à l'organisateur. » (R20) s'affichent sous le
  bloc ; la saisie figure dans la liste des **rejetées** (bandeau → **Voir**).
  Remettre la rencontre en ③ après le cas.

### CT-04 — Ado : ajout et retrait d'une voie (couvre : R22, spec #6 R11/R14)

- **Rôle / compte** : `coach@test.local`, rencontre **ado**.
- **Étapes** :
  1. Grimpeur ado → **Ajouter une voie** → choisir une voie → **Zone 1**.
  2. Sur la voie ajoutée → **×** (retrait).
- **Résultat attendu** : la voie apparaît **immédiatement** dans la liste, triée
  par niveau, « en attente », compteur `n/6` incrémenté ; le retrait la fait
  disparaître aussitôt et décrémente le compteur ; après rechargement, l'état
  correspond.

### CT-05 — Juge : temps affiché aussitôt, compteurs à jour (couvre : R22, R23, spec #10 R14bis)

- **Rôle / compte** : jeton QR juge (`/scan?jeton=…`).
- **Étapes** :
  1. Saisir **8,123** pour un grimpeur, valider avec **Entrée**.
  2. Saisir une **Chute** pour un autre.
- **Résultat attendu** : le temps « 8,123 s » s'affiche **immédiatement**
  (pointillé, **⏳ En attente**), le compteur Femmes/Hommes et le filtre
  « À saisir (n) » sont mis à jour sans attendre ; puis **✓ Enregistré**.

### CT-06 — Juge : saisie invalide refusée sur l'appareil (couvre : R13)

- **Rôle / compte** : jeton QR juge.
- **Étapes** :
  1. Saisir **0** puis **OK** ; puis **abc** puis **OK** ; puis champ vide + **OK**.
- **Résultat attendu** : rien ne s'affiche « en attente » ; un message
  « Un temps chronométré doit être une durée strictement positive, en
  secondes. » apparaît **immédiatement** ; **aucune requête** n'est envoyée
  (Network vide) ; la valeur affichée reste celle du serveur.

### CT-07 `[auto]` — Hors ligne : saisie conservée, envoyée au retour du réseau (couvre : R12, R15, R16, R24)

- **Rôle / compte** : `coach@test.local` sur **téléphone** (mode avion).
- **Étapes** :
  1. Ouvrir la saisie de Bob Alpha (réseau présent), puis activer le **mode avion**.
  2. Saisir **T1 → Top** et **T2 → Échec**.
  3. Désactiver le mode avion.
- **Résultat attendu** : (2) les deux issues s'affichent aussitôt « ⏳ En
  attente » ; le bandeau indique **« Hors ligne · 2 saisies en attente »** ;
  (3) sans action, les deux saisies passent « ✓ Enregistré », le bandeau
  disparaît ; en base (ou après rechargement) T1 = Top, T2 = Échec.

### CT-08 `[auto]` — Rechargement / fermeture : saisies conservées (couvre : R12, R28)

- **Rôle / compte** : `coach@test.local` (téléphone).
- **Étapes** :
  1. Mode avion ; saisir **T3 → Échec**.
  2. Tenter de **recharger** (ou fermer l'onglet).
  3. Accepter ; puis désactiver le mode avion et rouvrir l'écran de saisie.
- **Résultat attendu** : (2) le navigateur **demande confirmation** ; (3) à la
  réouverture, la saisie T3 est toujours affichée « en attente » puis envoyée
  automatiquement.

### CT-09 `[auto]` — Correction plus récente : saisie hors ligne rejetée (couvre : R9, R18, R26)

- **Rôles** : `coach@test.local` (téléphone) + `admin@test.local`.
- **Étapes** :
  1. Coach : mode avion ; saisir **T1 → Échec**.
  2. Admin : saisie admin, même grimpeur, **T1 → Top**.
  3. Coach : désactiver le mode avion.
  4. Coach : bandeau → **Voir** ; onglet **Rejetées** ; **Retirer de la liste**.
- **Résultat attendu** : (3) T1 reste **Top** (correction admin conservée) ; la
  ligne T1 affiche **⚠ Rejetée** et « Une saisie plus récente existe déjà. » ;
  (4) la liste montre grimpeur, cible, valeur, heure et motif ; le retrait vide
  la liste.

### CT-10 `[auto]` — Juge hors ligne (couvre : R12, R15, spec #10 R14bis)

- **Rôle / compte** : jeton QR juge (tablette, mode avion).
- **Étapes** : mode avion ; saisir **8,5** pour un grimpeur ; désactiver le mode
  avion.
- **Résultat attendu** : le temps s'affiche aussitôt « en attente », les
  compteurs Femmes / Hommes en tiennent compte, bandeau « Hors ligne » ; au
  retour du réseau, « ✓ Enregistré ».

### CT-11 — Session QR révoquée pendant la coupure (couvre : R19, R25)

- **Rôles** : coach **temporaire** (session QR Club A, téléphone) + `admin@test.local`.
- **Étapes** :
  1. Coach temporaire : mode avion ; saisir deux résultats.
  2. Admin : **régénérer** le jeton QR coach du Club A (l'ancien est révoqué).
  3. Coach : désactiver le mode avion.
  4. Coach : scanner le **nouveau** QR code, rouvrir la saisie.
- **Résultat attendu** : (3) les saisies **restent en attente** ; le bandeau
  indique **« Session expirée · 2 saisies en attente »** et invite à rescanner ;
  (4) après le nouveau scan (même club, même rencontre), les saisies sont
  envoyées ; en base, l'**auteur** est la nouvelle session.

### CT-12 — Autre club sur le même téléphone (couvre : R4)

- **Rôles** : coach temporaire Club A puis coach temporaire Club B, **même téléphone**.
- **Étapes** : Club A : mode avion, saisir un résultat ; fermer (confirmer) ;
  scanner le QR du **Club B**, désactiver le mode avion, ouvrir la saisie.
- **Résultat attendu** : l'écran du Club B **n'affiche pas** la saisie du Club A
  et ne l'envoie pas ; elle réapparaît si une session du Club A rouvre l'écran.

### CT-13 — Horloge du téléphone décalée (couvre : R6, R7)

- **Rôle / compte** : `coach@test.local`, téléphone dont l'heure est réglée
  **manuellement à +1 h**.
- **Étapes** : ouvrir la saisie, saisir un résultat ; puis, depuis la saisie
  admin, corriger ce résultat.
- **Résultat attendu** : la saisie du coach est acceptée ; la correction admin
  faite **après** l'emporte (elle n'est pas refusée comme « plus ancienne ») —
  l'heure de saisie du téléphone a été corrigée de l'écart avec le serveur.

### CT-14 — Abandon d'une saisie en attente (couvre : R27)

- **Rôle / compte** : `coach@test.local` (mode avion).
- **Étapes** : saisir un résultat ; bandeau → **Voir** → onglet **En attente** →
  **Abandonner** → confirmer ; désactiver le mode avion.
- **Résultat attendu** : confirmation demandée ; la saisie quitte la liste,
  l'écran revient à la valeur du serveur ; rien n'est envoyé au retour du réseau.

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
| | | | CT-10 | ✅ / ❌ | |
| | | | CT-11 | ✅ / ❌ | |
| | | | CT-12 | ✅ / ❌ | |
| | | | CT-13 | ✅ / ❌ | |
| | | | CT-14 | ✅ / ❌ | |
