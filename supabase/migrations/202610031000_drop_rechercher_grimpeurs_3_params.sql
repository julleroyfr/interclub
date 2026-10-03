-- ===========================================================================
-- 202610031000_drop_rechercher_grimpeurs_3_params
--
-- Objet : supprimer l'ancienne surcharge `interclub.rechercher_grimpeurs(text,
--         int, int)`. La migration 202609251300 a ajouté le paramètre
--         `p_club_id uuid default null` via `create or replace function` : la
--         signature ayant changé, Postgres a créé une **seconde** fonction au
--         lieu de remplacer la première.
--
-- Effet : PostgREST ne sait plus choisir entre les deux (PGRST203 « Could not
--         choose the best candidate function ») dès que l'appel n'envoie pas
--         `p_club_id` : l'écran roster admin (spec #3 R26) plante. La version à
--         4 paramètres couvre l'ancien appel (`p_club_id` null = tous les
--         clubs).
--
-- Idempotent : `drop function if exists`.
-- ===========================================================================

drop function if exists interclub.rechercher_grimpeurs(text, int, int);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610031000_drop_rechercher_grimpeurs_3_params',
  'Suppression de l''ancienne surcharge rechercher_grimpeurs(text, int, int), laissée par 202609251300 (create or replace avec nouvelle signature) : PostgREST renvoyait PGRST203 (ambiguïté de surcharge).',
  'julleroyfr'
)
on conflict (version) do nothing;
