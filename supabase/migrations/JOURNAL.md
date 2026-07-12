# Journal des migrations

Suivi des migrations SQL **appliquées à la main** (pas de CLI/Docker). À tenir à
jour à chaque application. Voir les règles :
[docs/conventions/03-base-de-donnees-supabase.md](../../docs/conventions/03-base-de-donnees-supabase.md) §5.

- Chaque migration est un fichier `AAAAMMJJHHMM_description.sql` dans ce dossier.
- Une migration est appliquée **d'abord en recette, puis en prod**.
- Chaque migration insère aussi sa version dans la table `interclub.version`.

| Version (fichier) | Description | Recette (date/par) | Prod (date/par) |
|-------------------|-------------|--------------------|-----------------|
| _(aucune migration pour l'instant)_ | | | |

> Première migration à venir : création du schéma `interclub` + table
> `interclub.version` (cf. TODO d'initialisation).
