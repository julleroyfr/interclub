-- ===========================================================================
-- 202609251100_rpc_importer_licencies
--
-- Objet : RPC `interclub.importer_licencies(jsonb)` — écriture **atomique** de
--         l'import des licenciés (spec #13 R16) : création des clubs manquants
--         par nom (R11–R12) puis **upsert** des grimpeurs sur la licence (R13).
--         Tout ou rien : la fonction s'exécute dans une seule transaction ; la
--         moindre erreur (contrainte sexe/licence/année) annule l'ensemble.
--
-- Sécurité : **SECURITY INVOKER** (défaut) — la fonction s'exécute avec les
--            droits de l'appelant, donc la **RLS** (`club_insert_admin`,
--            `grimpeur_insert`/`grimpeur_update`) reste la frontière réelle.
--            Garde applicative supplémentaire : refus si l'appelant n'est pas
--            admin (`est_admin()`), défense en profondeur (spec #13 R1).
--
-- Entrée : p_grimpeurs = tableau JSON d'objets
--          { nom, prenom, annee_naissance, sexe, licence, club }.
--          (Le parsing, la normalisation, le filtre d'âge et la consolidation
--          des doublons sont faits en amont dans le domaine TS — spec #13 R15.)
-- Sortie : { crees, mis_a_jour, clubs_crees: [noms] }.
--
-- Aucune nouvelle table ni colonne. Idempotent : create or replace.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

create or replace function interclub.importer_licencies(p_grimpeurs jsonb)
returns jsonb
language plpgsql
set search_path = interclub, public
as $$
declare
  v_clubs_crees text[] := '{}';
  v_crees       int := 0;
  v_mis_a_jour  int := 0;
  v_nom         text;
  v_rec         jsonb;
  v_club_id     uuid;
  v_licence     int;
begin
  -- Garde applicative (R1). La RLS refuserait déjà les écritures d'un non-admin.
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = 'P0001';
  end if;

  -- 1. Créer les clubs absents, par nom exact (R11–R12). On collecte les noms
  --    réellement créés pour le compte-rendu (R18).
  for v_nom in
    select distinct (elem->>'club')
      from jsonb_array_elements(coalesce(p_grimpeurs, '[]'::jsonb)) as t(elem)
  loop
    if not exists (select 1 from interclub.club where nom = v_nom) then
      insert into interclub.club (nom) values (v_nom)
      on conflict (nom) do nothing;
      v_clubs_crees := array_append(v_clubs_crees, v_nom);
    end if;
  end loop;

  -- 2. Upsert des grimpeurs sur la licence (R13). On teste l'existence de la
  --    licence pour distinguer création et mise à jour (pas de dépendance au
  --    pseudo-colonne système `xmax`).
  for v_rec in
    select elem from jsonb_array_elements(coalesce(p_grimpeurs, '[]'::jsonb)) as t(elem)
  loop
    v_licence := (v_rec->>'licence')::int;
    select id into v_club_id from interclub.club where nom = (v_rec->>'club');

    if exists (select 1 from interclub.grimpeur where licence = v_licence) then
      update interclub.grimpeur
         set club_id         = v_club_id,
             nom             = v_rec->>'nom',
             prenom          = v_rec->>'prenom',
             annee_naissance = (v_rec->>'annee_naissance')::int,
             sexe            = v_rec->>'sexe'
       where licence = v_licence;
      v_mis_a_jour := v_mis_a_jour + 1;
    else
      insert into interclub.grimpeur
        (club_id, nom, prenom, annee_naissance, sexe, licence)
      values (
        v_club_id,
        v_rec->>'nom',
        v_rec->>'prenom',
        (v_rec->>'annee_naissance')::int,
        v_rec->>'sexe',
        v_licence
      );
      v_crees := v_crees + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'crees',       v_crees,
    'mis_a_jour',  v_mis_a_jour,
    'clubs_crees', to_jsonb(v_clubs_crees)
  );
end;
$$;

grant execute on function interclub.importer_licencies(jsonb) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251100_rpc_importer_licencies',
  'RPC importer_licencies(jsonb) SECURITY INVOKER : création clubs manquants + upsert grimpeurs sur licence, atomique (spec #13 R12/R13/R16).',
  'julleroyfr'
)
on conflict (version) do nothing;
