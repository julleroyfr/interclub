-- ===========================================================================
-- Retour arrière de 202611101100_rpc_effectifs_grimpeurs
--
-- Supprime la RPC. Aucune donnée touchée. L'application doit revenir à la
-- version qui lit les lignes `grimpeur` (avant le commit de la migration).
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

drop function if exists interclub.effectifs_grimpeurs();

delete from interclub.version
where version = '202611101100_rpc_effectifs_grimpeurs';

commit;
