-- ===========================================================================
-- 202610251200_ajout_grimpeur_licence_generee
--
-- Objet : ajout unitaire d'un grimpeur sans licence (spec #3 R21d, validée le
--         2026-10-25 ; spec #18 R14 étendue).
--   1. RPC `interclub.creer_grimpeur_licence_generee(uuid, text, text, int,
--      text)` : crée le grimpeur avec la prochaine licence générée (plus
--      grande licence de la plage réservée + 1). Même verrou transactionnel
--      (même clé) que `importer_grimpeurs_csv` : un ajout concurrent d'un
--      import ne peut recevoir une licence déjà attribuée par celui-ci.
--      `importer_grimpeurs_csv` est inchangée.
--
-- Sécurité : SECURITY INVOKER — la RLS (`grimpeur_insert`) reste la frontière ;
--            garde `est_admin()` en défense en profondeur (écran admin, spec #3
--            R20). EXECUTE retiré à PUBLIC/anon, accordé à `authenticated` seul.
--
-- Entrée : club, nom, prénom, année de naissance, sexe (normalisés en amont par
--          le domaine TS `normaliserAjoutGrimpeur`). Les contraintes de table
--          (bornes, sexe) restent la vérité.
-- Sortie : la licence attribuée.
-- Erreurs : `acces_refuse`, `club_introuvable`, `plage_licences_epuisee`
--           (P0001).
--
-- Réversibilité : additive. Retour arrière :
-- supabase/retours-arriere/202610251200_ajout_grimpeur_licence_generee_retour_arriere.sql.
-- Prérequis : 202610101000_import_csv_sans_licence. Idempotent (create or
-- replace). Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

-- 1. Ajout unitaire avec licence générée (spec #3 R21d, spec #18 R14).
create or replace function interclub.creer_grimpeur_licence_generee(
  p_club_id         uuid,
  p_nom             text,
  p_prenom          text,
  p_annee_naissance int,
  p_sexe            text
)
returns int
language plpgsql
set search_path = interclub, public, extensions
as $$
declare
  v_prochaine bigint;
begin
  -- Garde applicative. La RLS refuserait déjà l'écriture d'un non-admin hors
  -- de son club.
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = 'P0001';
  end if;

  if not exists (select 1 from interclub.club where id = p_club_id) then
    raise exception 'club_introuvable' using errcode = 'P0001';
  end if;

  -- Même clé que l'import CSV : ajouts et imports sont sérialisés jusqu'à la
  -- fin de la transaction, le calcul de la prochaine licence voit un état
  -- stable.
  perform pg_advisory_xact_lock(hashtext('interclub.importer_grimpeurs_csv'));

  -- Prochaine licence générée : plus grande licence de la plage + 1 (R14).
  select coalesce(max(licence), 1999999999) + 1
    into v_prochaine
    from interclub.grimpeur
   where licence >= 2000000000;

  if v_prochaine > 2147483647 then
    raise exception 'plage_licences_epuisee' using errcode = 'P0001';
  end if;

  insert into interclub.grimpeur
    (club_id, nom, prenom, annee_naissance, sexe, licence)
  values
    (p_club_id, p_nom, p_prenom, p_annee_naissance, p_sexe, v_prochaine::int);

  return v_prochaine::int;
end;
$$;

comment on function interclub.creer_grimpeur_licence_generee(uuid, text, text, int, text) is
  'Ajout unitaire d''un grimpeur sans licence : licence générée de la plage réservée, sous le verrou de l''import CSV (spec #3 R21d, spec #18 R14).';

revoke execute on function interclub.creer_grimpeur_licence_generee(uuid, text, text, int, text) from public, anon;
grant execute on function interclub.creer_grimpeur_licence_generee(uuid, text, text, int, text) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610251200_ajout_grimpeur_licence_generee',
  'Ajout unitaire d''un grimpeur sans licence (spec #3 R21d) : RPC creer_grimpeur_licence_generee (SECURITY INVOKER, garde est_admin, verrou partagé avec importer_grimpeurs_csv). Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
