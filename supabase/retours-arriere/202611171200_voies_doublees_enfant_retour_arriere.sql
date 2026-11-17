-- ===========================================================================
-- Retour arrière de 202611171200_voies_doublees_enfant
--
-- Retire le trigger `resultat_voie_un_par_niveau_enfant` et sa fonction
-- `verifier_voie_enfant`. Aucune donnée propre à l'évolution : les résultats
-- remplacés pendant son application ne sont pas recréés (ils avaient été
-- remplacés à la demande de l'utilisateur, R9bis d).
-- À exécuter à la main (SQL Editor), en une transaction.
-- ===========================================================================

begin;

drop trigger if exists resultat_voie_un_par_niveau_enfant on interclub.resultat_voie;
drop function if exists interclub.verifier_voie_enfant();

delete from interclub.version where version = '202611171200_voies_doublees_enfant';

commit;
