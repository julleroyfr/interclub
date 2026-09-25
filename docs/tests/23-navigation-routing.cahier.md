# Cahier de test : Navigation & routing (spec #12)

> Couvre les **enchaînements de pages** et la **politique de garde** : gardes
> hybrides (redirection connexion / 404), entrées par rôle, redirection des
> utilisateurs déjà connectés, déconnexion des comptes permanents, fin de session
> QR juge, et navigation du coach temporaire. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/12-navigation-et-routing.md` (R1–R22).
  Voir aussi la cartographie `docs/navigation-enchainements.md`.
- **Le pur est couvert par Vitest** : `src/lib/coach/navigation.test.ts`
  (`liensCoach`, R10/R11). Ce cahier vérifie les **redirections**, les **404**,
  la **déconnexion** et les **sorties de session** — non automatisables sans
  Supabase.
- **Pré-requis** :
  - Stack Supabase **locale** (`supabase db reset`) ; seed `01-jeu-de-test.sql`
    (comptes ci-dessous, mot de passe commun `interclub`).
  - `enable_anonymous_sign_ins = true` (sessions QR coach temporaire / juge).
  - App lancée : `npm run dev`.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| `admin@test.local` | admin | Entrée `/admin`, gardes admin, déconnexion |
| `coach@test.local` | coach permanent (Club A) | Entrée `/coach`, jetons, déconnexion |
| `sansmapping@test.local` | (aucun rôle) | Login sans rôle → `/` (R6) |
| JD-JETON-COACHTEMP (scan QR) | coach temporaire Club A | Nav bornée + classement lecture (R11) |
| JD-JETON-JUGE (scan QR) | juge | Écran `/juge`, bouton « Terminer » (R17) |

## Cas de test

### CT-01 — Redirection par rôle au login (couvre R6)

- **Rôle** : les trois comptes permanents.
- **Étapes** : se connecter successivement avec `admin@`, `coach@`,
  `sansmapping@`.
- **Résultat attendu** : `admin@` → `/admin` ; `coach@` → `/coach` ;
  `sansmapping@` → `/` (accueil, « aucun rôle attribué »).

### CT-02 — La racine `/` est un routeur (couvre R7)

- **Étapes** :
  1. **Non authentifié** : ouvrir `/` → redirection **`/connexion`**.
  2. **`coach@`** authentifié : ouvrir `/` → redirection **`/coach`** (identique au
     login, R6).
  3. **`admin@`** authentifié : ouvrir `/` → redirection **`/admin`**.
  4. **`sansmapping@`** (connecté, aucun rôle) : ouvrir `/` → **écran minimal**
     « compte sans rôle » + « Se déconnecter » (seul cas où `/` rend un écran).
- **Résultat attendu** : `/` ne rend **jamais** d'écran de navigation ; aucune
  page n'affiche de lien « Accueil » vers `/`.

### CT-03 — Utilisateur déjà connecté sur une page d'auth (couvre R8)

- **Rôle** : `admin@` (puis `coach@`) authentifié.
- **Étapes** : ouvrir `/connexion`, puis `/inscription?invitation=...`.
- **Résultat attendu** : redirection immédiate vers son espace (`/admin` ou
  `/coach`) ; le formulaire n'est **pas** affiché.

### CT-04 — Garde hybride : absence de session → connexion (couvre R2)

- **Rôle** : **aucun** (déconnecté / navigation privée).
- **Étapes** : ouvrir directement `/admin`, `/admin/rencontres`, `/coach`,
  `/coach/jetons`, une rencontre `/coach/rencontres/{id}`.
- **Résultat attendu** : chaque URL **redirige vers `/connexion`** (R2), aucun
  contenu protégé n'est rendu.

### CT-05 — Garde hybride : mauvais rôle → 404 (couvre R3, R4, R5)

- **Rôle** : `coach@` puis `admin@`.
- **Étapes** :
  1. `coach@` ouvre `/admin` et `/admin/rencontres/{id}/classement`.
  2. `admin@` ouvre `/coach` et `/coach/rencontres/{id}`.
- **Résultat attendu** : **404** dans tous les cas (l'existence de l'espace n'est
  pas révélée), **pas** de redirection vers `/connexion` (l'utilisateur a une
  session).

### CT-06 — Déconnexion des comptes permanents (couvre R20, R21)

- **Rôle** : `admin@` puis `coach@` (permanent).
- **Étapes** : sur **n'importe quel** écran de l'espace (`/admin/...`,
  `/coach/...`), cliquer **« Se déconnecter »** dans l'en-tête.
- **Résultat attendu** : la session se ferme, redirection vers `/connexion`
  (R21) ; l'action est présente sur **chaque** écran permanent (R20), sans repasser
  par `/`.
- **RLS / sécurité** : après déconnexion, rouvrir un écran protégé → `/connexion`
  (R2).

### CT-07 — Jetons accessibles depuis l'espace coach (couvre R10, C1)

- **Rôle** : `coach@` (permanent).
- **Étapes** : depuis `/coach`, utiliser le lien **« Jetons »** de la barre de
  navigation.
- **Résultat attendu** : `/coach/jetons` s'ouvre. **Non-régression C1** : bien que
  l'accueil n'y mène plus, les jetons **restent joignables** via la nav coach.

### CT-08 — Coach temporaire : nav bornée + classement lecture (couvre R11, R22)

- **Rôle** : coach temporaire (scan JD-JETON-COACHTEMP).
- **Étapes** : après scan, observer la barre de navigation ; ouvrir
  **« Classement »**.
- **Résultat attendu** : la nav contient `Ma rencontre` et `Classement`, plus une
  action **« Terminer »** — **pas** de « Mes rencontres », « Jetons », « Accueil »
  ni « Se déconnecter » (session QR, R22). Le classement de **sa** rencontre
  s'affiche en lecture (cf. cahier 18, CT-12).
- **RLS / sécurité** : viser le classement d'une **autre** rencontre → **404**
  (borné, R12).
- **Sortie** : cliquer **« Terminer »** → session fermée, retour à `/` qui
  redirige aussitôt vers `/connexion` (plus de session) (R17/R22).

### CT-09 — Fin de session juge (couvre R17, R18, R22)

- **Rôle** : juge (scan JD-JETON-JUGE), rencontre en ③.
- **Étapes** : sur `/juge`, cliquer **« Terminer »**.
- **Résultat attendu** : la session QR se ferme et revient à `/`, qui **redirige
  vers `/connexion`** (plus de session). Aucune action « Se déconnecter » n'est
  proposée au juge (R22) ; l'entrée juge reste **QR-only** (R18).

### CT-10 — Vue classement admin (couvre R14, R15 ; voir cahier 18 CT-13)

- **Rôle** : `admin@`.
- **Résultat attendu** : les liens « classement » des écrans admin mènent à
  `/admin/rencontres/{id}/classement` (tous clubs), **jamais** à `/coach/...` ;
  remontée « ← Tableau de bord » présente (R19). Détail : **cahier 18, CT-13**.

### CT-11 — Bandeau de navigation cohérent par rôle (couvre R23, C8)

- **Rôle** : `admin@` puis `coach@`.
- **Étapes** :
  1. En admin, ouvrir successivement `/admin`, `/admin/clubs`,
     `/admin/grimpeurs`, `/admin/rencontres`, une rencontre et sa saisie.
  2. En coach permanent, ouvrir `/coach` puis `/coach/jetons`.
- **Résultat attendu** :
  - Le bandeau admin est **identique** sur **toutes** les pages : Tableau de bord ·
    Rencontres · Clubs · Grimpeurs · Gabarit · Jetons · Rôles, ainsi que « Se
    déconnecter ». **Aucun lien « Accueil »** (R7). L'onglet **le plus spécifique**
    est surligné (sur `/admin/rencontres`, « Rencontres » seul est actif, pas
    « Tableau de bord »).
  - Le bandeau coach affiche **Mes rencontres · Jetons** (+ « Se déconnecter »),
    y compris sur **`/coach/jetons`** (non-régression : « Mes rencontres » présent) ;
    **pas** de lien « Accueil ».

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
