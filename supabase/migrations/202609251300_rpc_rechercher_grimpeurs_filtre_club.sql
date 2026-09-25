-- ===========================================================================
-- 202609251300_rpc_rechercher_grimpeurs_filtre_club
--
-- Objet : ajout du paramètre optionnel `p_club_id uuid` à la RPC
--         `interclub.rechercher_grimpeurs` pour filtrer le roster par club.
--         Quand `p_club_id` est null (défaut), tous les clubs sont retournés
--         (comportement identique à la version précédente).
--
-- Sécurité : SECURITY INVOKER (inchangé) — RLS reste la frontière.
-- Dépendance : migration 202609251200_rpc_rechercher_grimpeurs.
-- Application : MANUELLE (SQL Editor) — local via `supabase db reset`.
-- ===========================================================================

create or replace function interclub.rechercher_grimpeurs(
  p_recherche text    default '',
  p_limit     int     default 50,
  p_offset    int     default 0,
  p_club_id   uuid    default null
)
returns table (
  id              uuid,
  nom             text,
  prenom          text,
  annee_naissance int,
  sexe            text,
  licence         int,
  club_id         uuid,
  club_nom        text,
  nb_engagements  bigint,
  total           bigint
)
language sql
stable
set search_path = interclub, public, extensions
as $$
  with q as (
    select trim(coalesce(p_recherche, '')) as terme
  ),
  filtre as (
    select g.*
    from interclub.grimpeur g, q
    where
      -- Filtre club optionnel
      (p_club_id is null or g.club_id = p_club_id)
      and (
        q.terme = ''
        or (
          -- Chaque mot doit correspondre au nom OU au prénom
          -- (insensible à la casse et aux accents) — ordre indifférent.
          select bool_and(
            unaccent(lower(g.nom))    like '%' || w || '%'
            or unaccent(lower(g.prenom)) like '%' || w || '%'
          )
          from unnest(string_to_array(unaccent(lower(q.terme)), ' ')) as w
          where w <> ''
        )
      )
  )
  select
    f.id, f.nom, f.prenom, f.annee_naissance, f.sexe, f.licence, f.club_id,
    c.nom as club_nom,
    (select count(*) from interclub.composition comp where comp.grimpeur_id = f.id)
      as nb_engagements,
    count(*) over() as total
  from filtre f
  left join interclub.club c on c.id = f.club_id
  order by f.nom, f.prenom
  limit  greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function interclub.rechercher_grimpeurs(text, int, int, uuid) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251300_rpc_rechercher_grimpeurs_filtre_club',
  'RPC rechercher_grimpeurs : ajout paramètre p_club_id uuid (filtre optionnel par club, null = tous les clubs).',
  'julleroyfr'
)
on conflict (version) do nothing;
