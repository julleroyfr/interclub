-- ===========================================================================
-- 202611101200_points_vitesse_sans_reecriture
--
-- Objet : temps réel du jour J (constat R1 de l'analyse du 2026-11-10, lot 10).
--         `recalculer_points_vitesse` recalcule toute l'épreuve à chaque temps
--         saisi (spec #10 R20, inchangé) mais l'upsert RÉÉCRIVAIT chaque ligne,
--         même inchangée : ≈ 100 UPDATE, donc ≈ 100 évènements temps réel, qui
--         relançaient les écrans de saisie et les classements abonnés à
--         `points_vitesse`. L'upsert n'écrit désormais que les lignes dont le
--         rang ou les points changent (`where … is distinct from`).
--
-- Comportement métier inchangé (mêmes rangs, mêmes points ; spec #10 R20–R24).
-- Même signature : `create or replace` sans surcharge ; grants conservés.
-- Réversibilité : supabase/retours-arriere/202611101200_points_vitesse_sans_reecriture_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
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
  insert into interclub.points_vitesse as pv (epreuve_id, grimpeur_id, rang, points)
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
        updated_at = now()
    -- N'écrit QUE les lignes qui changent : un temps saisi ne réécrit plus
    -- toute l'épreuve (≈ 100 évènements temps réel → les seuls grimpeurs dont
    -- le rang ou les points bougent).
    where (pv.rang, pv.points) is distinct from (excluded.rang, excluded.points);
end;
$$;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101200_points_vitesse_sans_reecriture',
  'recalculer_points_vitesse : l''upsert n''écrit que les lignes dont le rang ou les points changent (temps réel : ≈ 100 évènements par temps saisi → les seules lignes modifiées). Comportement métier inchangé. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
