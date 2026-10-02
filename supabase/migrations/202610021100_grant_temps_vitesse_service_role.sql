-- ===========================================================================
-- 202610021100_grant_temps_vitesse_service_role
--
-- Objet : corriger un oubli de GRANT. La table `interclub.temps_vitesse` (créée
--         par la migration socle 202607221100) n'a JAMAIS reçu de `grant select
--         ... to service_role`, contrairement aux autres tables lues par
--         l'assemblage transverse du classement (`points_vitesse`,
--         `resultat_voie`, `resultat_bloc`, `epreuve`… — toutes accordées).
--
-- Effet : le **classement** (spec #7, `getClassementRencontre`) lit la forme de
--         vitesse saisie par le juge (temps / chute / non-présentation) via le
--         client `service_role` pour le **libellé** de la décomposition (R13).
--         Sans ce grant, PostgREST renvoie « permission denied for table
--         temps_vitesse » : la requête échoue silencieusement et la
--         décomposition affiche « À saisir » au lieu de « 8,100 s » / « Chute »…
--         Les **points** restent justes (lus dans `points_vitesse`, déjà
--         accordée). Touche aussi les écrans qui réutilisent ce loader
--         (classement admin, export PDF spec #15, écran secondaire spec #14).
--         Repéré par l'E2E du cahier 21 (CT-03) le 2026-10-02.
--
-- Note : lecture SEULE. La RLS de `temps_vitesse` reste inchangée ; service_role
--        la contourne par nature, comme pour les autres tables transverses.
--
-- Idempotent : le GRANT est réappliquable sans effet de bord.
-- ===========================================================================

grant select on interclub.temps_vitesse to service_role;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610021100_grant_temps_vitesse_service_role',
  'Grant SELECT sur interclub.temps_vitesse au rôle service_role (oubli de la migration socle 202607221100). Rétablit le libellé de vitesse (temps / chute / non-présentation) de la décomposition du classement (spec #7 R13), qui affichait « À saisir ».',
  'julleroyfr'
)
on conflict (version) do nothing;
