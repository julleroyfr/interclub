-- ===========================================================================
-- 202611101000_rpc_lister_comptes_permanents
--
-- Objet : écran « Mapping de rôle » (spec #2 R46 : liste de TOUS les comptes
--         permanents). L'écran lisait `auth.admin.listUsers` sur UNE page de
--         1000 utilisateurs, comptes anonymes des sessions QR compris (jamais
--         purgés) : au-delà, des comptes permanents disparaissaient de l'écran
--         sans erreur (constat J6, plan « appels Supabase », 2026-11-10).
--
--         La RPC `interclub.lister_comptes_permanents()` fait le travail en base,
--         en une requête : utilisateurs non anonymes de `auth.users`, avec leur
--         mapping (`compte.role`) et le nom du club, triés par e-mail.
--
-- Sécurité : SECURITY DEFINER (lecture de `auth.users`, schéma non exposé),
--         `search_path` vide. EXECUTE à `service_role` SEUL : appelée par le
--         loader admin derrière la garde `exigerLectureAdmin` (ADR 0005), jamais
--         par un client `authenticated` ou `anon`.
-- Aucune table ni policy modifiée. Additive.
-- Réversibilité : supabase/retours-arriere/202611101000_rpc_lister_comptes_permanents_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

create or replace function interclub.lister_comptes_permanents()
returns table (
  utilisateur_id uuid,
  email          text,
  role           text,
  club_nom       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, c.role, cl.nom
  from auth.users u
  left join interclub.compte c on c.utilisateur_id = u.id
  left join interclub.club cl on cl.id = c.club_id
  where not coalesce(u.is_anonymous, false)
  order by coalesce(u.email::text, u.id::text);
$$;

revoke execute on function interclub.lister_comptes_permanents() from public, anon, authenticated;
grant execute on function interclub.lister_comptes_permanents() to service_role;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101000_rpc_lister_comptes_permanents',
  'RPC lister_comptes_permanents (spec #2 R46) : comptes non anonymes de auth.users + mapping + club, en une requête ; SECURITY DEFINER, EXECUTE à service_role seul. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
