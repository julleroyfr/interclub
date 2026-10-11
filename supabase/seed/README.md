# Jeux de données de test (seed)

Données de test **reproductibles** et **effaçables**, appliquées **en recette
uniquement** (jamais en prod), à la main dans le SQL Editor Supabase.
Règles : [docs/conventions/09-environnements-et-donnees.md](../../docs/conventions/09-environnements-et-donnees.md) §3-4.

## Fichiers

- `00-reset-recette.sql` — **Reset complet** de la base de recette. Supprime
  toutes les données opérationnelles (rencontres, grimpeurs, résultats, jetons
  QR, sessions QR…) en conservant clubs, comptes et gabarits. **Idempotent.**
  **Jamais en prod.** À maintenir à chaque migration ajoutant une table (cf.
  commentaires en tête de fichier).
- `01-jeu-de-test.sql` — INSERT des données de test (idempotent). **Source
  unique** : clubs A/B, 3 comptes (admin, coach A, sans mapping), rencontre de
  test en phase `competition`, voies, équipes, grimpeurs, épreuves,
  compositions, jetons QR. Chargé automatiquement en local au `supabase db
  reset` (`config.toml` → `[db.seed]`).
- `02-volume-grimpeurs.sql` — **opt-in** (PAS dans `config.toml`, non chargé au
  reset). ~50 grimpeurs Club A/B (sexes mixtes) engagés 2/3 sur la rencontre
  **enfant**, 1/3 sur l'**ado** (+ équipe « Ados B1 »), pour tester le **calcul du
  score et les classements** (spec #7) à l'échelle. À appliquer **à la main** après
  `01`. UUID marqués `c0c0c0c0-…` ; purgé par `99` (clubs A/B + équipes des
  rencontres de test).
- `03-temps-vitesse-demo.sql` — **opt-in**. Saisit un **temps de vitesse** pour
  ~2/3 des engagés de chaque rencontre (mix temps / chute / non-présentation) afin
  de **peupler les classements de vitesse** sans saisie manuelle ; le trigger
  calcule les points. À appliquer après `01` (+ `02`) et les migrations
  vitesse. Purgé par `99` (via `temps_vitesse` des rencontres de test).
- `99-purge-jeu-de-test.sql` — DELETE borné aux seules données de test
  (rejouable). **Jamais chargé automatiquement** (exclu de `config.toml`) pour
  ne pas effacer le seed au reset.

> Marquage : toutes les lignes de test utilisent une **plage d'UUID réservée**
> (clubs `11…`/`22…`, rencontre `33…`, comptes `aaaa…`/`cccc…`/`5555…5555`),
> ce qui rend la purge prouvablement bornée.

## Cycle « rejouer un cahier de test »

**Depuis un état quelconque de la recette (reset global) :**

1. Exécuter `00-reset-recette.sql` (nettoie toutes les données sauf clubs/comptes/gabarits).
2. Exécuter `01-jeu-de-test.sql` (recharge un état initial connu).
3. Dérouler les cas du cahier, tracer les résultats.

**Depuis le jeu de données de test local (purge bornée) :**

1. Exécuter `99-purge-jeu-de-test.sql` (supprime uniquement les UUID de test).
2. Exécuter `01-jeu-de-test.sql` (recharge un état initial connu).
3. Dérouler les cas du cahier, tracer les résultats.

## Règles de sûreté

- Les données de test sont **marquées** de façon non ambiguë (préfixe, colonne
  `est_jeu_de_test`, ou plage d'`id` réservée).
- La purge doit être **prouvablement bornée** (clause `where` explicite). En cas
  de doute, ne pas exécuter.
- **Jamais** de seed ni de purge sur la base de prod.
