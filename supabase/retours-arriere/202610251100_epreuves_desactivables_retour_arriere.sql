-- ===========================================================================
-- RETOUR ARRIÈRE de 202610251100_epreuves_desactivables (spec #20 R35)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette), EN PREMIER, avant les
-- retours arrière du gel des équipes et des lots 5, 4, 3 et 1 (ordre inverse
-- d'application).
--
--   1. Retire les triggers et fonctions ajoutés.
--   2. Retire la colonne `epreuve.active` : les épreuves désactivées redeviennent
--      des épreuves ordinaires (leurs blocs et voies de vitesse étaient conservés).
--      Les jetons juges révoqués le restent (révocation définitive, spec #2 R22).
--   3. Retire la ligne de suivi de version.
--
-- Une seule transaction. Ce fichier n'est PAS une migration.
-- ===========================================================================

begin;

-- 1. Objets ajoutés.
drop trigger if exists temps_vitesse_epreuve_active on interclub.temps_vitesse;
drop function if exists interclub.verifier_epreuve_active_vitesse();
drop trigger if exists resultat_bloc_epreuve_active on interclub.resultat_bloc;
drop function if exists interclub.verifier_epreuve_active_bloc();
drop trigger if exists jeton_qr_juge_vitesse_active on interclub.jeton_qr;
drop function if exists interclub.verifier_jeton_juge_vitesse_active();
drop trigger if exists epreuve_vitesse_revoque_juges on interclub.epreuve;
drop function if exists interclub.revoquer_jetons_juges_vitesse();
drop trigger if exists epreuve_etat on interclub.epreuve;
drop function if exists interclub.verifier_etat_epreuve();

-- 2. Colonne.
alter table interclub.epreuve drop column if exists active;

-- 3. Suivi de version.
delete from interclub.version where version = '202610251100_epreuves_desactivables';

commit;
