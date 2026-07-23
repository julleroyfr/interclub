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
| `202607221150_voie_de_vitesse` | Voies de vitesse d'une rencontre (nombre paramétrable) + RLS activée | _à appliquer_ | _reporté (à la bascule sur `main`)_ |
| `202607221200_auth_et_jetons_qr` | Auth : `compte` (mapping compte↔rôle/club) + `jeton_qr` (jetons éphémères ; juge→voie) + RLS activée | _à appliquer_ | _reporté (à la bascule sur `main`)_ |
| `202607221300_rls_compte_et_role_courant` | Fonctions `role_courant()`/`est_admin()` + grants schéma/`compte` + policies RLS de `compte` (T5a) | _à appliquer_ | _reporté (à la bascule sur `main`)_ |
| `202607221400_grants_service_role_mapping` | Grants lecture `service_role` sur `interclub` (usage schéma + select `club`/`compte`) pour l'écran admin de mapping (T5b, ADR 0002) | 2026-07-22 / julleroyfr | _reporté (à la bascule sur `main`)_ |
| `202607230900_rls_jeton_qr_et_grants` | Helper `club_courant()` + grants (`jeton_qr` écriture `authenticated` ; select `rencontre`/`voie_vitesse`/`equipe` `service_role`) + policies RLS de `jeton_qr` (admin tout ; coach temp. de son club) — T5c | _à appliquer_ | _reporté (à la bascule sur `main`)_ |

> Prod volontairement reportée : sera appliquée quand le code sera basculé sur
> `main`. Schéma `interclub` à exposer à l'API en prod à ce moment-là (déjà fait
> en recette).
