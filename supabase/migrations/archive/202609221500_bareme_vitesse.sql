-- Migration : barème de vitesse par rang (spec #3 R46) — gabarit + rencontre.
-- Comble le report de la spec #3 R39 (« points de vitesse hors périmètre »).
--
-- Le barème de vitesse est un barème PAR RANG propre à l'épreuve de vitesse :
--   - des ÉCHELONS (rang_min, rang_max, points, décrément) : dans un échelon, le
--     rang r vaut points - (r - rang_min) * decrement (decrement = 0 => palier
--     plat) ; rang_max NULL = « au-delà » (dernier échelon, sans borne haute) ;
--   - deux points fixes : chute et non-présentation, portés par l'épreuve.
-- Barème identique Filles/Garçons ; seul le CLASSEMENT est séparé par sexe. Le
-- CALCUL des points relève de la spec #7 (R16–R20, migration suivante : trigger).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Points fixes chute / non-présentation sur l'épreuve (gabarit + rencontre)
--    Nullables (n'ont de sens que pour une épreuve de type vitesse) ; >= 0.
-- ===========================================================================

alter table interclub.gabarit_epreuve
  add column if not exists points_chute             int check (points_chute is null or points_chute >= 0),
  add column if not exists points_non_presentation  int check (points_non_presentation is null or points_non_presentation >= 0);

alter table interclub.epreuve
  add column if not exists points_chute             int check (points_chute is null or points_chute >= 0),
  add column if not exists points_non_presentation  int check (points_non_presentation is null or points_non_presentation >= 0);

-- ===========================================================================
-- 2. Tables d'échelons du barème par rang (gabarit + rencontre) — R46
-- ===========================================================================

create table if not exists interclub.gabarit_bareme_vitesse_echelon (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  rang_min            int  not null check (rang_min >= 1),
  rang_max            int  check (rang_max is null or rang_max >= rang_min),
  points              int  not null check (points >= 0),
  decrement           int  not null default 0 check (decrement >= 0),
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_gabarit_bareme_vitesse_echelon_epreuve
  on interclub.gabarit_bareme_vitesse_echelon (gabarit_epreuve_id);

create table if not exists interclub.bareme_vitesse_echelon (
  id          uuid primary key default gen_random_uuid(),
  epreuve_id  uuid not null references interclub.epreuve (id) on delete cascade,
  rang_min    int  not null check (rang_min >= 1),
  rang_max    int  check (rang_max is null or rang_max >= rang_min),
  points      int  not null check (points >= 0),
  decrement   int  not null default 0 check (decrement >= 0),
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_bareme_vitesse_echelon_epreuve
  on interclub.bareme_vitesse_echelon (epreuve_id);

-- ===========================================================================
-- 3. Triggers updated_at
-- ===========================================================================

drop trigger if exists trg_gabarit_bareme_vitesse_echelon_updated_at
  on interclub.gabarit_bareme_vitesse_echelon;
create trigger trg_gabarit_bareme_vitesse_echelon_updated_at
  before update on interclub.gabarit_bareme_vitesse_echelon
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_bareme_vitesse_echelon_updated_at
  on interclub.bareme_vitesse_echelon;
create trigger trg_bareme_vitesse_echelon_updated_at
  before update on interclub.bareme_vitesse_echelon
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 4. RLS — barème (mêmes règles que les points de voie/bloc, spec #3)
--    Gabarit : lecture authentifiée ; écriture admin.
--    Rencontre : écriture admin ; lecture admin ou « résultats visibles » (③+).
-- ===========================================================================

alter table interclub.gabarit_bareme_vitesse_echelon enable row level security;
alter table interclub.bareme_vitesse_echelon         enable row level security;

create policy gabarit_bareme_vitesse_echelon_select_authenticated
  on interclub.gabarit_bareme_vitesse_echelon for select
  to authenticated using (true);

create policy gabarit_bareme_vitesse_echelon_all_admin
  on interclub.gabarit_bareme_vitesse_echelon for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bareme_vitesse_echelon_all_admin
  on interclub.bareme_vitesse_echelon for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bareme_vitesse_echelon_select_authenticated
  on interclub.bareme_vitesse_echelon for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1
      from interclub.epreuve e
      where e.id = bareme_vitesse_echelon.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

-- ===========================================================================
-- 5. Grants (authenticated pour la RLS ; service_role pour l'assemblage serveur)
-- ===========================================================================

grant select, insert, update, delete
  on interclub.gabarit_bareme_vitesse_echelon to authenticated;
grant select, insert, update, delete
  on interclub.bareme_vitesse_echelon         to authenticated;
grant select on interclub.gabarit_bareme_vitesse_echelon to service_role;
grant select on interclub.bareme_vitesse_echelon         to service_role;

-- ===========================================================================
-- 6. RPC creer_rencontre_avec_gabarit — copie du barème de vitesse (R30/R46)
--    Réécriture complète : ajoute la copie de points_chute/points_non_presentation
--    (épreuve) et des échelons de barème de vitesse.
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

  -- 2. Copier chaque épreuve du gabarit (points chute/NP compris).
  for v_ge in
    select id, type, points_chute, points_non_presentation
    from interclub.gabarit_epreuve
    where categorie = p_categorie
    order by type
  loop
    insert into interclub.epreuve
      (rencontre_id, type, points_chute, points_non_presentation)
    values
      (v_rencontre_id, v_ge.type, v_ge.points_chute, v_ge.points_non_presentation)
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

    -- Barème de vitesse — échelons par rang (R46)
    insert into interclub.bareme_vitesse_echelon
      (epreuve_id, rang_min, rang_max, points, decrement, ordre)
    select
      v_epreuve_id, rang_min, rang_max, points, decrement, ordre
    from interclub.gabarit_bareme_vitesse_echelon
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

  end loop;

  return v_rencontre_id;
end;
$$;

-- ===========================================================================
-- 7. Seed du barème gabarit (§ Matin enfant / § Après-midi ado, CT33 v3)
--    Idempotent : points chute/NP par UPDATE ; échelons insérés si absents.
-- ===========================================================================

-- Points fixes chute / non-présentation sur les épreuves de vitesse du gabarit.
update interclub.gabarit_epreuve
set points_chute = 1, points_non_presentation = 0
where type = 'vitesse' and categorie = 'enfant';

update interclub.gabarit_epreuve
set points_chute = 5, points_non_presentation = 0
where type = 'vitesse' and categorie = 'ado';

-- Échelons du barème par rang.
do $$
declare
  ge_enfant uuid;
  ge_ado    uuid;
begin
  select id into ge_enfant
  from interclub.gabarit_epreuve where categorie = 'enfant' and type = 'vitesse';
  select id into ge_ado
  from interclub.gabarit_epreuve where categorie = 'ado' and type = 'vitesse';

  -- Enfant (§ Matin) : 1–5 (15,−1), puis paliers plats par 5, au-delà 45 = 2.
  if ge_enfant is not null and not exists (
    select 1 from interclub.gabarit_bareme_vitesse_echelon where gabarit_epreuve_id = ge_enfant
  ) then
    insert into interclub.gabarit_bareme_vitesse_echelon
      (gabarit_epreuve_id, rang_min, rang_max, points, decrement, ordre)
    values
      (ge_enfant,  1,   5, 15, 1,  1),
      (ge_enfant,  6,  10, 10, 0,  2),
      (ge_enfant, 11,  15,  9, 0,  3),
      (ge_enfant, 16,  20,  8, 0,  4),
      (ge_enfant, 21,  25,  7, 0,  5),
      (ge_enfant, 26,  30,  6, 0,  6),
      (ge_enfant, 31,  35,  5, 0,  7),
      (ge_enfant, 36,  40,  4, 0,  8),
      (ge_enfant, 41,  45,  3, 0,  9),
      (ge_enfant, 46, null,  2, 0, 10);
  end if;

  -- Ado (§ Après-midi) : 1–5 (60,−1), 6–50 (55,−1 => 55..11), au-delà 50 = 10.
  if ge_ado is not null and not exists (
    select 1 from interclub.gabarit_bareme_vitesse_echelon where gabarit_epreuve_id = ge_ado
  ) then
    insert into interclub.gabarit_bareme_vitesse_echelon
      (gabarit_epreuve_id, rang_min, rang_max, points, decrement, ordre)
    values
      (ge_ado,  1,   5, 60, 1, 1),
      (ge_ado,  6,  50, 55, 1, 2),
      (ge_ado, 51, null, 10, 0, 3);
  end if;
end;
$$;

-- ===========================================================================
-- 8. Backfill des rencontres existantes (épreuves de vitesse déjà créées)
--    Renseigne points chute/NP + échelons par catégorie, si manquants, pour que
--    le calcul (spec #7) fonctionne aussi sur les rencontres pré-existantes.
-- ===========================================================================

update interclub.epreuve e
set points_chute = case r.categorie when 'enfant' then 1 when 'ado' then 5 end,
    points_non_presentation = 0
from interclub.rencontre r
where e.rencontre_id = r.id
  and e.type = 'vitesse'
  and (e.points_chute is null or e.points_non_presentation is null);

insert into interclub.bareme_vitesse_echelon
  (epreuve_id, rang_min, rang_max, points, decrement, ordre)
select e.id, g.rang_min, g.rang_max, g.points, g.decrement, g.ordre
from interclub.epreuve e
join interclub.rencontre r on r.id = e.rencontre_id
join interclub.gabarit_epreuve ge
  on ge.categorie = r.categorie and ge.type = 'vitesse'
join interclub.gabarit_bareme_vitesse_echelon g
  on g.gabarit_epreuve_id = ge.id
where e.type = 'vitesse'
  and not exists (
    select 1 from interclub.bareme_vitesse_echelon b where b.epreuve_id = e.id
  );

-- ===========================================================================
-- 9. Contrainte de cohérence : une épreuve de vitesse porte ses points fixes.
--    Posée après backfill (les épreuves vitesse existantes sont renseignées).
-- ===========================================================================

alter table interclub.gabarit_epreuve
  drop constraint if exists chk_gabarit_epreuve_vitesse_points_fixes;
alter table interclub.gabarit_epreuve
  add constraint chk_gabarit_epreuve_vitesse_points_fixes
  check (type <> 'vitesse'
         or (points_chute is not null and points_non_presentation is not null));

alter table interclub.epreuve
  drop constraint if exists chk_epreuve_vitesse_points_fixes;
alter table interclub.epreuve
  add constraint chk_epreuve_vitesse_points_fixes
  check (type <> 'vitesse'
         or (points_chute is not null and points_non_presentation is not null));

-- ===========================================================================
-- 10. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609221500_bareme_vitesse',
  'Barème de vitesse par rang (spec #3 R46) : échelons (gabarit_bareme_vitesse_echelon / bareme_vitesse_echelon) + points chute/non-présentation sur (gabarit_)epreuve ; RLS admin + lecture ③ ; copie RPC ; seed CT33 enfant/ado ; backfill rencontres existantes. Base du calcul spec #7 (trigger à venir).',
  'julleroyfr'
);
