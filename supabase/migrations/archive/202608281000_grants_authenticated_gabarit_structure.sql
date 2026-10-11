-- ===========================================================================
-- 202608281000_grants_authenticated_gabarit_structure
--
-- Objet : corriger un oubli de GRANT dans les migrations 202607291000
--         (gabarit + voie_difficulte/bloc) et 202607311000 (paliers). Ces
--         migrations ont créé les tables, activé la RLS et posé les policies
--         (`*_all_admin` en écriture, `*_select_authenticated` en lecture) mais
--         n'ont accordé de privilèges qu'au rôle `service_role` (SELECT). Le
--         rôle `authenticated` n'ayant AUCUN grant, PostgREST renvoie
--         « permission denied » AVANT même l'évaluation de la RLS : la frontière
--         d'écriture `*_all_admin` (with check est_admin()) est donc inopérante.
--
-- Effet : l'ajout de voies/blocs/paliers au gabarit (écran /admin/gabarit) et à
--         une rencontre (écran /admin/rencontres/[id], spec #3 R36/R43) échouait
--         silencieusement. La lecture reste faite via `service_role` derrière la
--         garde admin (ADR 0003) ; l'écriture passe par la RLS/`authenticated`
--         (vraie frontière), comme pour les tables socle — d'où ces grants.
--
-- Idempotent : les GRANT sont réappliquables sans effet de bord.
-- ===========================================================================

-- Écriture (et lecture, scopée par les policies `*_select_authenticated`)
-- ouverte au rôle `authenticated` ; la RLS `*_all_admin` reste la frontière.
grant select, insert, update, delete on interclub.gabarit_epreuve         to authenticated;
grant select, insert, update, delete on interclub.gabarit_voie_difficulte to authenticated;
grant select, insert, update, delete on interclub.gabarit_bloc            to authenticated;
grant select, insert, update, delete on interclub.gabarit_bloc_palier     to authenticated;
grant select, insert, update, delete on interclub.gabarit_voie_vitesse    to authenticated;

grant select, insert, update, delete on interclub.voie_difficulte         to authenticated;
grant select, insert, update, delete on interclub.bloc                    to authenticated;
grant select, insert, update, delete on interclub.bloc_palier             to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202608281000_grants_authenticated_gabarit_structure',
  'Grants authenticated (select/insert/update/delete) sur les tables gabarit_* et voie_difficulte/bloc/bloc_palier — oubli des migrations 202607291000/202607311000, la RLS *_all_admin devient effective (écriture admin via RLS, ADR 0003).',
  'julleroyfr'
)
