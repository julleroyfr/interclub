-- ===========================================================================
-- 202610251100_epreuves_desactivables
--
-- Objet : catégorie adulte (spec #20 R36–R40, révision du 2026-10-25) —
--         l'admin désactive l'épreuve de bloc et/ou de vitesse d'une rencontre
--         adulte selon les personnes présentes.
--   1. Colonne `epreuve.active` (vrai par défaut) : toutes les épreuves
--      existantes restent actives.
--   2. Trigger `verifier_etat_epreuve` : une épreuve n'est inactive que si elle
--      est de bloc ou de vitesse dans une rencontre adulte (R36), et son état
--      ne change qu'en ① pré-compétition ou ② préparation (R37).
--   3. Trigger `revoquer_jetons_juges_vitesse` : désactiver la vitesse révoque
--      les jetons juges actifs de la rencontre (R39).
--   4. Trigger `verifier_jeton_juge_vitesse_active` : pas de nouveau jeton juge
--      tant que la vitesse est désactivée (R39).
--   5. Triggers `verifier_epreuve_active_*` : aucun résultat de bloc ni temps de
--      vitesse sur une épreuve désactivée (R40).
--
-- Droits : aucune policy modifiée (la mise à jour d'une épreuve reste réservée à
-- l'admin, `epreuve_update_admin`). Enfant et ado : inchangés (R34).
--
-- Réversibilité (R34/R35) : additive. Retour arrière :
-- supabase/retours-arriere/202610251100_epreuves_desactivables_retour_arriere.sql.
-- Prérequis : 202610231000_categorie_adulte. Idempotent. Application MANUELLE.
-- ===========================================================================

-- 1. État de l'épreuve.
alter table interclub.epreuve add column if not exists active boolean not null default true;

comment on column interclub.epreuve.active is
  'Faux : épreuve de bloc ou de vitesse désactivée dans une rencontre adulte (spec #20 R36–R40).';

-- 2. Qui peut être désactivé, et quand (R36, R37).
create or replace function interclub.verifier_etat_epreuve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
  v_phase     text;
begin
  if tg_op = 'UPDATE' and new.active is not distinct from old.active then
    return new;
  end if;
  if tg_op = 'INSERT' and new.active then
    return new;
  end if;

  select r.categorie, r.phase into v_categorie, v_phase
    from interclub.rencontre r where r.id = new.rencontre_id;

  if not new.active and (v_categorie is distinct from 'adulte' or new.type not in ('bloc', 'vitesse')) then
    raise exception 'epreuve_non_desactivable'
      using errcode = '23514',
            detail = 'Seules les épreuves de bloc et de vitesse d''une rencontre adulte se désactivent (spec #20 R36).';
  end if;
  if v_phase not in ('pre_competition', 'preparation') then
    raise exception 'etat_epreuve_fige'
      using errcode = '23514',
            detail = 'Une épreuve ne s''active ou ne se désactive qu''en pré-compétition ou en préparation (spec #20 R37).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_etat_epreuve() is
  'Trigger BEFORE INSERT/UPDATE OF active (epreuve) : bloc ou vitesse d''une rencontre adulte, en ①/② seulement (spec #20 R36/R37).';

drop trigger if exists epreuve_etat on interclub.epreuve;
create trigger epreuve_etat
  before insert or update of active on interclub.epreuve
  for each row execute function interclub.verifier_etat_epreuve();

-- 3. Désactiver la vitesse révoque ses jetons juges (R39).
create or replace function interclub.revoquer_jetons_juges_vitesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'vitesse' and old.active and not new.active then
    update interclub.jeton_qr j
       set actif = false
     where j.nature = 'juge'
       and j.actif
       and j.voie_vitesse_id in (select vv.id from interclub.voie_vitesse vv where vv.rencontre_id = new.rencontre_id);
  end if;
  return null;
end;
$$;

comment on function interclub.revoquer_jetons_juges_vitesse() is
  'Trigger AFTER UPDATE OF active (epreuve) : la désactivation de la vitesse révoque ses jetons juges (spec #20 R39).';

drop trigger if exists epreuve_vitesse_revoque_juges on interclub.epreuve;
create trigger epreuve_vitesse_revoque_juges
  after update of active on interclub.epreuve
  for each row execute function interclub.revoquer_jetons_juges_vitesse();

-- 4. Pas de jeton juge sur une vitesse désactivée (R39).
create or replace function interclub.verifier_jeton_juge_vitesse_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.nature = 'juge' and new.actif and exists (
    select 1
      from interclub.voie_vitesse vv
      join interclub.epreuve e on e.rencontre_id = vv.rencontre_id and e.type = 'vitesse'
     where vv.id = new.voie_vitesse_id and not e.active
  ) then
    raise exception 'epreuve_desactivee'
      using errcode = '23514',
            detail = 'L''épreuve de vitesse est désactivée : aucun jeton juge (spec #20 R39).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_jeton_juge_vitesse_active() is
  'Trigger BEFORE INSERT/UPDATE (jeton_qr) : aucun jeton juge actif sur une épreuve de vitesse désactivée (spec #20 R39).';

drop trigger if exists jeton_qr_juge_vitesse_active on interclub.jeton_qr;
create trigger jeton_qr_juge_vitesse_active
  before insert or update of nature, voie_vitesse_id, actif on interclub.jeton_qr
  for each row execute function interclub.verifier_jeton_juge_vitesse_active();

-- 5. Aucun résultat sur une épreuve désactivée (R40).
create or replace function interclub.verifier_epreuve_active_bloc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from interclub.bloc b join interclub.epreuve e on e.id = b.epreuve_id
     where b.id = new.bloc_id and not e.active
  ) then
    raise exception 'epreuve_desactivee'
      using errcode = '23514',
            detail = 'L''épreuve de bloc est désactivée pour cette rencontre (spec #20 R40).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_epreuve_active_bloc() is
  'Trigger BEFORE INSERT/UPDATE (resultat_bloc) : refus sur une épreuve de bloc désactivée (spec #20 R40).';

drop trigger if exists resultat_bloc_epreuve_active on interclub.resultat_bloc;
create trigger resultat_bloc_epreuve_active
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.verifier_epreuve_active_bloc();

create or replace function interclub.verifier_epreuve_active_vitesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from interclub.epreuve e where e.id = new.epreuve_id and not e.active) then
    raise exception 'epreuve_desactivee'
      using errcode = '23514',
            detail = 'L''épreuve de vitesse est désactivée pour cette rencontre (spec #20 R40).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_epreuve_active_vitesse() is
  'Trigger BEFORE INSERT/UPDATE (temps_vitesse) : refus sur une épreuve de vitesse désactivée (spec #20 R40).';

drop trigger if exists temps_vitesse_epreuve_active on interclub.temps_vitesse;
create trigger temps_vitesse_epreuve_active
  before insert or update on interclub.temps_vitesse
  for each row execute function interclub.verifier_epreuve_active_vitesse();

-- Les fonctions trigger ne sont pas des RPC.
revoke execute on function interclub.verifier_etat_epreuve() from public;
revoke execute on function interclub.revoquer_jetons_juges_vitesse() from public;
revoke execute on function interclub.verifier_jeton_juge_vitesse_active() from public;
revoke execute on function interclub.verifier_epreuve_active_bloc() from public;
revoke execute on function interclub.verifier_epreuve_active_vitesse() from public;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610251100_epreuves_desactivables',
  'Catégorie adulte (spec #20 R36–R40) : colonne epreuve.active ; triggers d''état (bloc/vitesse adulte, en ①/②), révocation des jetons juges à la désactivation de la vitesse, refus des jetons juges et des résultats de bloc / temps sur une épreuve désactivée. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
