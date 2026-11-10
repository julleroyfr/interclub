-- ===========================================================================
-- Retour arrière de 202611101000_rpc_lister_comptes_permanents
--
-- Supprime la RPC. Aucune donnée touchée. L'application doit revenir à la
-- version qui lit `auth.admin.listUsers` (avant le commit de la migration).
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

drop function if exists interclub.lister_comptes_permanents();

delete from interclub.version
where version = '202611101000_rpc_lister_comptes_permanents';

commit;
