# Cahier de test : Saisie hors ligne — lot 1, affichage instantané (spec #17)

> Le coach (voie, bloc) et le juge (vitesse) voient leur saisie **dès le clic**,
> « en attente » ; la requête part ensuite et la réponse la confirme
> (« enregistré ») ou la rejette (retour à la valeur du serveur + motif). Le
> ressenti se vérifie sur la **recette** (latence réelle), de préférence sur
> téléphone. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/17-saisie-hors-ligne.md` (lot 1 : R13, R18,
  R22, R23) ; spec #6 R20bis, spec #10 R14bis ; maquette
  `docs/maquettes/saisie-hors-ligne.html` (écrans 1, 2, 5 et 7).
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
  **⚠ Rejetée** et un **message lisible** (saisie fermée hors compétition)
  s'affichent sous le bloc. Remettre la rencontre en ③ après le cas.

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

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | |
| | | | CT-02 | ✅ / ❌ | |
| | | | CT-03 | ✅ / ❌ | |
| | | | CT-04 | ✅ / ❌ | |
| | | | CT-05 | ✅ / ❌ | |
| | | | CT-06 | ✅ / ❌ | |
