-- ===========================================================================
-- 202611171400_retirer_resultat_bloc
--
-- Objet : effacer un résultat de BLOC saisi par erreur (spec #6 R13ter, spec
--         #17 R10, spec #9 R8 — rév. validée le 2026-11-17). Le coach efface
--         déjà un résultat de voie (`retirer_resultat_voie`) ; il ne pouvait
--         que REMPLACER un résultat de bloc par une autre issue, jamais revenir
--         à « à saisir ».
--
--   retirer_resultat_bloc(p_bloc, p_grimpeur, p_saisi_le) — même modèle que
--   `retirer_resultat_voie` : SECURITY INVOKER (la RLS reste la frontière),
--   session coach (permanent ou QR), club du grimpeur et phase ③
--   (`controler_saisie_coach`), refus `saisie_plus_ancienne` si le résultat
--   existant est plus récent que l'effacement (spec #17 R10), effacement d'une
--   cible sans résultat sans effet ; renvoie les résultats du grimpeur (score,
--   spec #6 R20). L'admin efface par écriture directe (RLS, ③/④).
--
-- Retour arrière : supabase/retours-arriere/202611171400_retirer_resultat_bloc_retour_arriere.sql
-- ===========================================================================

create or replace function interclub.retirer_resultat_bloc(
  p_bloc     uuid,
  p_grimpeur uuid,
  p_saisi_le timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
  v_heure     timestamptz := least(coalesce(p_saisi_le, now()), now());
begin
  perform interclub.exiger_session_coach();

  select b.epreuve_id, e.rencontre_id, r.phase::text
    into v_epreuve, v_rencontre, v_phase
  from interclub.bloc b
  join interclub.epreuve   e on e.id = b.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where b.id = p_bloc;
  if not found then
    raise exception 'bloc_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  -- Spec #17 R10 : un effacement ne supprime pas une saisie plus récente que lui.
  if exists (
    select 1 from interclub.resultat_bloc
    where bloc_id = p_bloc and grimpeur_id = p_grimpeur and saisi_le > v_heure
  ) then
    raise exception 'saisie_plus_ancienne' using errcode = 'P0001';
  end if;

  delete from interclub.resultat_bloc
  where bloc_id = p_bloc and grimpeur_id = p_grimpeur;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

comment on function interclub.retirer_resultat_bloc(uuid, uuid, timestamptz) is
  'Efface le résultat d''un grimpeur sur un bloc (spec #6 R13ter) en un appel : session coach, club, phase ③, refus « saisie_plus_ancienne » si le résultat est plus récent (spec #17 R10) ; renvoie les résultats du grimpeur.';

revoke execute on function interclub.retirer_resultat_bloc(uuid, uuid, timestamptz) from public, anon;
grant execute on function interclub.retirer_resultat_bloc(uuid, uuid, timestamptz) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611171400_retirer_resultat_bloc',
  'Effacer un résultat de bloc (spec #6 R13ter, spec #17 R10, rév. 2026-11-17) : fonction d''enregistrement retirer_resultat_bloc (SECURITY INVOKER, session coach, club, phase ③, refus saisie_plus_ancienne) ; EXECUTE à authenticated seul. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
