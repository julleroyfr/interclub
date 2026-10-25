-- ===========================================================================
-- RETOUR ARRIÈRE de 202610251000_gel_equipes_adultes (spec #20 R35)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette), AVANT les retours arrière
-- des lots 5, 4, 3 et 1 (ordre inverse d'application).
--
--   1. Retire les deux triggers et la fonction ajoutés.
--   2. Retire la ligne de suivi de version.
--
-- Aucune donnée propre. Une seule transaction. Ce fichier n'est PAS une
-- migration.
-- ===========================================================================

begin;

-- 1. Objets ajoutés.
drop trigger if exists composition_adulte_modifiable on interclub.composition;
drop trigger if exists equipe_adulte_modifiable on interclub.equipe;
drop function if exists interclub.verifier_equipes_adultes_modifiables();

-- 2. Suivi de version.
delete from interclub.version where version = '202610251000_gel_equipes_adultes';

commit;
