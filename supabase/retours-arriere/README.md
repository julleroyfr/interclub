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

| Migration | Script | Effet |
|-----------|--------|-------|
| `202610231000_categorie_adulte` | `202610231000_categorie_adulte_retour_arriere.sql` | supprime rencontres et gabarit adultes ; restaure contraintes de catégorie et 4 fonctions |
| `202610231100_equipes_adultes` | `202610231100_equipes_adultes_retour_arriere.sql` | supprime les équipes sans club ; retire 2 triggers et 1 index ; remet `equipe.club_id` à NOT NULL ; restaure `liste_grimpeurs_vitesse` |
| `202610231200_top_moulinette` | `202610231200_top_moulinette_retour_arriere.sql` | supprime les résultats `top_moulinette` ; restaure la contrainte d'issue et `valider_resultat_voie` / `saisir_resultat_voie` dans leur version du lot 1 |
| `202610231300_jeton_capitaine` | `202610231300_jeton_capitaine_retour_arriere.sql` | supprime les jetons capitaine (et leurs sessions) ; auteur `capitaine` → `coach` ; retire policies, fonctions, trigger, index et colonne `jeton_qr.equipe_id` ; restaure contraintes et 4 fonctions (`exiger_session_coach`, `peut_ecrire_resultat`, `proteger_audit_resultat`, `contexte_juge`) |
| `202610251100_epreuves_desactivables` | `202610251100_epreuves_desactivables_retour_arriere.sql` | retire les 5 triggers et fonctions et la colonne `epreuve.active` (les épreuves désactivées redeviennent ordinaires ; les jetons juges révoqués le restent) |
| `202610251200_ajout_grimpeur_licence_generee` | `202610251200_ajout_grimpeur_licence_generee_retour_arriere.sql` | retire la RPC `creer_grimpeur_licence_generee` (indépendante de l'évolution adulte) ; les grimpeurs créés avec une licence générée sont conservés |
| `202610251000_gel_equipes_adultes` | `202610251000_gel_equipes_adultes_retour_arriere.sql` | retire les triggers de gel des équipes adultes (`equipe`, `composition`) et leur fonction ; aucune donnée |

Ordre d'annulation : épreuves désactivables (`202610251100`), gel des équipes
(`202610251000`), lot 5 (`202610231300`),
lot 4 (`202610231200`), lot 3
(`202610231100`), **puis** lot 1 (`202610231000`). Quand une fonction a déjà été modifiée par une migration
antérieure de la même évolution, le retour arrière restaure **cette** version
(pas celle de la base archivée).
