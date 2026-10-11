# Cahier de test : Import des licenciés (spec #13)

- **Spec de référence** : `docs/specs/13-import-des-licencies.md`
- **Pré-requis** :
  - Migration **`202609251100_rpc_importer_licencies`** appliquée à la main
    (recette) — RPC `interclub.importer_licencies(jsonb)` présente.
  - Migrations socle + `grimpeur.sexe` (`F`/`H`) + `grimpeur.licence` (unique)
    déjà appliquées.
  - Un **compte admin**, un **compte coach**, et pouvoir tester **non connecté**.
  - **Fichier réel** `docs/reglement/Licenciés 2027.xlsx` (non versionné) pour les
    cas nominaux, + quelques **fichiers forgés** (voir Jeu de données).
- **Environnement** : recette (preview Netlify) — version/commit : `______`

## Jeu de données initial

- Base **sans grimpeur** (ou roster connu) pour observer créés vs mis à jour.
- **Fichiers de test** à préparer (mêmes colonnes A→F, en-têtes ligne « Nom … ») :
  - **F-REEL** : `Licenciés 2027.xlsx` (export FFME complet, ~1137 lignes).
  - **F-PETIT** : extrait de 5–10 lignes dont au moins un né ≥ seuil, un né avant
    le seuil, un club nouveau, un club existant.
  - **F-ERREURS** : contient 1 ligne par type d'erreur (sexe « NB », date
    « 32/13/2012 », licence vide, licence « 12A », nom vide, structure vide) + 2
    lignes valides éligibles.
  - **F-DOUBLON** : deux lignes valides éligibles avec la **même licence**,
    prénoms/clubs différents (la 2ᵉ est la « bonne »).
  - **F-CSV** : un `.csv` (mauvais format) pour le refus R3.

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| `admin@…` | administrateur | déroule l'import (R1) |
| `coach@…` | coach | vérifie le refus d'accès (R1) |
| — | non connecté | vérifie le 404 (R1) |

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre : R1, R2)

- **Rôle / compte** : admin, puis coach, puis non connecté.
- **Étapes** :
  1. Admin : ouvrir `/admin/grimpeurs` → le lien **« Importer des licenciés »**
     est présent (R2) ; le suivre → l'écran `/admin/grimpeurs/import` s'affiche.
  2. Coach : aller directement sur `/admin/grimpeurs/import`.
  3. Non connecté : aller sur `/admin/grimpeurs/import`.
- **Résultat attendu** : l'admin voit l'écran ; le coach et le non-connecté
  obtiennent un **404** (écran masqué, pas 403).
- **RLS / sécurité** : un POST direct de la Server Action par un non-admin est
  refusé (message « accès réservé à un administrateur ») ; la RPC refuse aussi
  (`est_admin()`), aucune écriture.

### CT-02 — Refus d'un fichier non .xlsx (couvre : R3)

- **Rôle** : admin.
- **Étapes** : déposer **F-CSV** puis lancer l'import.
- **Résultat attendu** : message « Le fichier doit être au format .xlsx. » ;
  aucun traitement, pas de compte-rendu.
- **Variante** : lancer sans fichier → message « Veuillez déposer un fichier
  .xlsx. ».

### CT-03 — En-têtes / feuille vide (couvre : R4, R5)

- **Rôle** : admin.
- **Étapes** :
  1. Déposer un `.xlsx` dont la 1re feuille n'a **pas** de ligne « Nom … ».
  2. Déposer un `.xlsx` bien en-tête mais **sans ligne de données**.
- **Résultat attendu** : (1) message « En-têtes introuvables… » ; (2) compte-rendu
  avec **0 ligne traitée**, 0 créé / 0 mis à jour.

### CT-04 — Import nominal, année par défaut (couvre : R6, R7, R8, R9, R12, R13, R18)

- **Rôle** : admin, base sans grimpeur.
- **Pré-condition** : date du jour en saison 2026-2027 → **année de référence
  pré-remplie = 2027**, seuil de naissance affiché = **2009**.
- **Étapes** : déposer **F-REEL**, laisser l'année par défaut, lancer.
- **Résultat attendu** :
  - seuls les licenciés **nés en 2009 ou après** sont créés (R7) ; les plus âgés
    comptent en **« Ignorés (hors âge) »** (R8), pas en erreur ;
  - les **clubs absents** sont créés et listés (R12) ;
  - le compte-rendu affiche créés / mis à jour (0) / ignorés / erreurs, l'année
    de référence **2027** et le seuil **2009** (R18) ;
  - vérifier en base : un né en **2009** est présent, un né en **2008** absent.

### CT-05 — Année de référence automatique, non modifiable (couvre : R6, R7)

- **Rôle** : admin.
- **Étapes** : ouvrir `/admin/grimpeurs/import`, déposer **F-PETIT**, lancer.
- **Résultat attendu** :
  - l'écran ne propose **aucun champ** « année de référence » (ni saisie, ni
    affichage éditable) ;
  - le filtre s'applique avec l'année **calculée** = année de fin de la saison
    courante (aujourd'hui 2026-2027 → **2027**, seuil **2009**) ;
  - le compte-rendu rappelle l'année de référence **2027** et le seuil **2009**.

### CT-06 — Rattachement club : existant réutilisé, absent créé (couvre : R11, R12)

- **Rôle** : admin.
- **Pré-condition** : créer manuellement un club dont le **nom est exactement**
  celui d'une structure de **F-PETIT** (ex. « CASTELNAU ESCALADE »).
- **Étapes** : déposer **F-PETIT**, lancer.
- **Résultat attendu** : les grimpeurs de « CASTELNAU ESCALADE » sont rattachés au
  club **existant** (pas de doublon de club) ; les structures inconnues
  apparaissent dans **« Clubs créés »** ; vérifier en base l'unicité des noms de
  club.

### CT-07 — Ré-import : mise à jour sur licence (couvre : R13, R18)

- **Rôle** : admin.
- **Pré-condition** : CT-04 déroulé (roster importé).
- **Étapes** :
  1. Modifier **F-PETIT** pour un licencié déjà importé : changer son **prénom**
     et sa **structure** (club différent), garder la **même licence**.
  2. Ré-importer **F-PETIT**.
- **Résultat attendu** : ce grimpeur est compté en **« Mis à jour »** (pas
  « Créé ») ; en base, son prénom et son **club** ont changé ; **aucun doublon**
  de licence.

### CT-08 — Doublon de licence dans le fichier (couvre : R14)

- **Rôle** : admin.
- **Étapes** : déposer **F-DOUBLON**, lancer.
- **Résultat attendu** : **un seul** grimpeur écrit pour cette licence, avec les
  valeurs de la **dernière** occurrence (prénom/club de la 2ᵉ ligne) ; le
  compte-rendu signale « 1 doublon de licence dans le fichier — dernière
  occurrence retenue ».

### CT-09 — Lignes en erreur + import partiel (couvre : R9, R10, R17, R18)

- **Rôle** : admin.
- **Étapes** : déposer **F-ERREURS**, lancer.
- **Résultat attendu** :
  - les 2 lignes valides sont **importées** (import partiel, R17) ;
  - chaque ligne fautive apparaît dans **« Lignes en erreur »** avec son **numéro
    de ligne réel** (celui du tableur) et une **raison** parlante (sexe, date,
    licence, nom, structure) (R10) ;
  - le compteur « Lignes en erreur » = nombre de lignes fautives.

### CT-10 — Écriture atomique / rollback (couvre : R16)

- **Rôle** : admin.
- **But** : prouver le « tout ou rien » de l'écriture.
- **Pré-condition** : provoquer un échec **base** pendant l'écriture. Option :
  insérer d'abord manuellement une ligne `grimpeur` avec une licence L et, dans le
  fichier, faire porter cette licence L à un grimpeur d'un **club au nom nouveau**
  — puis rendre l'upsert impossible en violant une contrainte (ex. forcer une
  `annee_naissance` hors bornes via un fichier forgé qui contourne l'analyse, ou
  simuler côté RPC en recette).
- **Étapes** : lancer l'import du fichier forgé.
- **Résultat attendu** : le compte-rendu indique un **échec d'écriture** (« Aucun
  grimpeur importé (R16) ») ; en base, **aucun** grimpeur ni **aucun club** de ce
  lot n'a été créé (le club au nom nouveau n'existe pas → rollback complet).

### CT-11 — Grimpeurs absents du fichier non supprimés (couvre : Hors périmètre)

- **Rôle** : admin.
- **Pré-condition** : un grimpeur en base **absent** du fichier ré-importé.
- **Étapes** : ré-importer **F-PETIT** (qui ne le contient pas).
- **Résultat attendu** : ce grimpeur est **toujours présent** en base (l'import ne
  supprime pas les absents).

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
