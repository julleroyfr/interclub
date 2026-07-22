-- Migration : 202607221150_voie_de_vitesse
-- Description : voies de l'épreuve de vitesse d'une rencontre (nombre
--               paramétrable). Un juge est affecté à une voie (cf. spec #2 R9b,
--               R17, R18). Dérivé de la spec #2
--               (docs/specs/02-authentification-et-sessions-qr.md).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- RLS : activée (fail-closed). Policies en T6.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2, §3, §5.

-- ---------------------------------------------------------------------------
-- voie_vitesse — couloir/ligne de l'épreuve de vitesse d'une rencontre.
--   Le nombre de voies est paramétrable (0..n par rencontre). Rattachée à la
--   rencontre (qui a au plus une épreuve de vitesse). NB : « voie » désigne ici
--   un couloir de vitesse, à ne pas confondre avec l'épreuve de type « voie »
--   (difficulté) de la table interclub.epreuve.
-- ---------------------------------------------------------------------------
create table if not exists interclub.voie_vitesse (
  id            uuid primary key default gen_random_uuid(),
  rencontre_id  uuid not null references interclub.rencontre (id) on delete cascade,
  numero        int not null check (numero > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (rencontre_id, numero)
);
create index if not exists idx_voie_vitesse_rencontre_id on interclub.voie_vitesse (rencontre_id);

drop trigger if exists trg_voie_vitesse_updated_at on interclub.voie_vitesse;
create trigger trg_voie_vitesse_updated_at before update on interclub.voie_vitesse
  for each row execute function interclub.set_updated_at();

alter table interclub.voie_vitesse enable row level security;

insert into interclub.version (version, description, applique_par)
values (
  '202607221150_voie_de_vitesse',
  'Voies de vitesse d''une rencontre (nombre paramétrable) + RLS activée.',
  'julleroyfr'
)
on conflict (version) do nothing;
