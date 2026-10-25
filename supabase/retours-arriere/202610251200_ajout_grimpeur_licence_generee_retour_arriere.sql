-- ===========================================================================
-- RETOUR ARRIÈRE de 202610251200_ajout_grimpeur_licence_generee (spec #3 R21d)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette).
--
--   1. Retire la RPC ajoutée.
--   2. Retire la ligne de suivi de version.
--
-- Les grimpeurs déjà créés avec une licence générée sont conservés (comme ceux
-- de l'import CSV). Une seule transaction. Ce fichier n'est PAS une migration.
-- ===========================================================================

begin;

-- 1. Objet ajouté.
drop function if exists interclub.creer_grimpeur_licence_generee(uuid, text, text, int, text);

-- 2. Suivi de version.
delete from interclub.version where version = '202610251200_ajout_grimpeur_licence_generee';

commit;
