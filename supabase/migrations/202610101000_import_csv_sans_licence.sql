-- ===========================================================================
-- 202610101000_import_csv_sans_licence
--
-- Objet : import CSV sans licence, format Marsas (spec #18, validée le
--         2026-10-10 ; spec #3 R21c).
--   1. Colonne DÉRIVÉE `grimpeur.licence_generee` = licence dans la plage
--      réservée [2 000 000 000, 2 147 483 647] (spec #18 R15). Aucune
--      désynchronisation possible : remplacer la licence par un vrai numéro la
--      fait passer à false.
--   2. Fonction `interclub.forme_comparable(text)` — forme canonique d'un nom ou
--      prénom pour le rapprochement (R9) : majuscules, sans accents (unaccent),
--      tirets/apostrophes → espace, espaces réduits. Équivalente au domaine TS
--      `formeComparable` (src/domaine/import-csv-sans-licence.ts).
--   3. RPC `interclub.importer_grimpeurs_csv(uuid, jsonb)` — écriture
--      **atomique** (R16) : rapprochement par clé d'identité parmi les
--      grimpeurs du club cible (R13), création avec licence générée (R14).
--      Verrou transactionnel : deux imports concurrents sont sérialisés (pas de
--      licence en double, pas de double création).
--
-- Sécurité : SECURITY INVOKER — la RLS (`grimpeur_insert`, `grimpeur_select`)
--            reste la frontière ; garde `est_admin()` en défense en profondeur
--            (spec #18 R1). EXECUTE retiré à PUBLIC/anon, accordé à
--            `authenticated` seul.
--
-- Entrée : p_club_id = club cible (R3) ; p_grimpeurs = tableau JSON d'objets
--          { ligne, nom, prenom, sexe, annee_naissance } (normalisés, filtrés
--          par âge et dédoublonnés en amont dans le domaine TS — R16).
-- Sortie : { crees, deja_presents, ambigus: [{ ligne, identite, nb }] }.
--
-- Dépendances : extension `unaccent` (migration 202609251200), `grimpeur.sexe`
--               (202609181000), `grimpeur.licence` (202609251000).
-- Idempotent : add column if not exists / create or replace.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

-- 1. Indicateur dérivé « licence générée » (R15).
alter table interclub.grimpeur
  add column if not exists licence_generee boolean
  generated always as (licence >= 2000000000) stored;

comment on column interclub.grimpeur.licence_generee is
  'Vrai si la licence est dans la plage réservée aux licences générées par l''import CSV sans licence (spec #18 R14–R15, spec #3 R21c).';

-- 2. Forme comparable d'un nom/prénom (R9).
create or replace function interclub.forme_comparable(p_libelle text)
returns text
language sql
stable
set search_path = interclub, public, extensions
as $$
  select btrim(
    regexp_replace(
      translate(upper(extensions.unaccent(coalesce(p_libelle, ''))), '-''’', '   '),
      '\s+', ' ', 'g'
    )
  );
$$;

revoke execute on function interclub.forme_comparable(text) from public, anon;
grant execute on function interclub.forme_comparable(text) to authenticated;

-- 3. Écriture atomique de l'import CSV (R13, R14, R16).
create or replace function interclub.importer_grimpeurs_csv(
  p_club_id   uuid,
  p_grimpeurs jsonb
)
returns jsonb
language plpgsql
set search_path = interclub, public, extensions
as $$
declare
  v_crees         int := 0;
  v_deja_presents int := 0;
  v_ambigus       jsonb := '[]'::jsonb;
  v_rec           jsonb;
  v_nb            int;
  v_prochaine     bigint;
begin
  -- Garde applicative (R1). La RLS refuserait déjà les écritures d'un non-admin.
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = 'P0001';
  end if;

  if not exists (select 1 from interclub.club where id = p_club_id) then
    raise exception 'club_introuvable' using errcode = 'P0001';
  end if;

  -- Sérialise les imports CSV concurrents jusqu'à la fin de la transaction :
  -- le calcul de la prochaine licence et le rapprochement voient un état stable.
  perform pg_advisory_xact_lock(hashtext('interclub.importer_grimpeurs_csv'));

  -- Prochaine licence générée : plus grande licence de la plage + 1 (R14).
  select coalesce(max(licence), 1999999999) + 1
    into v_prochaine
    from interclub.grimpeur
   where licence >= 2000000000;

  for v_rec in
    select elem from jsonb_array_elements(coalesce(p_grimpeurs, '[]'::jsonb)) as t(elem)
  loop
    -- Rapprochement par clé d'identité parmi les grimpeurs du club cible (R13).
    select count(*) into v_nb
      from interclub.grimpeur g
     where g.club_id = p_club_id
       and g.sexe = v_rec->>'sexe'
       and g.annee_naissance = (v_rec->>'annee_naissance')::int
       and interclub.forme_comparable(g.nom)    = interclub.forme_comparable(v_rec->>'nom')
       and interclub.forme_comparable(g.prenom) = interclub.forme_comparable(v_rec->>'prenom');

    if v_nb = 0 then
      if v_prochaine > 2147483647 then
        raise exception 'plage_licences_epuisee' using errcode = 'P0001';
      end if;
      insert into interclub.grimpeur
        (club_id, nom, prenom, annee_naissance, sexe, licence)
      values (
        p_club_id,
        v_rec->>'nom',
        v_rec->>'prenom',
        (v_rec->>'annee_naissance')::int,
        v_rec->>'sexe',
        v_prochaine::int
      );
      v_prochaine := v_prochaine + 1;
      v_crees := v_crees + 1;
    elsif v_nb = 1 then
      v_deja_presents := v_deja_presents + 1;
    else
      v_ambigus := v_ambigus || jsonb_build_object(
        'ligne',    (v_rec->>'ligne')::int,
        'identite', (v_rec->>'nom') || ' ' || (v_rec->>'prenom'),
        'nb',       v_nb
      );
    end if;
  end loop;

  return jsonb_build_object(
    'crees',         v_crees,
    'deja_presents', v_deja_presents,
    'ambigus',       v_ambigus
  );
end;
$$;

revoke execute on function interclub.importer_grimpeurs_csv(uuid, jsonb) from public, anon;
grant execute on function interclub.importer_grimpeurs_csv(uuid, jsonb) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610101000_import_csv_sans_licence',
  'Import CSV sans licence (spec #18, spec #3 R21c) : colonne dérivée grimpeur.licence_generee (licence >= 2e9), fonction forme_comparable(text), RPC importer_grimpeurs_csv(uuid, jsonb) SECURITY INVOKER atomique (rapprochement par identité dans le club cible, licence générée, verrou transactionnel).',
  'julleroyfr'
)
on conflict (version) do nothing;
