# Journal des migrations

Suivi des migrations SQL **appliquées à la main** (pas de CLI/Docker). À tenir à
jour à chaque application. Voir les règles :
[docs/conventions/03-base-de-donnees-supabase.md](../../docs/conventions/03-base-de-donnees-supabase.md) §5.

- Chaque migration est un fichier `AAAAMMJJHHMM_description.sql` dans ce dossier.
- Une migration est appliquée **d'abord en recette, puis en prod**.
- Chaque migration insère aussi sa version dans la table `interclub.version`.

| Version (fichier) | Description | Recette (date/par) | Prod (date/par) |
|-------------------|-------------|--------------------|-----------------|
| `202607221000_creation_schema_interclub_et_version` | Schéma `interclub` + table de suivi `interclub.version` | 2026-07-22 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607221100_modele_donnees_socle` | Modèle socle (club, coach, grimpeur, rencontre, equipe, composition, epreuve, resultat, temps_vitesse) + RLS activée | 2026-07-22 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607221150_voie_de_vitesse` | Voies de vitesse d'une rencontre (nombre paramétrable) + RLS activée | 2026-07-25 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607221200_auth_et_jetons_qr` | Auth : `compte` (mapping compte↔rôle/club) + `jeton_qr` (jetons éphémères ; juge→voie) + RLS activée | 2026-07-25 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607221300_rls_compte_et_role_courant` | Fonctions `role_courant()`/`est_admin()` + grants schéma/`compte` + policies RLS de `compte` (T5a) | 2026-07-25 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607221400_grants_service_role_mapping` | Grants lecture `service_role` sur `interclub` (usage schéma + select `club`/`compte`) pour l'écran admin de mapping (T5b, ADR 0002) | 2026-07-22 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607230900_rls_jeton_qr_et_grants` | Helper `club_courant()` + grants (`jeton_qr` écriture `authenticated` ; select `rencontre`/`voie_vitesse`/`equipe` `service_role`) + policies RLS de `jeton_qr` (admin tout ; coach temp. de son club) — T5c | 2026-07-25 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607231000_session_qr_et_rpc` | Table `session_qr` (utilisateur_id → jeton_qr_id) + RLS select own + RPC `ouvrir_session_qr` SECURITY DEFINER (ADR 0001) — T5d | 2026-07-25 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607251000_rls_tables_metier` | Policies RLS des 9 tables métier (T6) : helpers de périmètre SECURITY DEFINER (phase, coach temp./juge de rencontre, écritures équipe/composition/résultat/temps vitesse) + grants `authenticated` + policies par opération (matrice spec #1 + ADR 0001, 2 chemins acteur, gating de phase) | 2026-07-25 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607291000_gabarit_et_voies_epreuve` | Gabarit de rencontre par catégorie (gabarit_epreuve/voie_difficulte/bloc/voie_vitesse) + tables rencontre voie_difficulte/bloc + libelle voie_vitesse + RPC creer_rencontre_avec_gabarit + seed enfant/ado (spec #3 R29–R37) | _à appliquer_ | _reporté_ |
| `202607311000_points_gabarit_voie_bloc` | Points des voies de difficulté (voie entière + prise valorisée enfant / zones ado, R38) + paliers de blocs (gabarit_bloc_palier/bloc_palier, R39) + copie RPC + seed barème CT33 (spec #3) | _à appliquer_ | _reporté_ |
| `202608281000_grants_authenticated_gabarit_structure` | Grants `authenticated` (select/insert/update/delete) sur `gabarit_*` et `voie_difficulte`/`bloc`/`bloc_palier` — oubli des migrations 202607291000/202607311000 (seul `service_role` était granté), rendait inopérante la RLS `*_all_admin` : écriture gabarit/rencontre (R36/R43) et lecture rencontre en échec silencieux | _à appliquer_ | _reporté_ |
| `202609011000_phase_cloture` | Cycle à 4 phases : ajout de `cloture` entre compétition et résultats publics (spec #1 R5, rév. 2026-09-01) — élargit le CHECK `rencontre.phase` ; admin seul écrit en clôture (gating existant inchangé) | _à appliquer_ | _reporté_ |
| `202609011100_composition_engagement` | `composition` : `rencontre_id` dénormalisé (trigger) + `unique(rencontre_id, grimpeur_id)` (R14) ; colonne `groupe_depart` nullable + CHECK M1–M4/T1–T8 (R19) + grant `update(groupe_depart)` et policy `composition_update` (spec #5) | _à appliquer_ | _reporté_ |
| `202609011300_phase_preparation` | Cycle à 5 phases : ajout de `preparation` (jour J) entre pré-compétition et compétition (spec #1 R5, rév. 2026-09-01) — élargit le CHECK `rencontre.phase` | _à appliquer_ | _reporté_ |
| `202609011400_rls_engagement_preparation` | Droits jour J du coach temporaire : helpers `est_coach_temp_actif_club`/`est_coach_temp_engagement` ; `est_coach_de_club` élargi ; `peut_ecrire_equipe` = permanent (pré-compétition/préparation) OU temporaire (préparation) ; résultats inchangés (compétition) — remplace l'ancien « gel » (spec #1 R6/R27, spec #5 R16) | _à appliquer_ | _reporté_ |
| `202609011500_session_qr_coach_temp_prepa` | `ouvrir_session_qr` : fenêtre nature-dépendante (coach temp = préparation/compétition, juge = compétition ; spec #2 R12) + nouvelle RPC `contexte_coach_temporaire()` (club+rencontre de la session temporaire active) pour la garde applicative de l'espace coach (spec #5 R16) | _à appliquer_ | _reporté_ |
| `202609020900_rls_grimpeur_prete_lisible` | Grimpeur PRÊTÉ visible/gérable par le coach d'accueil : `grimpeur_select` élargi (helper `voit_grimpeur_via_engagement` — nom d'un grimpeur composé dans une équipe que je coache, R13) + `composition_update`/`_delete` sur `peut_gerer_composition_equipe` (équipe d'accueil + gating de phase — groupe de départ R21 et retrait R36). INSERT cross-club inchangé (admin, R35). Corrige « (inconnu) » + retrait/groupe bloqués (spec #5) | _à appliquer_ | _reporté_ |
| `202609021000_pret_grimpeur` | Table `pret` (rencontre, grimpeur, club_accueil) = **prêt persistant** distinct de l'équipe : écriture admin (R35), lecture coach d'accueil. `grimpeur_select` élargi (`voit_grimpeur_via_pret` → roster) + `composition_insert` élargi (`peut_engager_prete` → le coach affecte/ré-affecte un prêté, R36). Grants `service_role` select sur `pret`+`grimpeur` (écran admin de prêts, ADR 0002/0003). Chemin admin direct conservé. Spec #1 R35/R36, spec #5 R12/R13 (rév. 2026-09-02) | _à appliquer_ | _reporté_ |

> Prod volontairement reportée : sera appliquée quand le code sera basculé sur
> `main`. Schéma `interclub` à exposer à l'API en prod à ce moment-là (déjà fait
> en recette).
