-- ===========================================================================
-- 202609181100_grant_epreuve_service_role
--
-- Objet : corriger un oubli de GRANT. La table `interclub.epreuve` (créée par la
--         migration socle 202607221100) n'a JAMAIS reçu de `grant select ... to
--         service_role`, contrairement aux autres tables de structure
--         (`voie_difficulte`, `bloc`, `bloc_palier`, `equipe`, `composition`,
--         `grimpeur`, `club`, `resultat_voie`, `resultat_bloc` — toutes déjà
--         accordées).
--
-- Effet : l'assemblage du **classement** (spec #7, `getClassementRencontre`) lit
--         les épreuves d'une rencontre via le client `service_role` (lecture
--         transverse tous clubs, ADR 0002/0003). Sans ce grant, PostgREST renvoie
--         « permission denied for table epreuve » : le loader ne retrouve pas les
--         épreuves voie/bloc, n'assemble aucun barème, et **tous les scores
--         s'affichent à 0** (les grimpeurs apparaissent quand même, via les
--         compositions). Ce grant rétablit le calcul.
--
-- Note : lecture SEULE (le service_role n'écrit pas d'épreuve — la création passe
--        par la RPC `creer_rencontre_avec_gabarit`, security definer). La RLS de
--        `epreuve` reste inchangée ; service_role la contourne par nature, comme
--        pour les autres tables transverses lues par les loaders admin.
--
-- Idempotent : le GRANT est réappliquable sans effet de bord.
-- ===========================================================================

grant select on interclub.epreuve to service_role;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609181100_grant_epreuve_service_role',
  'Grant SELECT sur interclub.epreuve au rôle service_role (oubli de la migration socle 202607221100). Débloque l''assemblage du classement (spec #7) : sans lui, permission denied → épreuves introuvables → tous les scores à 0.',
  'julleroyfr'
)
on conflict (version) do nothing;
