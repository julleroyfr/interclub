-- ===========================================================================
-- RETOUR ARRIÈRE de 202610231200_top_moulinette (spec #20 R35)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette), avant les retours
-- arrière des lots antérieurs (ordre inverse d'application).
--
--   1. Supprime les résultats de voie « top en moulinette ».
--   2. Restaure la contrainte d'issue et, À L'IDENTIQUE, les fonctions
--      `valider_resultat_voie` et `saisir_resultat_voie` dans leur version du
--      lot 1 (202610231000_categorie_adulte).
--   3. Retire la ligne de suivi de version.
--
-- Une seule transaction. Ce fichier n'est PAS une migration.
-- ===========================================================================

begin;

-- 1. Résultats en moulinette.
delete from interclub.resultat_voie where issue = 'top_moulinette';

-- 2a. Contrainte d'issue d'origine.
alter table interclub.resultat_voie
  drop constraint if exists resultat_voie_issue_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_issue_check check (issue in ('top', 'prise_valorisee', 'zone1', 'zone2', 'echec', 'np'));

-- 2b. Fonctions dans leur version du lot 1.
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

-- 3. Suivi de version.
delete from interclub.version where version = '202610231200_top_moulinette';

commit;
