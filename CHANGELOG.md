# Journal des versions

Toutes les évolutions notables de l'application, version la plus récente en
tête. Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
numérotation [SemVer](https://semver.org/lang/fr/) adaptée au projet.

Règles et procédure : [docs/conventions/10-versionnement.md](docs/conventions/10-versionnement.md).

## [2.0.0] — 2026-11-05

Version de la saison 2026-2027 : les tranches d’âge enfant et ado suivent le
nouveau règlement.

### Modifié

- **Tranches d’âge enfant / ado** : pour la saison 2026-2027, les grimpeurs nés
  en **2014** (12 ans) peuvent faire les rencontres **enfant et ado** ; la
  catégorie ado s’arrête à **18 ans** en début de saison (nés en **2008** au
  plus tôt). Un grimpeur né en 2013 n’est plus proposé en enfant, un grimpeur
  né en 2007 n’est plus proposé en ado (il reste éligible en adulte). Les
  grimpeurs déjà engagés ne sont pas retirés (spec #1 R34, R34bis ; spec #20 R3).
- Ces deux âges sont désormais **réglés par l’hébergeur** (variables
  `AGE_BASCULE` et `AGE_ADO_MAX`) : un changement de règlement ne demande plus
  de nouvelle version, seulement un redéploiement. Sans ces variables,
  l’engagement est bloqué avec un message explicite (spec #1 R34bis).
- Les catégories s’affichent « **Enfant — matin** » et « **Ado — après-midi** »,
  sans âge (spec #1 R34bis).
- **Rapport périodique** : les tranches pivot, ado et adulte suivent les mêmes
  âges (spec #19 R7).

## [1.0.0] — 2026-11-04

Première version suivie : état de l’application en production au 2026-11-04.
L’historique antérieur n’est pas détaillé ici (voir `git log` et `docs/specs/`).

### Ajouté

- **Comptes et accès** : rôles admin, coach, juge et capitaine ; connexion par
  compte ou par QR code le jour de la rencontre ; invitation et suppression de
  compte (specs #1, #2).
- **Paramétrage des rencontres** par l’admin : clubs, grimpeurs, rencontres,
  structure (voies, blocs, vitesse) modifiable, repères de voie (spec #3).
- **Import des licenciés** depuis un export FFME et **import CSV** sans
  licence au format Marsas (specs #13, #18).
- **Tableau de bord admin** et pilotage des phases d’une rencontre (spec #4).
- **Espace coach** : engagement des grimpeurs, saisie des résultats voie et
  bloc (specs #5, #6).
- **Saisie de la vitesse** par les juges (spec #10) et **saisie ou correction
  admin** de tous les résultats (spec #9).
- **Catégorie adulte**, avec capitaines d’équipe (spec #20).
- **Classements** individuel, par équipe et par club, barème de vitesse
  compris (spec #7) ; **affichage en boucle** sur écran secondaire (spec #14) ;
  **export PDF** des classements officiels (spec #15).
- **Contrôle des résultats** contre les fiches papier des juges (spec #16).
- **Mises à jour en direct** sur les écrans connectés (spec #11) et **saisie
  hors ligne** pour coachs et juges (spec #17).
- **Rapport périodique** d’activité (spec #19).

### Migrations à appliquer

Aucune : toutes les migrations sont déjà appliquées en prod (cf.
supabase/migrations/JOURNAL.md).
