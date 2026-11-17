-- ===========================================================================
-- Retour arrière de 202611171400_retirer_resultat_bloc
--
-- Retire la fonction `retirer_resultat_bloc`. Aucune donnée propre à
-- l'évolution (les résultats effacés ne sont pas recréés).
-- À exécuter à la main (SQL Editor), en une transaction.
-- ===========================================================================

begin;

drop function if exists interclub.retirer_resultat_bloc(uuid, uuid, timestamptz);

delete from interclub.version where version = '202611171400_retirer_resultat_bloc';

commit;
