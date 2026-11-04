# Journal des versions

Toutes les évolutions notables de l'application, version la plus récente en
tête. Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
numérotation [SemVer](https://semver.org/lang/fr/) adaptée au projet.

Règles et procédure : [docs/conventions/10-versionnement.md](docs/conventions/10-versionnement.md).

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
