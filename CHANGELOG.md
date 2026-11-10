# Journal des versions

Toutes les évolutions notables de l'application, version la plus récente en
tête. Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
numérotation [SemVer](https://semver.org/lang/fr/) adaptée au projet.

Règles et procédure : [docs/conventions/10-versionnement.md](docs/conventions/10-versionnement.md).

## [2.1.0] — 2026-11-10

Surclassement des enfants en ado, filtre par catégorie des grimpeurs, et une
application plus rapide et plus fiable le jour J.

### Ajouté

- **Surclassement enfant → ado** : sur l’écran Grimpeurs, l’admin peut
  surclasser un enfant pour la saison ; il peut alors être engagé **aussi** en
  ado, sans perdre sa rencontre enfant. Le coach voit un badge « surclassé ».
  À la révocation, le grimpeur est retiré des équipes ado des rencontres en
  pré-compétition ou préparation ; ses résultats déjà obtenus sont conservés
  (spec #21 ; spec #1 R34/R35, #3 R26, #5 R12).
- **Filtre par catégorie** de la liste admin des grimpeurs (enfant, ado,
  adulte), surclassés comptés en ado (spec #3 R26b).

### Modifié

- **Jour J plus fluide** : écrans de classement et de saisie plus rapides,
  moins de rafraîchissements en temps réel à chaque temps de vitesse saisi.
- **Passage de phase d’une rencontre** fait d’un seul bloc : les NP
  automatiques de la clôture sont posés en même temps que le changement de
  phase, ou pas du tout (spec #3 R17, spec #6 R18).
- Les règles de saisie (phase de la rencontre, effectif d’une équipe, structure
  modifiable, contrôle des résultats) sont aussi vérifiées par la base, en plus
  de l’écran (spec #3 R51, #5 R15, #9 R5, #16 R13).

### Corrigé

- Compteurs (clubs, rencontres, tableau de bord, accueil coach) faux au-delà de
  1000 éléments.
- À la clôture, NP qui pouvaient être posés à tort sur les grosses rencontres.
- Écran d’attribution des rôles : des comptes pouvaient ne pas apparaître
  (spec #2 R46).
- Régénération d’un QR code ou d’une invitation : un incident ne laisse plus le
  périmètre sans jeton ni invitation valide.
- Ajout du premier élément d’une épreuve ou d’un bloc vide.
- Sécurité : les fonctions des sessions QR ne sont plus accessibles sans
  session.

### Migrations à appliquer

- `202611071000_suppression_table_coach` (cf. supabase/migrations/JOURNAL.md)
- `202611071100_surclassement` (cf. supabase/migrations/JOURNAL.md)
- `202611081000_rpc_rechercher_grimpeurs_filtre_categorie` (cf. supabase/migrations/JOURNAL.md)
- `202611101000_rpc_lister_comptes_permanents` (cf. supabase/migrations/JOURNAL.md)
- `202611101100_rpc_effectifs_grimpeurs` (cf. supabase/migrations/JOURNAL.md)
- `202611101200_points_vitesse_sans_reecriture` (cf. supabase/migrations/JOURNAL.md)
- `202611101300_rpc_changer_phase_rencontre` (cf. supabase/migrations/JOURNAL.md)
- `202611101400_durcissement_droits_anon` (cf. supabase/migrations/JOURNAL.md)
- `202611101500_gardes_en_base` (cf. supabase/migrations/JOURNAL.md)
- `202611101600_rpc_ecritures_atomiques` (cf. supabase/migrations/JOURNAL.md)

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
