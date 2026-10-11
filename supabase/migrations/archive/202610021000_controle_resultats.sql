-- ===========================================================================
-- 202610021000_controle_resultats
--
-- Objet : COCHE DE CONTRÔLE des résultats contre les fiches papier des juges
--         (spec #16). Ajoute sur `resultat_voie` ET `resultat_bloc` :
--           - controle_le  : horodatage de la coche ; la ligne est contrôlée
--                            ssi `controle_le is not null` (R5/R10) ;
--           - controle_par : admin auteur de la coche (R11), → auth.users.
--
-- Choix de modélisation : la coche est portée par la ligne de résultat
--         (1-pour-1, pas de nouvelle table) ; elle suit le résultat et est
--         CONSERVÉE si l'issue est corrigée ensuite (R14, décision 2026-10-02).
--         `controle_par` référence `auth.users(id)` comme l'auteur de saisie
--         (spec #9 R14) ; `on delete set null` : la suppression d'un compte
--         n'efface pas la coche (auteur devenu inconnu).
--
-- Cohérence : pas d'auteur sans coche ; l'inverse est toléré (compte supprimé).
--
-- RLS / grants : AUCUN changement. L'écriture admin passe par la branche
--         `est_admin()` des policies `resultat_*_update` (migration
--         202609081000) ; le gating ④ clôture est porté par la Server Action
--         (R13). Realtime : tables déjà publiées (migration 202609231000) —
--         rien à ajouter (R12bis).
--
-- Hors score : ces colonnes n'entrent NI dans le score NI dans les
--         classements (spec #7).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `add column if not exists`, `drop constraint if exists`.
-- ===========================================================================

-- resultat_voie
alter table interclub.resultat_voie
  add column if not exists controle_le timestamptz,
  add column if not exists controle_par uuid
    references auth.users (id) on delete set null;

alter table interclub.resultat_voie
  drop constraint if exists resultat_voie_controle_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_controle_check
  check (controle_par is null or controle_le is not null);

-- resultat_bloc
alter table interclub.resultat_bloc
  add column if not exists controle_le timestamptz,
  add column if not exists controle_par uuid
    references auth.users (id) on delete set null;

alter table interclub.resultat_bloc
  drop constraint if exists resultat_bloc_controle_check;
alter table interclub.resultat_bloc
  add constraint resultat_bloc_controle_check
  check (controle_par is null or controle_le is not null);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610021000_controle_resultats',
  'Coche de contrôle des résultats contre les fiches de juges (spec #16) : colonnes controle_le (timestamptz) et controle_par (→ auth.users, on delete set null) sur resultat_voie/resultat_bloc, check pas d''auteur sans coche. Aucun changement RLS/grant/realtime.',
  'julleroyfr'
)
on conflict (version) do nothing;
