-- ===========================================================================
-- RETOUR ARRIÈRE de 202610231000_categorie_adulte (spec #20 R35)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette) pour annuler le lot 1 de la
-- catégorie adulte. Si des lots ultérieurs ont été appliqués, exécuter d'abord
-- LEURS retours arrière (ordre inverse d'application).
--
--   1. Supprime les données adultes : rencontres adultes (et, par cascade,
--      épreuves, voies, blocs, équipes, compositions, résultats, jetons) et le
--      gabarit adulte.
--   2. Restaure À L'IDENTIQUE les fonctions modifiées (copie de leur définition
--      avant la migration) et les contraintes de catégorie ('enfant', 'ado').
--   3. Retire la ligne de suivi de version.
--
-- Tout se fait dans une transaction : en cas d'erreur, rien n'est modifié.
-- Ce fichier n'est PAS une migration : il est hors de supabase/migrations/ et
-- n'est jamais rejoué par `db reset`.
-- ===========================================================================

begin;

-- 1. Données adultes.
delete from interclub.rencontre where categorie = 'adulte';
delete from interclub.gabarit_epreuve where categorie = 'adulte';

-- 2a. Contraintes de catégorie d'origine.
alter table interclub.rencontre
  drop constraint if exists rencontre_categorie_check;
alter table interclub.rencontre
  add constraint rencontre_categorie_check check (categorie in ('enfant', 'ado'));

alter table interclub.gabarit_epreuve
  drop constraint if exists gabarit_epreuve_categorie_check;
alter table interclub.gabarit_epreuve
  add constraint gabarit_epreuve_categorie_check check (categorie in ('enfant', 'ado'));

-- 2b. Fonctions d'origine (définitions antérieures à la migration).
create or replace function interclub.creer_rencontre_avec_gabarit(
  p_date           date,
  p_club_porteur   uuid,
  p_categorie      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rencontre_id  uuid;
  v_epreuve_id    uuid;
  v_bloc_id       uuid;
  v_ge            record;
  v_gb            record;
begin
  -- SECURITY DEFINER contourne la RLS `rencontre_insert_admin` : la garde
  -- admin doit donc être portée ici (spec #3 R12).
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  if p_categorie not in ('enfant', 'ado') then
    raise exception 'Catégorie invalide : %', p_categorie;
  end if;

  -- 1. Créer la rencontre (phase pré-compétition par défaut).
  insert into interclub.rencontre (date_rencontre, club_porteur_id, categorie)
  values (p_date, p_club_porteur, p_categorie)
  returning id into v_rencontre_id;

  -- 2. Copier chaque épreuve du gabarit (points chute/NP compris).
  for v_ge in
    select id, type, points_chute, points_non_presentation
    from interclub.gabarit_epreuve
    where categorie = p_categorie
    order by type
  loop
    insert into interclub.epreuve
      (rencontre_id, type, points_chute, points_non_presentation)
    values
      (v_rencontre_id, v_ge.type, v_ge.points_chute, v_ge.points_non_presentation)
    returning id into v_epreuve_id;

    -- Voies de difficulté (avec points, R38)
    insert into interclub.voie_difficulte
      (epreuve_id, niveau, type_voie, cotation, points,
       points_prise_valorisee, points_zone1, points_zone2, ordre)
    select
      v_epreuve_id, niveau, type_voie, cotation, points,
      points_prise_valorisee, points_zone1, points_zone2, ordre
    from interclub.gabarit_voie_difficulte
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Blocs et leurs paliers (R39)
    for v_gb in
      select id, code, ordre
      from interclub.gabarit_bloc
      where gabarit_epreuve_id = v_ge.id
      order by ordre
    loop
      insert into interclub.bloc (epreuve_id, code, ordre)
      values (v_epreuve_id, v_gb.code, v_gb.ordre)
      returning id into v_bloc_id;

      insert into interclub.bloc_palier (bloc_id, libelle, points, ordre)
      select v_bloc_id, libelle, points, ordre
      from interclub.gabarit_bloc_palier
      where gabarit_bloc_id = v_gb.id
      order by ordre;
    end loop;

    -- Voies de vitesse (rattachées à la rencontre — modèle existant)
    insert into interclub.voie_vitesse (rencontre_id, numero, libelle)
    select
      v_rencontre_id,
      (row_number() over (order by ordre))::int,
      libelle
    from interclub.gabarit_voie_vitesse
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Barème de vitesse — échelons par rang (R46)
    insert into interclub.bareme_vitesse_echelon
      (epreuve_id, rang_min, rang_max, points, decrement, ordre)
    select
      v_epreuve_id, rang_min, rang_max, points, decrement, ordre
    from interclub.gabarit_bareme_vitesse_echelon
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

  end loop;

  return v_rencontre_id;
end;
$$;

create or replace function interclub.valider_resultat_voie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
  v_type_voie text;
begin
  select r.categorie, vd.type_voie
    into v_categorie, v_type_voie
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = new.voie_difficulte_id;

  if new.issue = 'prise_valorisee'
     and not (v_categorie = 'enfant' and v_type_voie = 'tete') then
    raise exception
      'Issue « prise_valorisee » réservée aux voies tête enfant (R10).';
  end if;

  if new.issue in ('zone1', 'zone2') and v_categorie <> 'ado' then
    raise exception
      'Issues « zone1 »/« zone2 » réservées à la catégorie ado (R12).';
  end if;

  return new;
end;
$$;

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

create or replace function interclub.verifier_plafond_voies_ado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_categorie text;
  v_autres    int;
begin
  select vd.epreuve_id, r.categorie
    into v_epreuve, v_categorie
    from interclub.voie_difficulte vd
    join interclub.epreuve e   on e.id = vd.epreuve_id
    join interclub.rencontre r on r.id = e.rencontre_id
   where vd.id = new.voie_difficulte_id;

  if v_categorie is distinct from 'ado' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.grimpeur_id::text || ':' || v_epreuve::text, 0)
  );

  select count(*)
    into v_autres
    from interclub.resultat_voie rv
    join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
   where rv.grimpeur_id = new.grimpeur_id
     and vd.epreuve_id = v_epreuve
     and rv.voie_difficulte_id <> new.voie_difficulte_id;

  if v_autres >= 6 then
    raise exception 'plafond_voies_ado'
      using errcode = '23514',
            detail = 'Un grimpeur ado réalise au plus 6 voies (spec #6 R14).';
  end if;
  return new;
end;
$$;

-- 3. Suivi de version.
delete from interclub.version where version = '202610231000_categorie_adulte';

commit;
