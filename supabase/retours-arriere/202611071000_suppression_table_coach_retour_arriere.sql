-- ===========================================================================
-- Retour arrière de 202611071000_suppression_table_coach
--
-- Recrée `interclub.coach` à l'identique de la migration socle 202607221100
-- (colonnes, index, trigger updated_at, RLS activée sans policy ni grant).
-- La table était vide : aucune donnée à restaurer.
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

create table if not exists interclub.coach (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references interclub.club (id) on delete cascade,
  est_permanent boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_coach_club_id on interclub.coach (club_id);

drop trigger if exists trg_coach_updated_at on interclub.coach;
create trigger trg_coach_updated_at before update on interclub.coach
  for each row execute function interclub.set_updated_at();

alter table interclub.coach enable row level security;

delete from interclub.version
where version = '202611071000_suppression_table_coach';

commit;
