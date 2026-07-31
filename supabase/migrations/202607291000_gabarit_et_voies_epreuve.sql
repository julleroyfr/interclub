-- Migration : 202607291000_gabarit_et_voies_epreuve
-- Description : gabarit de rencontre par catégorie (spec #3 R29–R37) + tables
--               voie_difficulte et bloc instanciées sur les épreuves + libellé
--               sur voie_vitesse + RPC creer_rencontre_avec_gabarit (copie
--               atomique gabarit → rencontre, R30) + seed des deux gabarits
--               (enfant R33, ado R34).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--               recette, puis prod à la bascule sur `main`.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2, §3, §5.

-- ===========================================================================
-- 1. Tables gabarit — modèle de format configurable par catégorie (R29)
-- ===========================================================================

-- gabarit_epreuve : une ligne par (catégorie, type d'épreuve).
create table if not exists interclub.gabarit_epreuve (
  id         uuid primary key default gen_random_uuid(),
  categorie  text not null check (categorie in ('enfant', 'ado')),
  type       text not null check (type in ('voie', 'bloc', 'vitesse')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categorie, type)
);

-- gabarit_voie_difficulte : voies de difficulté du gabarit.
--   niveau : M1–M4 (moulinette) ou T1–T10 (tête) — contraint en app (R37).
--   Le niveau n'est pas unique : un même niveau peut être doublé/triplé.
create table if not exists interclub.gabarit_voie_difficulte (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  niveau              text not null,
  type_voie           text not null check (type_voie in ('moulinette', 'tete')),
  cotation            text not null,
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_gabarit_voie_diff_epreuve
  on interclub.gabarit_voie_difficulte (gabarit_epreuve_id);

-- gabarit_bloc : blocs du gabarit (B1, B2).
create table if not exists interclub.gabarit_bloc (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  code                text not null,
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (gabarit_epreuve_id, code)
);
create index if not exists idx_gabarit_bloc_epreuve
  on interclub.gabarit_bloc (gabarit_epreuve_id);

-- gabarit_voie_vitesse : voies de vitesse du gabarit (Filles, Garçons).
create table if not exists interclub.gabarit_voie_vitesse (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  libelle             text not null,
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_gabarit_voie_vitesse_epreuve
  on interclub.gabarit_voie_vitesse (gabarit_epreuve_id);

-- ===========================================================================
-- 2. Tables rencontre instanciées (voies de difficulté + blocs)
-- ===========================================================================

-- voie_difficulte : voies de difficulté d'une épreuve de type 'voie'.
--   Alimentée par copie du gabarit à la création (R30) ou ajout post-création
--   (R36). Le niveau n'est pas unique dans l'épreuve (doublé/triplé possible).
create table if not exists interclub.voie_difficulte (
  id          uuid primary key default gen_random_uuid(),
  epreuve_id  uuid not null references interclub.epreuve (id) on delete cascade,
  niveau      text not null,
  type_voie   text not null check (type_voie in ('moulinette', 'tete')),
  cotation    text not null,
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_voie_difficulte_epreuve_id
  on interclub.voie_difficulte (epreuve_id);

-- bloc : blocs d'une épreuve de type 'bloc' (B1, B2, …).
create table if not exists interclub.bloc (
  id          uuid primary key default gen_random_uuid(),
  epreuve_id  uuid not null references interclub.epreuve (id) on delete cascade,
  code        text not null,
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (epreuve_id, code)
);
create index if not exists idx_bloc_epreuve_id
  on interclub.bloc (epreuve_id);

-- ===========================================================================
-- 3. Ajout de libelle sur voie_vitesse (R31/R32)
-- ===========================================================================

alter table interclub.voie_vitesse
  add column if not exists libelle text;

-- ===========================================================================
-- 4. Triggers updated_at
-- ===========================================================================

drop trigger if exists trg_gabarit_epreuve_updated_at on interclub.gabarit_epreuve;
create trigger trg_gabarit_epreuve_updated_at
  before update on interclub.gabarit_epreuve
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_gabarit_voie_diff_updated_at on interclub.gabarit_voie_difficulte;
create trigger trg_gabarit_voie_diff_updated_at
  before update on interclub.gabarit_voie_difficulte
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_gabarit_bloc_updated_at on interclub.gabarit_bloc;
create trigger trg_gabarit_bloc_updated_at
  before update on interclub.gabarit_bloc
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_gabarit_voie_vitesse_updated_at on interclub.gabarit_voie_vitesse;
create trigger trg_gabarit_voie_vitesse_updated_at
  before update on interclub.gabarit_voie_vitesse
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_voie_difficulte_updated_at on interclub.voie_difficulte;
create trigger trg_voie_difficulte_updated_at
  before update on interclub.voie_difficulte
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_bloc_updated_at on interclub.bloc;
create trigger trg_bloc_updated_at
  before update on interclub.bloc
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 5. RLS — activée sur les nouvelles tables (fail-closed)
-- ===========================================================================

alter table interclub.gabarit_epreuve        enable row level security;
alter table interclub.gabarit_voie_difficulte enable row level security;
alter table interclub.gabarit_bloc            enable row level security;
alter table interclub.gabarit_voie_vitesse    enable row level security;
alter table interclub.voie_difficulte         enable row level security;
alter table interclub.bloc                    enable row level security;

-- Gabarit : lecture pour tous les comptes authentifiés, écriture admin seul.
create policy gabarit_epreuve_select_authenticated
  on interclub.gabarit_epreuve for select
  to authenticated using (true);

create policy gabarit_epreuve_all_admin
  on interclub.gabarit_epreuve for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy gabarit_voie_diff_select_authenticated
  on interclub.gabarit_voie_difficulte for select
  to authenticated using (true);

create policy gabarit_voie_diff_all_admin
  on interclub.gabarit_voie_difficulte for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy gabarit_bloc_select_authenticated
  on interclub.gabarit_bloc for select
  to authenticated using (true);

create policy gabarit_bloc_all_admin
  on interclub.gabarit_bloc for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy gabarit_voie_vitesse_select_authenticated
  on interclub.gabarit_voie_vitesse for select
  to authenticated using (true);

create policy gabarit_voie_vitesse_all_admin
  on interclub.gabarit_voie_vitesse for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

-- voie_difficulte / bloc : admin full, lecture en phase résultats publics.
create policy voie_difficulte_all_admin
  on interclub.voie_difficulte for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy voie_difficulte_select_authenticated
  on interclub.voie_difficulte for select
  to authenticated
  using (
    exists (
      select 1 from interclub.epreuve e
      join interclub.rencontre r on r.id = e.rencontre_id
      where e.id = voie_difficulte.epreuve_id
        and r.phase = 'resultats_publics'
    )
    or interclub.est_admin()
  );

create policy bloc_all_admin
  on interclub.bloc for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bloc_select_authenticated
  on interclub.bloc for select
  to authenticated
  using (
    exists (
      select 1 from interclub.epreuve e
      join interclub.rencontre r on r.id = e.rencontre_id
      where e.id = bloc.epreuve_id
        and r.phase = 'resultats_publics'
    )
    or interclub.est_admin()
  );

-- ===========================================================================
-- 6. Grants service_role sur les nouvelles tables (lecture catalogue admin)
-- ===========================================================================

grant usage on schema interclub to service_role;
grant select on interclub.gabarit_epreuve         to service_role;
grant select on interclub.gabarit_voie_difficulte  to service_role;
grant select on interclub.gabarit_bloc             to service_role;
grant select on interclub.gabarit_voie_vitesse     to service_role;
grant select on interclub.voie_difficulte          to service_role;
grant select on interclub.bloc                     to service_role;

-- ===========================================================================
-- 7. RPC creer_rencontre_avec_gabarit — copie atomique gabarit → rencontre
--    (R30 : transaction annulée dans son intégralité si l'une des étapes échoue)
-- ===========================================================================

create or replace function interclub.creer_rencontre_avec_gabarit(
  p_date           date,
  p_club_porteur   uuid,
  p_categorie      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rencontre_id  uuid;
  v_epreuve_id    uuid;
  v_ge            record;
begin
  -- Garde : catégorie valide (redondant avec la contrainte SQL, défense en
  -- profondeur côté fonction).
  if p_categorie not in ('enfant', 'ado') then
    raise exception 'Catégorie invalide : %', p_categorie;
  end if;

  -- 1. Créer la rencontre (phase pré-compétition par défaut).
  insert into interclub.rencontre (date_rencontre, club_porteur_id, categorie)
  values (p_date, p_club_porteur, p_categorie)
  returning id into v_rencontre_id;

  -- 2. Copier chaque épreuve du gabarit.
  for v_ge in
    select id, type
    from interclub.gabarit_epreuve
    where categorie = p_categorie
    order by type  -- ordre stable
  loop
    insert into interclub.epreuve (rencontre_id, type)
    values (v_rencontre_id, v_ge.type)
    returning id into v_epreuve_id;

    -- Voies de difficulté
    insert into interclub.voie_difficulte (epreuve_id, niveau, type_voie, cotation, ordre)
    select v_epreuve_id, niveau, type_voie, cotation, ordre
    from interclub.gabarit_voie_difficulte
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Blocs
    insert into interclub.bloc (epreuve_id, code, ordre)
    select v_epreuve_id, code, ordre
    from interclub.gabarit_bloc
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Voies de vitesse (rattachées à la rencontre, pas à l'épreuve — modèle existant)
    insert into interclub.voie_vitesse (rencontre_id, numero, libelle)
    select
      v_rencontre_id,
      (row_number() over (order by ordre))::int,
      libelle
    from interclub.gabarit_voie_vitesse
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

  end loop;

  return v_rencontre_id;
end;
$$;

-- ===========================================================================
-- 8. Seed — gabarit enfant (R33) et ado (R34)
--    Idempotent : on n'insère que si la ligne n'existe pas encore.
-- ===========================================================================

do $$
declare
  -- gabarit_epreuve IDs
  ge_enfant_voie     uuid;
  ge_enfant_bloc     uuid;
  ge_enfant_vitesse  uuid;
  ge_ado_voie        uuid;
  ge_ado_bloc        uuid;
  ge_ado_vitesse     uuid;
begin

  -- ---- Gabarit enfant ----

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('enfant', 'voie')
  on conflict (categorie, type) do nothing
  returning id into ge_enfant_voie;

  if ge_enfant_voie is null then
    select id into ge_enfant_voie
    from interclub.gabarit_epreuve
    where categorie = 'enfant' and type = 'voie';
  end if;

  -- Voies moulinette enfant : M1–M4
  insert into interclub.gabarit_voie_difficulte
    (gabarit_epreuve_id, niveau, type_voie, cotation, ordre)
  values
    (ge_enfant_voie, 'M1', 'moulinette', '4c',  1),
    (ge_enfant_voie, 'M2', 'moulinette', '5a',  2),
    (ge_enfant_voie, 'M3', 'moulinette', '5b',  3),
    (ge_enfant_voie, 'M4', 'moulinette', '5c',  4),
    -- Voies tête enfant : T1–T10
    (ge_enfant_voie, 'T1',  'tete', '4c',   5),
    (ge_enfant_voie, 'T2',  'tete', '4c+',  6),
    (ge_enfant_voie, 'T3',  'tete', '5a',   7),
    (ge_enfant_voie, 'T4',  'tete', '5b',   8),
    (ge_enfant_voie, 'T5',  'tete', '5c',   9),
    (ge_enfant_voie, 'T6',  'tete', '6a',  10),
    (ge_enfant_voie, 'T7',  'tete', '6b',  11),
    (ge_enfant_voie, 'T8',  'tete', '6c',  12),
    (ge_enfant_voie, 'T9',  'tete', '7a',  13),
    (ge_enfant_voie, 'T10', 'tete', '7c',  14)
  on conflict do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('enfant', 'bloc')
  on conflict (categorie, type) do nothing
  returning id into ge_enfant_bloc;

  if ge_enfant_bloc is null then
    select id into ge_enfant_bloc
    from interclub.gabarit_epreuve
    where categorie = 'enfant' and type = 'bloc';
  end if;

  insert into interclub.gabarit_bloc (gabarit_epreuve_id, code, ordre)
  values
    (ge_enfant_bloc, 'B1', 1),
    (ge_enfant_bloc, 'B2', 2)
  on conflict (gabarit_epreuve_id, code) do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('enfant', 'vitesse')
  on conflict (categorie, type) do nothing
  returning id into ge_enfant_vitesse;

  if ge_enfant_vitesse is null then
    select id into ge_enfant_vitesse
    from interclub.gabarit_epreuve
    where categorie = 'enfant' and type = 'vitesse';
  end if;

  insert into interclub.gabarit_voie_vitesse (gabarit_epreuve_id, libelle, ordre)
  values
    (ge_enfant_vitesse, 'Filles',  1),
    (ge_enfant_vitesse, 'Garçons', 2)
  on conflict do nothing;

  -- ---- Gabarit ado ----

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('ado', 'voie')
  on conflict (categorie, type) do nothing
  returning id into ge_ado_voie;

  if ge_ado_voie is null then
    select id into ge_ado_voie
    from interclub.gabarit_epreuve
    where categorie = 'ado' and type = 'voie';
  end if;

  -- Voies tête ado : T1–T10 (pas de moulinette, R34/R37)
  insert into interclub.gabarit_voie_difficulte
    (gabarit_epreuve_id, niveau, type_voie, cotation, ordre)
  values
    (ge_ado_voie, 'T1',  'tete', '4c',   1),
    (ge_ado_voie, 'T2',  'tete', '4c+',  2),
    (ge_ado_voie, 'T3',  'tete', '5a',   3),
    (ge_ado_voie, 'T4',  'tete', '5b',   4),
    (ge_ado_voie, 'T5',  'tete', '5c',   5),
    (ge_ado_voie, 'T6',  'tete', '6a',   6),
    (ge_ado_voie, 'T7',  'tete', '6b',   7),
    (ge_ado_voie, 'T8',  'tete', '6c',   8),
    (ge_ado_voie, 'T9',  'tete', '7a',   9),
    (ge_ado_voie, 'T10', 'tete', '7c',  10)
  on conflict do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('ado', 'bloc')
  on conflict (categorie, type) do nothing
  returning id into ge_ado_bloc;

  if ge_ado_bloc is null then
    select id into ge_ado_bloc
    from interclub.gabarit_epreuve
    where categorie = 'ado' and type = 'bloc';
  end if;

  insert into interclub.gabarit_bloc (gabarit_epreuve_id, code, ordre)
  values
    (ge_ado_bloc, 'B1', 1),
    (ge_ado_bloc, 'B2', 2)
  on conflict (gabarit_epreuve_id, code) do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('ado', 'vitesse')
  on conflict (categorie, type) do nothing
  returning id into ge_ado_vitesse;

  if ge_ado_vitesse is null then
    select id into ge_ado_vitesse
    from interclub.gabarit_epreuve
    where categorie = 'ado' and type = 'vitesse';
  end if;

  insert into interclub.gabarit_voie_vitesse (gabarit_epreuve_id, libelle, ordre)
  values
    (ge_ado_vitesse, 'Filles',  1),
    (ge_ado_vitesse, 'Garçons', 2)
  on conflict do nothing;

end;
$$;

-- ===========================================================================
-- 9. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202607291000_gabarit_et_voies_epreuve',
  'Gabarit de rencontre par catégorie (gabarit_epreuve/voie_difficulte/bloc/voie_vitesse) + tables rencontre voie_difficulte/bloc + libelle voie_vitesse + RPC creer_rencontre_avec_gabarit + seed enfant/ado.',
  'julleroyfr'
)
on conflict (version) do nothing;
