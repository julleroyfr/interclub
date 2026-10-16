# Cahier de test : Rapport périodique (spec #19)

- **Spec de référence** : `docs/specs/19-rapport-periodique.md`
- **Pré-requis** :
  - Migration **`202610161000_rapport_periodique`** appliquée à la main (recette,
    puis prod) : table `interclub.rapport_periodique`, extension `pg_cron`, tâche
    `purge-rapport-periodique`.
  - Variable **`CRON_SECRET`** définie sur Vercel : environnement **Production**
    (obligatoire), **Preview** (pour dérouler CT-01 à CT-04 en recette).
  - Accès au Dashboard Vercel (Settings → Cron Jobs, Logs) et au SQL Editor /
    Table Editor Supabase.
- **Environnement** : recette (preview) puis prod — version/commit : `______`
- **Validé en local le 2026-10-16** : migration appliquée et rejouée, tâche
  cron unique, purge (31 j supprimé, 29 j conservé), droits (`service_role`
  select/insert seulement), route 401 / 401 / 200 et ligne enregistrée.

## Jeu de données initial

- La base telle quelle (recette : seed ; prod : données réelles).
- Noter avant le test : nombre de clubs, de grimpeurs, de rencontres de la saison
  (requêtes SQL de CT-04).

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| — | aucun (appel `curl`) | la route n'a pas de session : seule compte la clé `CRON_SECRET` |
| `postgres` (SQL Editor) | administrateur base | contrôle de la table et de la purge |

`<URL>` désigne l'URL du déploiement testé (preview `develop` ou production).

## Cas de test

### CT-01 — Appel sans secret refusé (couvre : R4)

- **Étapes** : `curl -i <URL>/api/rapport`
- **Résultat attendu** : **401**, corps `{"erreur":"non_autorise"}`. Aucune
  nouvelle ligne dans `interclub.rapport_periodique`.

### CT-02 — Appel avec un mauvais secret refusé (couvre : R4)

- **Étapes** : `curl -i -H "Authorization: Bearer faux" <URL>/api/rapport`
- **Résultat attendu** : **401**. Aucune nouvelle ligne enregistrée.

### CT-03 — Secret non configuré (couvre : R5)

- **Étapes** : sur un déploiement **sans** `CRON_SECRET` (ex. preview avant
  d'avoir défini la variable), `curl -i -H "Authorization: Bearer x" <URL>/api/rapport`.
- **Résultat attendu** : **500**, corps `{"erreur":"non_configure"}` ; les logs
  contiennent `CRON_SECRET non configuré`. Aucune ligne enregistrée.

### CT-04 — Rapport produit, tracé et enregistré (couvre : R6–R16, R18)

- **Étapes** :
  1. `curl -i -H "Authorization: Bearer <CRON_SECRET>" <URL>/api/rapport`
  2. Vercel → Logs : chercher `[rapport-periodique]`.
  3. SQL Editor :

     ```sql
     select cree_le, saison, contenu from interclub.rapport_periodique
     order by cree_le desc limit 1;
     select count(*) from interclub.club;
     select count(*) from interclub.grimpeur;
     select categorie, count(*) from interclub.rencontre
     where date_rencontre between '2026-09-01' and '2027-08-31' group by 1;
     ```

- **Résultat attendu** :
  - **200**, corps avec `saison`, `clubs`, `grimpeurs` (enfant, pivot, ado,
    horsTranche, total) et `rencontres` (enfant, ado, total) — R18.
  - Une ligne de log `[rapport-periodique] {…}` sur une seule ligne — R14.
  - Une **nouvelle** ligne en table, `saison` = 2026, `contenu` identique au
    log — R15.
  - `nombreClubs` = nombre de clubs ; `totaux.total` = nombre de grimpeurs ;
    `nombreRencontres` = décompte SQL par catégorie — R8, R10, R13.
  - Chaque club figure, trié par nom, avec ses effectifs (un club sans grimpeur
    à 0) ; la somme des `total` des clubs = `totaux.total` — R9, R10.
  - Un grimpeur né en 2013 est en `pivot`, né en 2014 en `enfant`, né en 2012 en
    `ado`, né en 2006 ou avant en `horsTranche` — R7.
  - Rencontres de la saison seulement, triées par date puis enfant avant ado,
    avec porteur, phase et nombre d'équipes — R11, R12.
  - Rejouer l'appel : une **deuxième** ligne est ajoutée — R16.

### CT-05 — Cron déclaré en production uniquement (couvre : R1, R3)

- **Étapes** : Vercel → projet → Settings → **Cron Jobs**.
- **Résultat attendu** : un cron `/api/rapport`, planning `0 6 */3 * *`, actif
  sur **Production**. Bouton **Run** : une ligne est ajoutée en base de prod
  (CT-04). Aucun rapport n'apparaît en recette sans appel manuel.

### CT-06 — Exécution planifiée (couvre : R1, R2)

- **Étapes** : le lendemain d'un jour planifié (1, 4, 7, … du mois), consulter
  la table en prod.
- **Résultat attendu** : une ligne horodatée vers **06:00 UTC** ce jour-là. Le
  projet Supabase n'est pas mis en pause (Dashboard : statut actif).

### CT-07 — Purge des rapports de plus d'un mois (couvre : R20, R21)

- **Étapes** (SQL Editor) :

  ```sql
  select jobname, schedule, command from cron.job;
  insert into interclub.rapport_periodique (cree_le, saison, contenu)
  values (now() - interval '31 days', 2026, '{}'), (now() - interval '29 days', 2026, '{}');
  -- exécuter la commande de la tâche telle qu'affichée, puis :
  select cree_le from interclub.rapport_periodique order by cree_le;
  ```

  Le lendemain, consulter `cron.job_run_details` (dernière exécution de la tâche).
- **Résultat attendu** : une seule tâche `purge-rapport-periodique`, `0 3 * * *` ;
  la ligne de 31 jours est supprimée, celle de 29 jours conservée ; la tâche
  planifiée apparaît en `succeeded`. Aucune autre table n'est touchée. Supprimer
  ensuite la ligne de 29 jours.

### CT-08 — Table fermée à l'application (couvre : R19)

- **Étapes** : avec la clé `anon` (et un jeton de session admin),
  `curl "<SUPABASE_URL>/rest/v1/rapport_periodique?select=*" -H "apikey: <ANON>" -H "Accept-Profile: interclub"`.
- **Résultat attendu** : refus (`permission denied`) ou liste vide ; aucune
  donnée de rapport n'est renvoyée. Tentative d'`insert` refusée.

## Traçabilité règles ↔ cas

| Règle | Cas | Automatisé (Vitest) |
| ------- | ----- | ------------------- |
| R1, R3 | CT-05, CT-06 | — |
| R2 | CT-06 | — |
| R4 | CT-01, CT-02 | `verifierSecret` |
| R5 | CT-03 | `verifierSecret` |
| R6–R13 | CT-04 | `construireRapport`, `trancheAge` |
| R14 | CT-04 | `ligneLog` |
| R15, R16, R18 | CT-04 | — |
| R17 | — (échec de lecture non provoquable sans casser la base) | — |
| R19 | CT-08 | test ADR 0005 (exception) |
| R20, R21 | CT-07 | — |

## Exécution

| Date | Testeur | Environnement | Résultat (OK/KO) | Remarques |
| ------ | --------- | --------------- | ------------------ | ----------- |
| | | | | |
