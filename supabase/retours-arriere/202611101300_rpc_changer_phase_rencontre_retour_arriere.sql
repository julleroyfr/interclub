-- ===========================================================================
-- Retour arrière de 202611101300_rpc_changer_phase_rencontre
--
-- Supprime la RPC. Aucune donnée touchée (les NP déjà posés restent, comme
-- avec l'ancien code). L'application doit revenir à la version qui change la
-- phase puis pose les NP en TypeScript (`src/lib/rencontres/cloture.ts`, avant
-- le commit de la migration).
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

drop function if exists interclub.changer_phase_rencontre(uuid, text);

delete from interclub.version
where version = '202611101300_rpc_changer_phase_rencontre';

commit;
