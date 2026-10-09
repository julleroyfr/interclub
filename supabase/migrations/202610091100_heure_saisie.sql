-- ===========================================================================
-- 202610091100_heure_saisie
--
-- Objet : spec #17 R6–R11, R19, R20 ; spec #6 R13bis, spec #9 R6 (rév.),
--         spec #10 R11bis (révisions validées le 2026-10-03) — saisie hors
--         ligne, lot 2 :
--   1. colonne `saisi_le` (heure de saisie) sur resultat_voie, resultat_bloc,
--      temps_vitesse ;
--   2. trigger `controler_heure_saisie` : heure future ramenée à now() (R7) ;
--      écriture sans heure de saisie mais changeant la valeur (admin, R8) →
--      now() ; écriture PLUS ANCIENNE que la ligne existante refusée
--      (`saisie_plus_ancienne`, R9), heure égale acceptée (R11) — quel que
--      soit le chemin (fonction ou API) ;
--   3. fonctions d'enregistrement (202610091000) avec l'heure de saisie en
--      paramètre ; retrait conditionné à l'heure (R10) ; refus distincts
--      `session_absente` (R19) et `competition_cloturee` (R20).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `add column if not exists`, `create or replace`, `drop … if
--         exists`, grants rejouables.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Heure de saisie. Les lignes existantes reçoivent l'heure de la migration.
-- ---------------------------------------------------------------------------
alter table interclub.resultat_voie add column if not exists saisi_le timestamptz not null default now();
alter table interclub.resultat_bloc add column if not exists saisi_le timestamptz not null default now();
alter table interclub.temps_vitesse add column if not exists saisi_le timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Trigger : la saisie la plus récente l'emporte (R7–R11).
--    « Valeur » d'un résultat = la ligne hors colonnes techniques (heure,
--    horodatage, auteur, coche de contrôle) : une coche ne change pas l'heure.
-- ---------------------------------------------------------------------------
create or replace function interclub.controler_heure_saisie()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_techniques text[] := array[
    'saisi_le', 'updated_at', 'created_at', 'controle_le', 'controle_par',
    'auteur_utilisateur_id', 'auteur_role'
  ];
begin
  if tg_op = 'INSERT' then
    if new.saisi_le is null or new.saisi_le > now() then
      new.saisi_le := now();                                   -- R7
    end if;
    return new;
  end if;

  if new.saisi_le is distinct from old.saisi_le then
    -- Heure de saisie fournie par l'écrivain.
    if new.saisi_le is null or new.saisi_le > now() then
      new.saisi_le := now();                                   -- R7
    end if;
    if new.saisi_le < old.saisi_le then
      raise exception 'saisie_plus_ancienne' using errcode = 'P0001';   -- R9
    end if;
  elsif (to_jsonb(new) - v_techniques) is distinct from (to_jsonb(old) - v_techniques) then
    -- Valeur modifiée sans heure de saisie (admin, API) : heure du serveur (R8).
    new.saisi_le := now();
  end if;
  return new;                                                  -- égalité : R11
end;
$$;

comment on function interclub.controler_heure_saisie() is
  'Trigger BEFORE INSERT/UPDATE (resultat_voie/resultat_bloc/temps_vitesse) : heure de saisie future ramenée à now() (spec #17 R7) ; valeur modifiée sans heure → now() (R8) ; écriture plus ancienne que la ligne refusée « saisie_plus_ancienne » (R9) ; égalité acceptée (R11).';

drop trigger if exists resultat_voie_heure_saisie on interclub.resultat_voie;
create trigger resultat_voie_heure_saisie
  before insert or update on interclub.resultat_voie
  for each row execute function interclub.controler_heure_saisie();

drop trigger if exists resultat_bloc_heure_saisie on interclub.resultat_bloc;
create trigger resultat_bloc_heure_saisie
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.controler_heure_saisie();

drop trigger if exists temps_vitesse_heure_saisie on interclub.temps_vitesse;
create trigger temps_vitesse_heure_saisie
  before insert or update on interclub.temps_vitesse
  for each row execute function interclub.controler_heure_saisie();

-- ---------------------------------------------------------------------------
-- 3. Contrôles communs coach : session (R19) AVANT toute lecture — une session
--    absente ne peut pas lire la structure — puis phase (R20) et périmètre.
-- ---------------------------------------------------------------------------
create or replace function interclub.exiger_session_coach()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Coach permanent (compte rattaché à un club) ou session QR coach active.
  if interclub.club_courant() is null and interclub.contexte_coach_temporaire() is null then
    raise exception 'session_absente' using errcode = '42501';
  end if;
end;
$$;

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
  if p_phase in ('cloture', 'resultats_publics') then
    raise exception 'competition_cloturee' using errcode = '42501';   -- R20
  end if;
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
-- 4. Fonctions d'enregistrement avec l'heure de saisie (remplacent les
--    signatures sans heure : une seule fonction par nom pour l'API).
-- ---------------------------------------------------------------------------
drop function if exists interclub.saisir_resultat_voie(uuid, uuid, text);
drop function if exists interclub.retirer_resultat_voie(uuid, uuid);
drop function if exists interclub.saisir_resultat_bloc(uuid, uuid, text, uuid);
drop function if exists interclub.saisir_temps_vitesse(uuid, text, numeric);

create or replace function interclub.saisir_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid,
  p_issue    text,
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
  v_categorie text;
  v_type_voie text;
begin
  perform interclub.exiger_session_coach();

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

  if p_issue is null
     or p_issue not in ('top', 'prise_valorisee', 'zone2', 'zone1', 'echec')
     or (p_issue = 'prise_valorisee' and not (v_categorie = 'enfant' and v_type_voie = 'tete'))
     or (p_issue in ('zone1', 'zone2') and v_categorie <> 'ado') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;

  -- Correction = remplacement (R13) ; heure de saisie : trigger (R7–R11).
  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue, saisi_le)
  values (p_voie, p_grimpeur, p_issue, coalesce(p_saisi_le, now()))
  on conflict (voie_difficulte_id, grimpeur_id) do update
    set issue = excluded.issue, saisi_le = excluded.saisi_le;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

create or replace function interclub.retirer_resultat_voie(
  p_voie     uuid,
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

  -- R10 : un retrait ne supprime pas une saisie plus récente que lui.
  if exists (
    select 1 from interclub.resultat_voie
    where voie_difficulte_id = p_voie and grimpeur_id = p_grimpeur and saisi_le > v_heure
  ) then
    raise exception 'saisie_plus_ancienne' using errcode = 'P0001';
  end if;

  delete from interclub.resultat_voie
  where voie_difficulte_id = p_voie and grimpeur_id = p_grimpeur;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

create or replace function interclub.saisir_resultat_bloc(
  p_bloc     uuid,
  p_grimpeur uuid,
  p_issue    text,
  p_palier   uuid,
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

  if p_issue is null or p_issue not in ('palier', 'echec') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;
  if p_issue = 'palier' and not exists (
    select 1 from interclub.bloc_palier bp where bp.id = p_palier and bp.bloc_id = p_bloc
  ) then
    raise exception 'palier_invalide' using errcode = '22023';
  end if;

  insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id, saisi_le)
  values (p_bloc, p_grimpeur, p_issue, case when p_issue = 'palier' then p_palier end,
          coalesce(p_saisi_le, now()))
  on conflict (bloc_id, grimpeur_id) do update
    set issue = excluded.issue, palier_id = excluded.palier_id, saisi_le = excluded.saisi_le;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

create or replace function interclub.saisir_temps_vitesse(
  p_grimpeur uuid,
  p_issue    text,
  p_temps    numeric,
  p_saisi_le timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve uuid;
begin
  -- Session QR juge active, ③ uniquement (R1/R3/R6) — sinon session absente :
  -- la saisie reste en attente côté appareil (spec #17 R19).
  v_epreuve := (interclub.contexte_juge() ->> 'epreuve_vitesse_id')::uuid;
  if v_epreuve is null then
    raise exception 'session_juge_absente' using errcode = '42501';
  end if;

  insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps, saisi_le)
  values (v_epreuve, p_grimpeur, p_issue, case when p_issue = 'temps' then p_temps end,
          coalesce(p_saisi_le, now()))
  on conflict (epreuve_id, grimpeur_id) do update
    set issue = excluded.issue, temps = excluded.temps, saisi_le = excluded.saisi_le;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Droits : fermés à PUBLIC, ouverts aux sessions authentifiées.
-- ---------------------------------------------------------------------------
revoke execute on function interclub.controler_heure_saisie()                                 from public;
revoke execute on function interclub.exiger_session_coach()                                   from public;
revoke execute on function interclub.saisir_resultat_voie(uuid, uuid, text, timestamptz)       from public;
revoke execute on function interclub.retirer_resultat_voie(uuid, uuid, timestamptz)           from public;
revoke execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid, timestamptz) from public;
revoke execute on function interclub.saisir_temps_vitesse(uuid, text, numeric, timestamptz)    from public;

grant execute on function interclub.exiger_session_coach()                                   to authenticated;
grant execute on function interclub.saisir_resultat_voie(uuid, uuid, text, timestamptz)       to authenticated;
grant execute on function interclub.retirer_resultat_voie(uuid, uuid, timestamptz)           to authenticated;
grant execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid, timestamptz) to authenticated;
grant execute on function interclub.saisir_temps_vitesse(uuid, text, numeric, timestamptz)    to authenticated;

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610091100_heure_saisie',
  'Spec #17 R6–R11/R19/R20 (lot 2) : colonne saisi_le (resultat_voie, resultat_bloc, temps_vitesse) + trigger controler_heure_saisie (heure future → now, sans heure → now, plus ancienne refusée « saisie_plus_ancienne ») ; fonctions d''enregistrement avec p_saisi_le, retrait conditionné, refus session_absente / competition_cloturee.',
  'julleroyfr'
)
on conflict (version) do nothing;
