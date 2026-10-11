-- Migration : points des voies de difficulté (R38) et paliers de blocs (R39)
-- Spec #3 — « profiter de la configuration des gabarits pour ajouter les points ».
--
-- Périmètre : voies de difficulté (points voie entière + prise valorisée enfant /
-- zones ado) et blocs (paliers de points). Points de vitesse = hors périmètre
-- (itération dédiée, cf. spec §Hors périmètre).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Colonnes de points sur les voies de difficulté (gabarit + rencontre) — R38
-- ===========================================================================

alter table interclub.gabarit_voie_difficulte
  add column if not exists points                    int not null default 0
    check (points >= 0),
  add column if not exists points_prise_valorisee    int
    check (points_prise_valorisee is null or points_prise_valorisee >= 0),
  add column if not exists points_zone1              int
    check (points_zone1 is null or points_zone1 >= 0),
  add column if not exists points_zone2              int
    check (points_zone2 is null or points_zone2 >= 0);

alter table interclub.voie_difficulte
  add column if not exists points                    int not null default 0
    check (points >= 0),
  add column if not exists points_prise_valorisee    int
    check (points_prise_valorisee is null or points_prise_valorisee >= 0),
  add column if not exists points_zone1              int
    check (points_zone1 is null or points_zone1 >= 0),
  add column if not exists points_zone2              int
    check (points_zone2 is null or points_zone2 >= 0);

-- ===========================================================================
-- 2. Tables de paliers de blocs (gabarit + rencontre) — R39
-- ===========================================================================

create table if not exists interclub.gabarit_bloc_palier (
  id               uuid primary key default gen_random_uuid(),
  gabarit_bloc_id  uuid not null
                     references interclub.gabarit_bloc (id) on delete cascade,
  libelle          text not null,
  points           int  not null check (points >= 0),
  ordre            int  not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_gabarit_bloc_palier_bloc
  on interclub.gabarit_bloc_palier (gabarit_bloc_id);

create table if not exists interclub.bloc_palier (
  id          uuid primary key default gen_random_uuid(),
  bloc_id     uuid not null references interclub.bloc (id) on delete cascade,
  libelle     text not null,
  points      int  not null check (points >= 0),
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_bloc_palier_bloc
  on interclub.bloc_palier (bloc_id);

-- ===========================================================================
-- 3. Triggers updated_at
-- ===========================================================================

drop trigger if exists trg_gabarit_bloc_palier_updated_at on interclub.gabarit_bloc_palier;
create trigger trg_gabarit_bloc_palier_updated_at
  before update on interclub.gabarit_bloc_palier
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_bloc_palier_updated_at on interclub.bloc_palier;
create trigger trg_bloc_palier_updated_at
  before update on interclub.bloc_palier
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 4. RLS — paliers (mêmes règles que leur bloc parent)
-- ===========================================================================

alter table interclub.gabarit_bloc_palier enable row level security;
alter table interclub.bloc_palier         enable row level security;

create policy gabarit_bloc_palier_select_authenticated
  on interclub.gabarit_bloc_palier for select
  to authenticated using (true);

create policy gabarit_bloc_palier_all_admin
  on interclub.gabarit_bloc_palier for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bloc_palier_all_admin
  on interclub.bloc_palier for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bloc_palier_select_authenticated
  on interclub.bloc_palier for select
  to authenticated
  using (
    exists (
      select 1
      from interclub.bloc b
      join interclub.epreuve e on e.id = b.epreuve_id
      join interclub.rencontre r on r.id = e.rencontre_id
      where b.id = bloc_palier.bloc_id
        and r.phase = 'resultats_publics'
    )
    or interclub.est_admin()
  );

-- ===========================================================================
-- 5. Grants service_role (lecture catalogue admin)
-- ===========================================================================

grant select on interclub.gabarit_bloc_palier to service_role;
grant select on interclub.bloc_palier          to service_role;

-- ===========================================================================
-- 6. RPC creer_rencontre_avec_gabarit — copie des points et paliers (R30)
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
  v_bloc_id       uuid;
  v_ge            record;
  v_gb            record;
begin
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
    order by type
  loop
    insert into interclub.epreuve (rencontre_id, type)
    values (v_rencontre_id, v_ge.type)
    returning id into v_epreuve_id;

    -- Voies de difficulté (avec points, R38)
    insert into interclub.voie_difficulte
      (epreuve_id, niveau, type_voie, cotation, points,
       points_prise_valorisee, points_zone1, points_zone2, ordre)
    select
      v_epreuve_id, niveau, type_voie, cotation, points,
      points_prise_valorisee, points_zone1, points_zone2, ordre
    from interclub.gabarit_voie_difficulte
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Blocs et leurs paliers (R39)
    for v_gb in
      select id, code, ordre
      from interclub.gabarit_bloc
      where gabarit_epreuve_id = v_ge.id
      order by ordre
    loop
      insert into interclub.bloc (epreuve_id, code, ordre)
      values (v_epreuve_id, v_gb.code, v_gb.ordre)
      returning id into v_bloc_id;

      insert into interclub.bloc_palier (bloc_id, libelle, points, ordre)
      select v_bloc_id, libelle, points, ordre
      from interclub.gabarit_bloc_palier
      where gabarit_bloc_id = v_gb.id
      order by ordre;
    end loop;

    -- Voies de vitesse (rattachées à la rencontre — modèle existant)
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
-- 7. Seed — points des voies (R38) et paliers de blocs (R39)
--    Idempotent : UPDATE des points par niveau ; paliers insérés si absents.
-- ===========================================================================

-- Points voies enfant (§ Matin) — par niveau.
update interclub.gabarit_voie_difficulte v
set points = m.pts, points_prise_valorisee = m.pv
from (values
  ('M1', 1, null::int), ('M2', 2, null), ('M3', 3, null), ('M4', 4, null),
  ('T1', 5, 3), ('T2', 6, 3), ('T3', 7, 4), ('T4', 8, 4), ('T5', 9, 5),
  ('T6', 10, 5), ('T7', 11, 6), ('T8', 12, 6), ('T9', 13, 7), ('T10', 14, 8)
) as m(niveau, pts, pv)
where v.niveau = m.niveau
  and v.gabarit_epreuve_id in (
    select id from interclub.gabarit_epreuve where categorie = 'enfant' and type = 'voie'
  );

-- Points voies ado (§ Après-midi) — par niveau (zone1/zone2/voie entière).
update interclub.gabarit_voie_difficulte v
set points = a.pts, points_zone1 = a.z1, points_zone2 = a.z2
from (values
  ('T1', 4, 1, 2), ('T2', 6, 3, 4), ('T3', 8, 5, 6), ('T4', 10, 7, 8),
  ('T5', 12, 9, 10), ('T6', 14, 11, 12), ('T7', 16, 13, 14), ('T8', 18, 15, 16),
  ('T9', 20, 17, 18), ('T10', 22, 19, 20)
) as a(niveau, pts, z1, z2)
where v.niveau = a.niveau
  and v.gabarit_epreuve_id in (
    select id from interclub.gabarit_epreuve where categorie = 'ado' and type = 'voie'
  );

-- Paliers de blocs — enfant (par essai) et ado (par zone).
do $$
declare
  b_enfant_b1 uuid;
  b_enfant_b2 uuid;
  b_ado_b1    uuid;
  b_ado_b2    uuid;
begin
  select gb.id into b_enfant_b1
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'enfant' and ge.type = 'bloc' and gb.code = 'B1';

  select gb.id into b_enfant_b2
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'enfant' and ge.type = 'bloc' and gb.code = 'B2';

  select gb.id into b_ado_b1
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'ado' and ge.type = 'bloc' and gb.code = 'B1';

  select gb.id into b_ado_b2
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'ado' and ge.type = 'bloc' and gb.code = 'B2';

  -- N'insère que si le bloc n'a pas déjà de paliers (idempotence).
  if b_enfant_b1 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_enfant_b1
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_enfant_b1, '1er essai', 4, 1), (b_enfant_b1, '2e essai', 3, 2);
  end if;

  if b_enfant_b2 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_enfant_b2
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_enfant_b2, '1er essai', 6, 1), (b_enfant_b2, '2e essai', 5, 2),
           (b_enfant_b2, '3e essai', 4, 3);
  end if;

  if b_ado_b1 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_ado_b1
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_ado_b1, 'Zone', 10, 1), (b_ado_b1, 'Bloc complet', 30, 2);
  end if;

  if b_ado_b2 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_ado_b2
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_ado_b2, 'Zone 1', 20, 1), (b_ado_b2, 'Zone 2', 40, 2),
           (b_ado_b2, 'Bloc complet', 60, 3);
  end if;
end;
$$;

-- ===========================================================================
-- 8. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202607311000_points_gabarit_voie_bloc',
  'Points des voies de difficulté (voie entière + prise valorisée enfant / zones ado, R38) + paliers de blocs (R39) sur gabarit et rencontre + copie RPC + seed barème CT33.',
  'julleroyfr'
)
