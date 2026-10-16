-- ===========================================================================
-- 202610161000_rapport_periodique
--
-- Objet : rapport périodique (spec #19, validée le 2026-10-16).
--   1. Table `interclub.rapport_periodique` : historique des rapports produits
--      tous les 3 jours par la route `/api/rapport` (R15, R16).
--   2. Accès (R19) : RLS activée, AUCUNE policy ; rien pour anon/authenticated.
--      Seul `service_role` insère (la route, gardée par CRON_SECRET) et lit
--      (diagnostic). L'admin consulte la table dans le Table Editor (postgres).
--   3. Extension pg_cron + tâche nommée `purge-rapport-periodique`, quotidienne
--      à 03:00 UTC : supprime les rapports de plus d'un mois (R20), et rien
--      d'autre (R21).
--
-- Dépendances : extension pg_cron disponible (Supabase : Database → Extensions).
-- Idempotent : create … if not exists ; cron.schedule remplace une tâche de même
--              nom.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

-- 1. Historique des rapports (R15).
create table if not exists interclub.rapport_periodique (
  id       uuid primary key default gen_random_uuid(),
  cree_le  timestamptz not null default now(),
  saison   int not null,
  contenu  jsonb not null
);
create index if not exists idx_rapport_periodique_cree_le
  on interclub.rapport_periodique (cree_le);

comment on table interclub.rapport_periodique is
  'Rapports périodiques (clubs, grimpeurs par tranche d''âge, rencontres de la saison), produits tous les 3 jours par le cron de l''hébergeur ; purgés après un mois (spec #19).';

-- 2. Accès (R19).
alter table interclub.rapport_periodique enable row level security;
revoke all on interclub.rapport_periodique from public, anon, authenticated;
grant select, insert on interclub.rapport_periodique to service_role;

-- 3. Purge quotidienne des rapports de plus d'un mois (R20, R21).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-rapport-periodique',
  '0 3 * * *',
  $$delete from interclub.rapport_periodique where cree_le < now() - interval '1 month'$$
);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610161000_rapport_periodique',
  'Rapport périodique (spec #19) : table rapport_periodique (RLS sans policy, select/insert service_role), extension pg_cron, tâche purge-rapport-periodique quotidienne 03:00 UTC (rapports de plus d''un mois).',
  'julleroyfr'
)
on conflict (version) do nothing;
