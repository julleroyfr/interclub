-- ===========================================================================
-- 202610231200_top_moulinette
--
-- Objet : catégorie adulte (spec #20, validée le 2026-10-23), lot 4 — voie
--         réussie en moulinette (issue `top_moulinette`) : moitié des points du
--         top, arrondie à l'entier supérieur, sans zone (R23, R25, R26). Le
--         calcul des points est fait par l'application (spec #7, domaine).
--   1. Contrainte `resultat_voie_issue_check` : ajout de 'top_moulinette'.
--   2. Trigger `valider_resultat_voie` : 'top_moulinette' réservé aux voies
--      tête des rencontres adultes (R26).
--   3. `saisir_resultat_voie` : accepte 'top_moulinette' aux mêmes conditions.
--
-- Réversibilité (R34/R35) : additive. Retour arrière :
-- supabase/retours-arriere/202610231200_top_moulinette_retour_arriere.sql.
-- Prérequis : 202610231000_categorie_adulte. Idempotent. Application MANUELLE.
-- ===========================================================================

-- 1. Nouvelle valeur d'issue (R23).
alter table interclub.resultat_voie
  drop constraint if exists resultat_voie_issue_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_issue_check check (issue in ('top', 'top_moulinette', 'prise_valorisee', 'zone1', 'zone2', 'echec', 'np'));

-- 2. Cohérence issue ↔ catégorie : top en moulinette en adulte seulement (R26).
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

  if new.issue = 'top_moulinette'
     and not (v_categorie = 'adulte' and v_type_voie = 'tete') then
    raise exception
      'Issue « top_moulinette » réservée aux voies tête adulte (spec #20 R26).';
  end if;

  if new.issue in ('zone1', 'zone2') and v_categorie not in ('ado', 'adulte') then
    raise exception
      'Issues « zone1 »/« zone2 » réservées aux catégories ado et adulte (R12, spec #20 R26).';
  end if;

  return new;
end;
$$;

-- 3. Enregistrement en un appel : top en moulinette admis en adulte (R26).
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
     or p_issue not in ('top', 'top_moulinette', 'prise_valorisee', 'zone2', 'zone1', 'echec')
     or (p_issue = 'top_moulinette' and not (v_categorie = 'adulte' and v_type_voie = 'tete'))
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

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610231200_top_moulinette',
  'Catégorie adulte, lot 4 (spec #20 R23, R25, R26) : issue de voie top_moulinette (contrainte resultat_voie_issue_check, trigger valider_resultat_voie, saisir_resultat_voie) réservée aux voies tête adultes. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
