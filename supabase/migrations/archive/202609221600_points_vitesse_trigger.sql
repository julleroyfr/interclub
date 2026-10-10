-- Migration : points de vitesse matérialisés + trigger de recalcul (spec #7 R20).
--
-- Contrairement à voie/bloc (calculés à la lecture, rien stocké — R10), la
-- composante VITESSE est FIELD-DEPENDENT : un nouveau temps peut changer le rang,
-- donc les points, de plusieurs grimpeurs du même sexe (R19). On la MATÉRIALISE
-- dans `points_vitesse` et on la RECALCULE en base par un TRIGGER sur
-- `temps_vitesse` (spec #10). Motifs : cohérence quel que soit le chemin
-- d'écriture + compatibilité realtime (un écran peut s'abonner à la table).
--
-- Calcul (R15–R17) :
--   - classement par SEXE des grimpeurs ayant un TEMPS, par temps croissant ;
--     ex æquo standard (rank() : 1,2,2,4) ;
--   - points = barème par échelon (spec #3 R46) : points - (rang-rang_min)*decrement ;
--   - chute / non-présentation = points fixes de l'épreuve (rang NULL) ;
--   - absence de temps_vitesse = pas de ligne (0 à la lecture, R17).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Table points_vitesse — une ligne par (épreuve vitesse, grimpeur saisi)
-- ===========================================================================

create table if not exists interclub.points_vitesse (
  id           uuid primary key default gen_random_uuid(),
  epreuve_id   uuid not null references interclub.epreuve (id)  on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  rang         int,                                   -- NULL si chute / non-présentation
  points       int  not null default 0 check (points >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (epreuve_id, grimpeur_id)
);
create index if not exists idx_points_vitesse_epreuve
  on interclub.points_vitesse (epreuve_id);
create index if not exists idx_points_vitesse_grimpeur
  on interclub.points_vitesse (grimpeur_id);

drop trigger if exists trg_points_vitesse_updated_at on interclub.points_vitesse;
create trigger trg_points_vitesse_updated_at
  before update on interclub.points_vitesse
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 2. Fonction de recalcul — points de vitesse de TOUTE l'épreuve (par sexe)
--    Idempotente : recalcul complet à partir de temps_vitesse + barème stocké.
--    Upsert (préserve les lignes inchangées → événements realtime minimaux).
-- ===========================================================================

create or replace function interclub.recalculer_points_vitesse(p_epreuve uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pts_chute int;
  v_pts_np    int;
begin
  -- Barème de points fixes ; sort si l'épreuve n'existe pas / n'est pas vitesse.
  select points_chute, points_non_presentation
    into v_pts_chute, v_pts_np
  from interclub.epreuve
  where id = p_epreuve and type = 'vitesse';
  if not found then
    return;
  end if;

  -- 1) Purger les grimpeurs qui n'ont plus de temps_vitesse sur l'épreuve.
  delete from interclub.points_vitesse pv
  where pv.epreuve_id = p_epreuve
    and not exists (
      select 1 from interclub.temps_vitesse tv
      where tv.epreuve_id = p_epreuve and tv.grimpeur_id = pv.grimpeur_id
    );

  -- 2) Recalculer et upserter chaque grimpeur saisi.
  insert into interclub.points_vitesse (epreuve_id, grimpeur_id, rang, points)
  select
    p_epreuve,
    c.grimpeur_id,
    c.rang,
    case
      when c.issue = 'non_presentation' then v_pts_np
      when c.issue = 'chute'            then v_pts_chute
      when c.issue = 'temps' then coalesce((
        -- Barème par échelon : points - (rang - rang_min) * decrement.
        select e.points - (c.rang - e.rang_min) * e.decrement
        from interclub.bareme_vitesse_echelon e
        where e.epreuve_id = p_epreuve
          and c.rang >= e.rang_min
          and (e.rang_max is null or c.rang <= e.rang_max)
        order by e.rang_min desc
        limit 1
      ), 0)
      else 0
    end as points
  from (
    select
      tv.grimpeur_id,
      tv.issue,
      -- Rang par SEXE, temps croissant, ex æquo standard (rank). Les formes sans
      -- temps (chute/NP, temps NULL) sont triées en fin (nulls last) et leur rang
      -- est ignoré (mis à NULL ci-dessous).
      case when tv.issue = 'temps'
        then rank() over (partition by g.sexe order by tv.temps asc)
        else null
      end as rang
    from interclub.temps_vitesse tv
    join interclub.grimpeur g on g.id = tv.grimpeur_id
    where tv.epreuve_id = p_epreuve
  ) c
  on conflict (epreuve_id, grimpeur_id) do update
    set rang   = excluded.rang,
        points = excluded.points,
        updated_at = now();
end;
$$;

-- ===========================================================================
-- 3. Trigger sur temps_vitesse — recalcule l'épreuve concernée (R20)
-- ===========================================================================

create or replace function interclub.trg_recalculer_points_vitesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform interclub.recalculer_points_vitesse(old.epreuve_id);
    return old;
  end if;

  perform interclub.recalculer_points_vitesse(new.epreuve_id);
  -- UPDATE changeant d'épreuve (rare) : recalculer aussi l'ancienne.
  if tg_op = 'UPDATE' and new.epreuve_id is distinct from old.epreuve_id then
    perform interclub.recalculer_points_vitesse(old.epreuve_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_temps_vitesse_points_vitesse on interclub.temps_vitesse;
create trigger trg_temps_vitesse_points_vitesse
  after insert or update or delete on interclub.temps_vitesse
  for each row execute function interclub.trg_recalculer_points_vitesse();

-- ===========================================================================
-- 4. RLS — points_vitesse : écriture réservée au trigger (SECURITY DEFINER),
--    lecture des authentifiés dès la ③ (même régime que les résultats, R15).
--    Surface publique anon (⑤) = spec #8, hors migration.
-- ===========================================================================

alter table interclub.points_vitesse enable row level security;

create policy points_vitesse_select_authenticated
  on interclub.points_vitesse for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1
      from interclub.epreuve e
      where e.id = points_vitesse.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );
-- Pas de policy insert/update/delete : seules les fonctions SECURITY DEFINER
-- (trigger de recalcul) écrivent dans cette table dérivée.

-- ===========================================================================
-- 5. Grants (lecture ; l'écriture passe par le trigger definer)
-- ===========================================================================

grant select on interclub.points_vitesse to authenticated;
grant select on interclub.points_vitesse to service_role;
grant execute on function interclub.recalculer_points_vitesse(uuid) to service_role;

-- ===========================================================================
-- 6. Backfill — matérialiser les points des temps déjà saisis
-- ===========================================================================

do $$
declare
  r record;
begin
  for r in select id from interclub.epreuve where type = 'vitesse' loop
    perform interclub.recalculer_points_vitesse(r.id);
  end loop;
end;
$$;

-- ===========================================================================
-- 7. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609221600_points_vitesse_trigger',
  'Points de vitesse matérialisés (spec #7 R20) : table points_vitesse + fonction recalculer_points_vitesse(epreuve) (classement par sexe rank() + barème échelon spec #3 R46 + chute/NP) + trigger sur temps_vitesse (insert/update/delete) ; RLS lecture ③ (écriture trigger definer) ; backfill.',
  'julleroyfr'
);
