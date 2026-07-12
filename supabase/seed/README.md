# Jeux de données de test (seed)

Données de test **reproductibles** et **effaçables**, appliquées **en recette
uniquement** (jamais en prod), à la main dans le SQL Editor Supabase.
Règles : [docs/conventions/09-environnements-et-donnees.md](../../docs/conventions/09-environnements-et-donnees.md) §3-4.

## Fichiers (à créer)

- `01-jeu-de-test.sql` — INSERT des données de test (idempotent).
- `99-purge-jeu-de-test.sql` — DELETE borné aux seules données de test (rejouable).

## Cycle « rejouer un cahier de test »

1. Exécuter `99-purge-jeu-de-test.sql` (nettoie l'état précédent).
2. Exécuter `01-jeu-de-test.sql` (recharge un état initial connu).
3. Dérouler les cas du cahier, tracer les résultats.

## Règles de sûreté

- Les données de test sont **marquées** de façon non ambiguë (préfixe, colonne
  `est_jeu_de_test`, ou plage d'`id` réservée).
- La purge doit être **prouvablement bornée** (clause `where` explicite). En cas
  de doute, ne pas exécuter.
- **Jamais** de seed ni de purge sur la base de prod.
