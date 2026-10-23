-- ===========================================================================
-- 202610231000_categorie_adulte
--
-- Objet : catégorie de rencontre « adulte » (spec #20, validée le 2026-10-23),
--         lot 1 — catégorie et gabarit.
--   1. Contraintes `rencontre.categorie` et `gabarit_epreuve.categorie` :
--      ajout de la valeur 'adulte' (R1, R6).
--   2. `creer_rencontre_avec_gabarit` accepte 'adulte' (R1).
--   3. Zones (zone1/zone2) admises en adulte : trigger `valider_resultat_voie`
--      et fonction `saisir_resultat_voie` (R24, R26).
--   4. Plafond de 6 voies étendu à l'adulte : `verifier_plafond_voies_ado` (R22).
--   5. Gabarit adulte (R7–R9) : T1–T10 au barème de l'addendum, B1 (15/30),
--      B2 (20/50/70), vitesse « Voie 1 »/« Voie 2 », barème 100-95-90-85-80 puis
--      75/60/45/30/15 par tranches de 5, au-delà 10, chute 5, NP 0.
--
-- Réversibilité (R34/R35) : migration ADDITIVE — aucun comportement enfant/ado
-- ne change (les fonctions ne diffèrent que par l'ajout de 'adulte'). Retour
-- arrière : supabase/retours-arriere/202610231000_categorie_adulte_retour_arriere.sql.
-- `create or replace function` conserve les droits existants (pas de grant).
--
-- Idempotent. Application : MANUELLE dans le SQL Editor Supabase (recette).
-- ===========================================================================

-- 1. Valeur 'adulte' dans les contraintes de catégorie (R1, R6).
alter table interclub.rencontre
  drop constraint if exists rencontre_categorie_check;
alter table interclub.rencontre
  add constraint rencontre_categorie_check check (categorie in ('enfant', 'ado', 'adulte'));

alter table interclub.gabarit_epreuve
  drop constraint if exists gabarit_epreuve_categorie_check;
alter table interclub.gabarit_epreuve
  add constraint gabarit_epreuve_categorie_check check (categorie in ('enfant', 'ado', 'adulte'));

-- 2. Création de rencontre (R1).
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

  if p_categorie not in ('enfant', 'ado', 'adulte') then
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

-- 3a. Cohérence issue ↔ catégorie : zones en ado et adulte (R26).
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

  if new.issue in ('zone1', 'zone2') and v_categorie not in ('ado', 'adulte') then
    raise exception
      'Issues « zone1 »/« zone2 » réservées aux catégories ado et adulte (R12, spec #20 R26).';
  end if;

  return new;
end;
$$;

-- 3b. Enregistrement en un appel : zones en ado et adulte (R26).
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
     or (p_issue in ('zone1', 'zone2') and v_categorie not in ('ado', 'adulte')) then
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

-- 4. Plafond de 6 voies en ado et adulte (R22).
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

  if v_categorie is null or v_categorie not in ('ado', 'adulte') then
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

-- 5. Gabarit adulte (R7–R9), idempotent.
do $$
declare
  ge_voie    uuid;
  ge_bloc    uuid;
  ge_vitesse uuid;
  b1         uuid;
  b2         uuid;
begin
  insert into interclub.gabarit_epreuve (categorie, type)
  values ('adulte', 'voie')
  on conflict (categorie, type) do nothing;
  select id into ge_voie from interclub.gabarit_epreuve
   where categorie = 'adulte' and type = 'voie';

  if not exists (select 1 from interclub.gabarit_voie_difficulte where gabarit_epreuve_id = ge_voie) then
    insert into interclub.gabarit_voie_difficulte
      (gabarit_epreuve_id, niveau, type_voie, cotation, points, points_zone1, points_zone2, ordre)
    values
      (ge_voie, 'T1',  'tete', '4c',  4,  1,  2,  1),
      (ge_voie, 'T2',  'tete', '5a',  6,  3,  4,  2),
      (ge_voie, 'T3',  'tete', '5b',  8,  5,  6,  3),
      (ge_voie, 'T4',  'tete', '5c', 10,  7,  8,  4),
      (ge_voie, 'T5',  'tete', '6a', 12,  9, 10,  5),
      (ge_voie, 'T6',  'tete', '6b', 14, 11, 12,  6),
      (ge_voie, 'T7',  'tete', '6c', 16, 13, 14,  7),
      (ge_voie, 'T8',  'tete', '7a', 18, 15, 16,  8),
      (ge_voie, 'T9',  'tete', '7b', 20, 17, 18,  9),
      (ge_voie, 'T10', 'tete', '7c', 22, 19, 20, 10);
  end if;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('adulte', 'bloc')
  on conflict (categorie, type) do nothing;
  select id into ge_bloc from interclub.gabarit_epreuve
   where categorie = 'adulte' and type = 'bloc';

  insert into interclub.gabarit_bloc (gabarit_epreuve_id, code, ordre)
  values (ge_bloc, 'B1', 1), (ge_bloc, 'B2', 2)
  on conflict (gabarit_epreuve_id, code) do nothing;
  select id into b1 from interclub.gabarit_bloc where gabarit_epreuve_id = ge_bloc and code = 'B1';
  select id into b2 from interclub.gabarit_bloc where gabarit_epreuve_id = ge_bloc and code = 'B2';

  if not exists (select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b1) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b1, 'Zone', 15, 1), (b1, 'Bloc complet', 30, 2);
  end if;
  if not exists (select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b2) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b2, 'Zone 1', 20, 1), (b2, 'Zone 2', 50, 2), (b2, 'Bloc complet', 70, 3);
  end if;

  insert into interclub.gabarit_epreuve (categorie, type, points_chute, points_non_presentation)
  values ('adulte', 'vitesse', 5, 0)
  on conflict (categorie, type) do nothing;
  select id into ge_vitesse from interclub.gabarit_epreuve
   where categorie = 'adulte' and type = 'vitesse';

  if not exists (select 1 from interclub.gabarit_voie_vitesse where gabarit_epreuve_id = ge_vitesse) then
    insert into interclub.gabarit_voie_vitesse (gabarit_epreuve_id, libelle, ordre)
    values (ge_vitesse, 'Voie 1', 1), (ge_vitesse, 'Voie 2', 2);
  end if;

  if not exists (select 1 from interclub.gabarit_bareme_vitesse_echelon where gabarit_epreuve_id = ge_vitesse) then
    insert into interclub.gabarit_bareme_vitesse_echelon
      (gabarit_epreuve_id, rang_min, rang_max, points, decrement, ordre)
    values
      (ge_vitesse,  1,    5, 100, 5, 1),
      (ge_vitesse,  6,   10,  75, 0, 2),
      (ge_vitesse, 11,   15,  60, 0, 3),
      (ge_vitesse, 16,   20,  45, 0, 4),
      (ge_vitesse, 21,   25,  30, 0, 5),
      (ge_vitesse, 26,   30,  15, 0, 6),
      (ge_vitesse, 31, null,  10, 0, 7);
  end if;
end;
$$;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610231000_categorie_adulte',
  'Catégorie adulte, lot 1 (spec #20 R1, R6–R9, R22, R26) : valeur adulte dans les contraintes rencontre/gabarit_epreuve, creer_rencontre_avec_gabarit, zones et plafond 6 voies étendus à l''adulte, gabarit adulte. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
