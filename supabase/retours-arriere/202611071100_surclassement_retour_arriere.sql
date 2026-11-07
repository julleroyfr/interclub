-- ===========================================================================
-- Retour arrière de 202611071100_surclassement
--
-- Supprime la RPC `revoquer_surclassement` et la table `surclassement` (ses
-- lignes, index et policies suivent). Les compositions et prêts retirés par
-- des révocations ne sont PAS restaurés (retraits voulus par l'admin).
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

drop function if exists interclub.revoquer_surclassement(uuid, int, boolean);
drop table if exists interclub.surclassement;

delete from interclub.version
where version = '202611071100_surclassement';

commit;
