# Retours arrière de migrations

Scripts SQL qui **annulent** une migration appliquée à la main, pour une évolution
développée sur une branche dédiée et testée sur l'unique base de recette
(spec #20 R34/R35, décision du 2026-10-23).

- Un fichier par migration : `<version>_retour_arriere.sql`. Ce dossier est
  **hors** de `supabase/migrations/` : `db reset` ne le rejoue jamais.
- Chaque script tourne dans **une transaction** : il supprime les données
  propres à l'évolution, restaure **à l'identique** les fonctions, contraintes,
  triggers et policies modifiés (copie de leur définition d'avant la migration),
  puis retire la ligne de `interclub.version`.
- Plusieurs migrations d'une même évolution s'annulent dans l'**ordre inverse**
  de leur application.
- Validation locale obligatoire avant la recette : état de référence sans la
  migration → migration → retour arrière → comparaison (définitions et droits
  des fonctions, contraintes, triggers, policies) → migration rejouée.
- Application : **à la main** dans le SQL Editor, comme les migrations
  (convention `docs/conventions/03-base-de-donnees-supabase.md` §5.2). Consigner
  l'exécution dans `supabase/migrations/JOURNAL.md`.
- Une fois la migration appliquée en prod, son retour arrière n'a plus lieu
  d'être : il est supprimé lors de l'archivage de la migration.

| Migration | Script | Effet |
|-----------|--------|-------|
| `202610231000_categorie_adulte` | `202610231000_categorie_adulte_retour_arriere.sql` | supprime rencontres et gabarit adultes ; restaure contraintes de catégorie et 4 fonctions |
