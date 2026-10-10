-- ===========================================================================
-- 202610091000_enregistrement_saisie_un_appel
--
-- Objet : spec #6 R3/R20 et spec #10 R3/R14 (rév. 2026-10-09, validée le
--         2026-10-09) — chaque saisie coach / juge est UN SEUL appel à une
--         fonction d'enregistrement qui contrôle PUIS écrit, dans la même
--         transaction. Mesure en recette : 5 à 6 allers-retours vers la base
--         par clic (~2 s) ; il en reste 1.
--
-- Principe :
--   - SECURITY INVOKER : la fonction s'exécute avec les droits de l'appelant,
--     la RLS (peut_ecrire_resultat*, peut_ecrire_temps_vitesse) et les
--     triggers existants (cohérence de l'issue, plafond ado, grimpeur engagé,
--     auteur forcé) s'appliquent comme pour une écriture directe ;
--   - contrôles explicites AVANT l'écriture, chacun avec un code d'erreur
--     traduit en message lisible côté application (spec #6 R4, spec #10 R4) :
--     `voie_introuvable` / `bloc_introuvable` (P0002), `hors_competition`
--     (42501), `hors_perimetre` (42501), `issue_non_admise` (22023),
--     `palier_invalide` (22023), `session_juge_absente` (42501) ;
--   - les fonctions coach renvoient, pour le grimpeur, ses résultats de voie
--     et de bloc AVEC leurs barèmes et ses points de vitesse : l'application en
--     déduit le score par le domaine (spec #7), sans calcul dupliqué en base.
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, grants rejouables.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Résultats d'un grimpeur pour une rencontre, avec les barèmes (score).
-- ---------------------------------------------------------------------------
create or replace function interclub.resultats_grimpeur_rencontre(
  p_rencontre uuid,
  p_grimpeur  uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'voies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'voie_difficulte_id',     rv.voie_difficulte_id,
        'issue',                  rv.issue,
        'points',                 vd.points,
        'points_prise_valorisee', vd.points_prise_valorisee,
        'points_zone1',           vd.points_zone1,
        'points_zone2',           vd.points_zone2
      ))
      from interclub.resultat_voie   rv
      join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
      join interclub.epreuve         e  on e.id = vd.epreuve_id
      where e.rencontre_id = p_rencontre
        and rv.grimpeur_id = p_grimpeur
    ), '[]'::jsonb),
    'blocs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bloc_id',       rb.bloc_id,
        'issue',         rb.issue,
        'palier_id',     rb.palier_id,
        'points_palier', bp.points
      ))
      from interclub.resultat_bloc    rb
      join interclub.bloc             b  on b.id = rb.bloc_id
      join interclub.epreuve          e  on e.id = b.epreuve_id
      left join interclub.bloc_palier bp on bp.id = rb.palier_id
      where e.rencontre_id = p_rencontre
        and rb.grimpeur_id = p_grimpeur
    ), '[]'::jsonb),
    'points_vitesse', coalesce((
      select pv.points
      from interclub.points_vitesse pv
      join interclub.epreuve        e on e.id = pv.epreuve_id
      where e.rencontre_id = p_rencontre
        and pv.grimpeur_id = p_grimpeur
    ), 0)
  );
$$;

comment on function interclub.resultats_grimpeur_rencontre(uuid, uuid) is
  'Résultats voie/bloc d''un grimpeur pour une rencontre, avec barèmes et points de vitesse — matière du score calculé par le domaine (spec #6 R20, rév. 2026-10-09). SECURITY INVOKER : RLS de lecture appliquée.';

-- ---------------------------------------------------------------------------
-- 2. Contexte d'une voie / d'un bloc + contrôles communs (coach).
-- ---------------------------------------------------------------------------
create or replace function interclub.controler_saisie_coach(
  p_epreuve   uuid,
  p_rencontre uuid,
  p_phase     text,
  p_grimpeur  uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_phase <> 'competition' then
    raise exception 'hors_competition' using errcode = '42501';
  end if;
  -- Coach permanent du club du grimpeur en ③, ou coach temporaire (session QR)
  -- de ce club sur CETTE rencontre — prêtés inclus via la composition (R2/R36).
  if not interclub.peut_ecrire_resultat(p_epreuve, p_grimpeur) then
    raise exception 'hors_perimetre' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Saisie / correction d'un résultat de voie (spec #6 R8–R14).
-- ---------------------------------------------------------------------------
create or replace function interclub.saisir_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid,
  p_issue    text
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
  v_categorie text;
  v_type_voie text;
begin
  select vd.epreuve_id, e.rencontre_id, r.phase::text, r.categorie::text, vd.type_voie::text
    into v_epreuve, v_rencontre, v_phase, v_categorie, v_type_voie
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
  if not found then
    raise exception 'voie_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  -- Issues admises (R10/R12) ; NP est posé automatiquement à la clôture (R18).
  if p_issue is null
     or p_issue not in ('top', 'prise_valorisee', 'zone2', 'zone1', 'echec')
     or (p_issue = 'prise_valorisee' and not (v_categorie = 'enfant' and v_type_voie = 'tete'))
     or (p_issue in ('zone1', 'zone2') and v_categorie <> 'ado') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;

  -- Correction = remplacement (R13). Plafond ado (R14) et auteur : triggers.
  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
  values (p_voie, p_grimpeur, p_issue)
  on conflict (voie_difficulte_id, grimpeur_id) do update set issue = excluded.issue;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Retrait d'un résultat de voie (ado, spec #6 R11/R14).
-- ---------------------------------------------------------------------------
create or replace function interclub.retirer_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid
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
begin
  select vd.epreuve_id, e.rencontre_id, r.phase::text
    into v_epreuve, v_rencontre, v_phase
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
  if not found then
    raise exception 'voie_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  delete from interclub.resultat_voie
  where voie_difficulte_id = p_voie and grimpeur_id = p_grimpeur;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Saisie / correction d'un résultat de bloc (spec #6 R15–R17).
-- ---------------------------------------------------------------------------
create or replace function interclub.saisir_resultat_bloc(
  p_bloc     uuid,
  p_grimpeur uuid,
  p_issue    text,
  p_palier   uuid
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
begin
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

  -- Palier atteint ou échec (R15/R16) ; NP posé à la clôture (R18).
  if p_issue is null or p_issue not in ('palier', 'echec') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;
  if p_issue = 'palier' and not exists (
    select 1 from interclub.bloc_palier bp where bp.id = p_palier and bp.bloc_id = p_bloc
  ) then
    raise exception 'palier_invalide' using errcode = '22023';
  end if;

  insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id)
  values (p_bloc, p_grimpeur, p_issue, case when p_issue = 'palier' then p_palier end)
  on conflict (bloc_id, grimpeur_id) do update
    set issue = excluded.issue, palier_id = excluded.palier_id;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Saisie / correction d'un résultat de vitesse par le juge (spec #10).
-- ---------------------------------------------------------------------------
create or replace function interclub.saisir_temps_vitesse(
  p_grimpeur uuid,
  p_issue    text,
  p_temps    numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve uuid;
begin
  -- Épreuve de vitesse de la rencontre du juge : session QR juge active, ③
  -- uniquement (R1/R3/R6) — sinon aucune épreuve.
  v_epreuve := (interclub.contexte_juge() ->> 'epreuve_vitesse_id')::uuid;
  if v_epreuve is null then
    raise exception 'session_juge_absente' using errcode = '42501';
  end if;

  -- Forme du résultat (R7–R9) : contraintes de la table ; grimpeur engagé
  -- (R7bis) et auteur : triggers ; périmètre : RLS peut_ecrire_temps_vitesse.
  insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
  values (v_epreuve, p_grimpeur, p_issue, case when p_issue = 'temps' then p_temps end)
  on conflict (epreuve_id, grimpeur_id) do update
    set issue = excluded.issue, temps = excluded.temps;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Droits : fermées à PUBLIC (privilèges par défaut, 202610031100) ;
--    ouvertes aux sessions authentifiées (coach permanent, sessions QR).
-- ---------------------------------------------------------------------------
revoke execute on function interclub.resultats_grimpeur_rencontre(uuid, uuid)        from public;
revoke execute on function interclub.controler_saisie_coach(uuid, uuid, text, uuid)  from public;
revoke execute on function interclub.saisir_resultat_voie(uuid, uuid, text)          from public;
revoke execute on function interclub.retirer_resultat_voie(uuid, uuid)              from public;
revoke execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid)    from public;
revoke execute on function interclub.saisir_temps_vitesse(uuid, text, numeric)       from public;

grant execute on function interclub.resultats_grimpeur_rencontre(uuid, uuid)        to authenticated;
grant execute on function interclub.controler_saisie_coach(uuid, uuid, text, uuid)  to authenticated;
grant execute on function interclub.saisir_resultat_voie(uuid, uuid, text)          to authenticated;
grant execute on function interclub.retirer_resultat_voie(uuid, uuid)              to authenticated;
grant execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid)    to authenticated;
grant execute on function interclub.saisir_temps_vitesse(uuid, text, numeric)       to authenticated;

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610091000_enregistrement_saisie_un_appel',
  'Spec #6 R3/R20, spec #10 R3/R14 (rév. 2026-10-09) : fonctions d''enregistrement en un appel (saisir_resultat_voie, saisir_resultat_bloc, retirer_resultat_voie, saisir_temps_vitesse), SECURITY INVOKER, contrôles codés puis écriture ; resultats_grimpeur_rencontre (résultats + barèmes pour le score).',
  'julleroyfr'
)
on conflict (version) do nothing;
