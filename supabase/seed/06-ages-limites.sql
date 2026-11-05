-- ===========================================================================
-- 06-ages-limites.sql — OPT-IN (non chargé au reset, cf. config.toml).
--
-- Grimpeurs aux ÂGES LIMITES des catégories enfant / ado / adulte (spec #1
-- R34/R34bis, spec #20 R3 ; cahier 13 CT-18), pour la saison 2026-2027 avec
-- AGE_BASCULE=12 et AGE_ADO_MAX=18 :
--
--   Grimpeur (Club A)       Né en  Âge  Enfant  Ado  Adulte
--   Limite Onze             2015   11   oui     non  non
--   Limite Douze (pivot)    2014   12   oui     oui  non
--   Limite Treize           2013   13   non     oui  non
--   Limite Seize            2010   16   non     oui  oui
--   Limite Dixhuit          2008   18   non     oui  oui
--   Limite Dixneuf          2007   19   non     non  oui
--
-- Deux rencontres du Club A le 2027-01-16 (saison 2026), créées depuis les
-- gabarits enfant et ado, en ① pré-compétition (engagement éditable), chacune
-- avec une équipe vide « Limites ».
--
-- Pré-requis : migrations + seed 01 (clubs, compte admin).
-- Rejouable : supprime d'abord ses deux rencontres (cascade) et ses grimpeurs.
-- UUID réservés `a6a6a6a6-…` (grimpeurs) ; licences 100101–100106.
-- Usage local : docker exec -i supabase_db_interclub psql -U postgres
--               < supabase/seed/06-ages-limites.sql
-- Jamais en prod.
-- ===========================================================================

do $$
declare
  v_admin constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_club  constant uuid := '11111111-1111-1111-1111-111111111111';
  v_date  constant date := '2027-01-16';
  v_rid   uuid;
  v_cat   text;
begin
  delete from interclub.rencontre
   where club_porteur_id = v_club and date_rencontre = v_date and categorie in ('enfant', 'ado');
  delete from interclub.grimpeur where id::text like 'a6a6a6a6-%';

  insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence) values
    ('a6a6a6a6-0000-0000-0000-000000000011', v_club, 'Limite', 'Onze',    2015, 'F', 100101),
    ('a6a6a6a6-0000-0000-0000-000000000012', v_club, 'Limite', 'Douze',   2014, 'H', 100102),
    ('a6a6a6a6-0000-0000-0000-000000000013', v_club, 'Limite', 'Treize',  2013, 'F', 100103),
    ('a6a6a6a6-0000-0000-0000-000000000016', v_club, 'Limite', 'Seize',   2010, 'H', 100104),
    ('a6a6a6a6-0000-0000-0000-000000000018', v_club, 'Limite', 'Dixhuit', 2008, 'F', 100105),
    ('a6a6a6a6-0000-0000-0000-000000000019', v_club, 'Limite', 'Dixneuf', 2007, 'H', 100106);

  -- Création comme l'écran admin : le gabarit de la catégorie est copié.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  foreach v_cat in array array['enfant', 'ado'] loop
    -- Phase ① pré-compétition par défaut.
    v_rid := interclub.creer_rencontre_avec_gabarit(v_date, v_club, v_cat);
    insert into interclub.equipe (rencontre_id, club_id, nom) values (v_rid, v_club, 'Limites');
  end loop;
end $$;
