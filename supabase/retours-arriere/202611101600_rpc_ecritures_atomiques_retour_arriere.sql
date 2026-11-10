-- ===========================================================================
-- Retour arrière de 202611101600_rpc_ecritures_atomiques
--
-- Supprime les cinq RPC. Aucune donnée touchée. L'application doit revenir à
-- la version qui enchaîne les écritures en TypeScript (avant le commit de la
-- migration).
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

drop function if exists interclub.mettre_a_jour_bareme_vitesse(uuid, int, int, jsonb);
drop function if exists interclub.mettre_a_jour_bareme_vitesse_gabarit(uuid, int, int, jsonb);
drop function if exists interclub.regenerer_jeton(uuid);
drop function if exists interclub.regenerer_invitation_coach(uuid);
drop function if exists interclub.generer_invitation_admin();

delete from interclub.version
where version = '202611101600_rpc_ecritures_atomiques';

commit;
