-- ===========================================================================
-- 202609251200_rpc_rechercher_grimpeurs
--
-- Objet : recherche paginée du roster (écran admin Grimpeurs, spec #3 R26).
--         RPC `interclub.rechercher_grimpeurs(p_recherche, p_limit, p_offset)`
--         qui filtre par nom/prénom (insensible à la casse ET aux accents,
--         multi-termes dans n'importe quel ordre), trie par nom puis prénom,
--         renvoie la page demandée + le nom du club, le nombre d'engagements et
--         le total (fenêtre) pour la pagination côté écran.
--
-- Sécurité : **SECURITY INVOKER** (défaut) — la RLS `grimpeur_*` / `club_*` /
--            `composition_*` reste la frontière (l'admin voit tout le roster).
--
-- Dépendance : extension `unaccent` (schéma `extensions`, standard Supabase).
-- Aucune table/colonne nouvelle. Idempotent (create extension/or replace).
-- Application : MANUELLE (SQL Editor) — local via `supabase db reset`.
-- ===========================================================================

create extension if not exists unaccent with schema extensions;

create or replace function interclub.rechercher_grimpeurs(
  p_recherche text default '',
  p_limit     int  default 50,
  p_offset    int  default 0
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
    where q.terme = ''
       or (
         -- Chaque mot de la recherche doit correspondre au nom OU au prénom
         -- (comparaison sans accents ni casse) — ordre des mots indifférent.
         select bool_and(
           unaccent(lower(g.nom))    like '%' || w || '%'
           or unaccent(lower(g.prenom)) like '%' || w || '%'
         )
         from unnest(string_to_array(unaccent(lower(q.terme)), ' ')) as w
         where w <> ''
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

grant execute on function interclub.rechercher_grimpeurs(text, int, int) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251200_rpc_rechercher_grimpeurs',
  'RPC rechercher_grimpeurs(text,int,int) SECURITY INVOKER : recherche paginée du roster par nom/prénom (unaccent + ilike, multi-termes), tri nom/prénom, total fenêtré (spec #3 R26). Extension unaccent activée.',
  'julleroyfr'
)
on conflict (version) do nothing;
