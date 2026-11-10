-- ===========================================================================
-- 202611081000_rpc_rechercher_grimpeurs_filtre_categorie
--
-- Objet : filtre par catégorie de la liste admin des grimpeurs (spec #3 R26b,
--         validée le 2026-11-08). La RPC `interclub.rechercher_grimpeurs`
--         reçoit trois paramètres optionnels :
--   - `p_annee_min` / `p_annee_max` : bornes d'année de naissance (incluses ;
--     null = pas de borne), calculées par l'application pour la saison en
--     cours — les âges des catégories (AGE_BASCULE, AGE_ADO_MAX, spec #1
--     R34bis) ne sont connus que d'elle ;
--   - `p_saison_surclasses` : en ado, retient AUSSI les grimpeurs portant un
--     surclassement actif pour cette saison, hors bornes (R26b-2, spec #21).
--   Tous null (défaut) : comportement identique à la version précédente.
--
-- La nouvelle signature crée une 2ᵉ fonction : l'ancienne surcharge
-- (text, int, int, uuid) est supprimée ici, sinon PostgREST renvoie PGRST203
-- (ambiguïté, cf. 202610031000).
--
-- Sécurité : SECURITY INVOKER (inchangé) — RLS reste la frontière.
-- Dépendance : 202611071100_surclassement (table `surclassement`).
-- Réversibilité : supabase/retours-arriere/202611081000_rpc_rechercher_grimpeurs_filtre_categorie_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

drop function if exists interclub.rechercher_grimpeurs(text, int, int, uuid);

create or replace function interclub.rechercher_grimpeurs(
  p_recherche         text default '',
  p_limit             int  default 50,
  p_offset            int  default 0,
  p_club_id           uuid default null,
  p_annee_min         int  default null,
  p_annee_max         int  default null,
  p_saison_surclasses int  default null
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
      -- Filtre catégorie optionnel (R26b-1) : bornes d'année de naissance, ou
      -- surclassement actif pour la saison (ado, R26b-2).
      and (
        (
          (p_annee_min is null or g.annee_naissance >= p_annee_min)
          and (p_annee_max is null or g.annee_naissance <= p_annee_max)
        )
        or (
          p_saison_surclasses is not null
          and exists (
            select 1 from interclub.surclassement s
            where s.grimpeur_id = g.id
              and s.saison = p_saison_surclasses
              and s.revoque_le is null
          )
        )
      )
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

revoke execute on function interclub.rechercher_grimpeurs(text, int, int, uuid, int, int, int) from public, anon;
grant execute on function interclub.rechercher_grimpeurs(text, int, int, uuid, int, int, int) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611081000_rpc_rechercher_grimpeurs_filtre_categorie',
  'RPC rechercher_grimpeurs : filtre catégorie (spec #3 R26b) — p_annee_min, p_annee_max, p_saison_surclasses (surclassés actifs retenus en ado) ; ancienne surcharge (text,int,int,uuid) supprimée. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
