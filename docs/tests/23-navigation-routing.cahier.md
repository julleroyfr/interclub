# Cahier de test : Navigation & routing (spec #12)

> Couvre les **enchaînements de pages** et la **politique de garde** : gardes
> hybrides (redirection connexion / 404), entrées par rôle, redirection des
> utilisateurs déjà connectés, déconnexion des comptes permanents, fin de session
> QR juge, et navigation du coach temporaire. Règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/12-navigation-et-routing.md` (R1–R26) ;
  `docs/specs/02-authentification-et-sessions-qr.md` R34 (CT-15).
  Voir aussi la cartographie `docs/navigation-enchainements.md`.
- **Le pur est couvert par Vitest** : `src/lib/coach/navigation.test.ts`
  (`liensCoach`, R10/R11). Ce cahier vérifie les **redirections**, les **404**,
  la **déconnexion** et les **sorties de session** — non automatisables sans
  Supabase.
- **Automatisé** : `e2e/navigation-routing.spec.ts` (Playwright) rejoue CT-01→CT-11
  contre la stack locale. Lancer : `npx playwright test navigation-routing
  --project=chromium`. Dernier run : **20/20 ✅** (voir registre).
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

### CT-12 — Bandeau sur téléphone : menu repliable, pas de défilement horizontal (couvre R23 ; conv. 08)

- **Rôle** : `admin@`, `coach@`, coach temporaire (scan), juge (scan).
- **Appareil** : téléphone **~375 px** de large (vrai téléphone pour le résidu
  manuel).
- **Étapes** :
  1. En admin, ouvrir `/admin`, `/admin/rencontres/{id}`, `…/resultats`,
     `…/controle`, `…/classement`, `/admin/grimpeurs`.
  2. Toucher **« Menu »**, puis un lien du panneau.
  3. Rejouer l'étape 1 sur `/coach` et `/coach/jetons` (coach permanent), puis
     sur l'écran de la rencontre (coach temporaire).
- **Résultat attendu** :
  - **Aucun défilement horizontal de la page** (largeur du document = largeur de
    l'écran), quel que soit l'espace.
  - Sous 768 px, les liens sont **repliés** derrière un bouton **« Menu »** ;
    « Se déconnecter » / « Terminer » restent visibles dans l'en-tête.
  - « Menu » ouvre un panneau listant **les mêmes liens** que sur desktop (R23),
    en colonne, cibles **≥ 44 px** ; le lien de la page courante est surligné.
  - Toucher un lien navigue **et referme** le panneau ; **Échap** le referme.
  - À partir de 768 px : rangée de liens en ligne, sans bouton « Menu ».

### CT-13 `[manuel]` — Pages de maquette absentes hors développement local   (couvre : R24, rév. 2026-10-03)

- **Rôle / compte** : `admin@test.local`, puis non connecté.
- **Environnement** : **recette** (build de production). *(En `next dev`, les
  maquettes sont servies par conception : ce cas ne se déroule pas en local.)*
- **Étapes** : ouvrir `/design-system`, `/templates/nuit/dashboard`,
  `/templates/nuit/equipe` et `/templates/nuit/vitesse`.
- **Résultat attendu** : **404** pour chacune, **même connecté en admin**.
- **Vérifié en local sur build de production** (`next build` + `next start`) le
  2026-10-03 : 404 sur les quatre pages, 200 sur `/connexion`.

### CT-14 `[auto]` — Écran d'erreur technique   (couvre : R25, rév. 2026-10-03)

- **Rôle / compte** : `admin@test.local`.
- **Pré-condition** : rencontre pilote en **③** ; **panne simulée** : retrait du
  droit `select` de `service_role` sur `interclub.points_vitesse` (SQL), rétabli
  à la fin du cas.
- **Étapes** : ouvrir `/admin/rencontres/33333333-…/classement` ; puis rétablir
  le droit et cliquer « Réessayer ».
- **Résultat attendu** : écran « **Une erreur est survenue** », sans détail
  technique, avec « **Réessayer** » et « **Revenir à l'accueil** » (lien vers
  `/`) ; après rétablissement, « Réessayer » affiche le classement.
- **Automatisé** : `e2e/ecran-erreur.spec.ts` (`npm run test:cahier:erreur`).

### CT-15 `[auto]` — Scan d'un QR par un compte permanent déjà connecté   (couvre : R9, spec #2 R34 ; rév. 2026-10-09)

- **Rôle / compte** : `admin@test.local`, puis JD-JETON-JUGE.
- **Pré-condition** : rencontre pilote en **③**, jour J (fenêtre du QR juge
  ouverte).
- **Étapes** :
  1. Connecté en admin, ouvrir `/scan?jeton=<JD-JETON-JUGE>` (ou scanner le QR
     avec le téléphone déjà connecté).
  2. Cliquer « **Aller à mon espace** ».
  3. Rouvrir le même `/scan?jeton=…`, cliquer « **Me déconnecter et ouvrir la
     session QR** ».
  4. Ouvrir `/admin`.
- **Résultat attendu** : (1) l'écran affiche « Vous êtes connecté avec le compte
  `admin@test.local` » et les deux choix, **sans** ouvrir de session QR ; (2)
  arrivée sur `/admin`, toujours connecté en admin ; (3) arrivée sur `/juge`
  (session juge ouverte) ; (4) **404** : la session admin de cet appareil est
  fermée (les autres appareils de l'admin restent connectés).
- **Automatisé** : `e2e/navigation-routing.spec.ts` (CT-15).

### CT-16 `[manuel]` — Spinner pendant une navigation lente   (couvre : R26, rév. 2026-10-09)

- **Rôle / compte** : `admin@test.local`.
- **Environnement** : **recette** (latence réelle) ; en local, simuler un réseau
  lent (DevTools → Network → « Slow 4G »).
- **Étapes** :
  1. Sur `/admin`, cliquer « Clubs », puis « Grimpeurs », puis « Rencontres ».
  2. Ouvrir le classement d'une rencontre, cliquer « Exporter en PDF ».
  3. Ctrl+clic (ou clic milieu) sur un lien du bandeau.
  4. Sur téléphone, répéter l'étape 1.
- **Résultat attendu** : (1) si la page tarde, une **barre** en haut et une
  pastille « **Chargement…** » avec spinner apparaissent presque aussitôt, puis
  disparaissent à l'affichage de la page ; aucun clignotement si la page
  s'affiche instantanément ; (2) le PDF se télécharge, **aucun** spinner ;
  (3) nouvel onglet, **aucun** spinner dans l'onglet courant ; (4) l'indicateur
  est visible et ne masque pas le bandeau de façon gênante.
- **Pur couvert par Vitest** : `src/composants/navigation-en-cours.test.ts`
  (quels clics déclenchent l'indicateur) et
  `src/composants/IndicateurNavigation.test.tsx` (délai, masquage, 20 s).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| 2026-09-25 | Playwright e2e | `24ad806` | CT-01 | ✅ | Couvert par le helper de connexion (redirection post-login) + CT-02 |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-02 | ✅ | 4 cas (non-auth, coach, admin, sans rôle) |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-03 | ✅ | /connexion (admin) + /inscription (coach) |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-04 | ✅ | /admin, /admin/rencontres, /coach, /coach/jetons |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-05 | ✅ | coach→/admin 404, admin→/coach 404 |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-06 | ✅ | Déconnexion admin + coach → /connexion |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-07 | ✅ | Lien « Jetons » → /coach/jetons |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-08 | ✅ | Coach temporaire : nav bornée + Terminer (fenêtre QR ③ ouverte) |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-09 | ✅ | Juge « Terminer » → /connexion (fenêtre QR ③ ouverte) |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-10 | ✅ | Lien classement admin → /admin/.../classement (jamais /coach) |
| 2026-09-25 | Playwright e2e | `24ad806` | CT-11 | ✅ | Bandeaux sans « Accueil » ; liens attendus présents |
| 2026-10-02 | Playwright e2e | develop | CT-08/09/10 | ✅ | Pré-conditions explicites (③ + jour J), état seed restauré — plus de dépendance à l'ordre |
| 2026-10-02 | Playwright e2e | develop | CT-12 | ✅ | 375 px : aucun débordement (admin ×6 pages, coach ×3, coach temp., juge, classement ③) ; menu repliable, Échap, cibles ≥ 44 px — résidu : vrai téléphone |
| 2026-10-09 | Playwright e2e | develop | CT-15 | ✅ | Admin connecté : choix proposé, « Aller à mon espace » sans session QR, puis déconnexion → /juge, /admin en 404 |
