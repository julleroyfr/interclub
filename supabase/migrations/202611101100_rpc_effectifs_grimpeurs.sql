-- ===========================================================================
-- 202611101100_rpc_effectifs_grimpeurs
--
-- Objet : rapport périodique (spec #19 R9, R10). Le rapport lisait TOUS les
--         grimpeurs (page par page) pour les compter en TypeScript par club et
--         tranche d'âge. La RPC `interclub.effectifs_grimpeurs()` fait le
--         comptage en base : nombre de grimpeurs par club et année de naissance
--         (quelques dizaines de lignes au lieu de milliers). Le classement en
--         tranches d'âge reste dans le domaine (`src/domaine/rapport.ts`), seul
--         à connaître les âges des catégories (spec #1 R34bis).
--
-- Sécurité : SECURITY INVOKER — appelée par le client `service_role` du rapport
--         (garde : secret du déclencheur, spec #19 R4/R19). EXECUTE à
--         `service_role` SEUL.
-- Aucune table ni policy modifiée. Additive.
-- Réversibilité : supabase/retours-arriere/202611101100_rpc_effectifs_grimpeurs_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

create or replace function interclub.effectifs_grimpeurs()
returns table (
  club_id         uuid,
  annee_naissance int,
  nombre          int
)
language sql
stable
set search_path = ''
as $$
  select g.club_id, g.annee_naissance, count(*)::int
  from interclub.grimpeur g
  group by g.club_id, g.annee_naissance;
$$;

revoke execute on function interclub.effectifs_grimpeurs() from public, anon, authenticated;
grant execute on function interclub.effectifs_grimpeurs() to service_role;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101100_rpc_effectifs_grimpeurs',
  'RPC effectifs_grimpeurs (spec #19 R9/R10) : nombre de grimpeurs par club et année de naissance, compté en base pour le rapport périodique ; EXECUTE à service_role seul. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
