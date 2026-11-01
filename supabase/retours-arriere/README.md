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
- Validation locale obligatoire avant la recette, automatisée par
  `npm run db:verifier-retours -- <versions dans l'ordre d'application>`
  (`scripts/verifier-retours-arriere.sh`) : référence sans les migrations, puis
  pour chaque préfixe, retours arrière en ordre inverse comparés à l'état
  antérieur (empreinte `scripts/empreinte-schema.sql` : définitions et droits
  des fonctions, contraintes, triggers, policies, index, colonnes), rejeu
  idempotent et `db reset` final. Comparaison par `cmp`, aux fins de ligne près
  (le fichier consolidé est en CRLF).
- Application : **à la main** dans le SQL Editor, comme les migrations
  (convention `docs/conventions/03-base-de-donnees-supabase.md` §5.2). Consigner
  l'exécution dans `supabase/migrations/JOURNAL.md`.
- Une fois la migration appliquée en prod, son retour arrière n'a plus lieu
  d'être : il est supprimé lors de l'archivage de la migration.

Aucun retour arrière en attente : les scripts de l'évolution adulte et de
l'ajout de grimpeur sans licence (`202610231000` → `202610251200`) ont été
supprimés à leur archivage, après application en prod le 2026-11-01.
