-- ===========================================================================
-- 202610231100_equipes_adultes
--
-- Objet : catégorie adulte (spec #20, validée le 2026-10-23), lot 3 — équipes
--         adultes créées et composées par l'admin, sans club, 4 au plus.
--   1. `equipe.club_id` devient facultatif (R11).
--   2. Trigger `verifier_club_equipe_categorie` : rencontre adulte → club vide
--      obligatoire ; enfant/ado → club obligatoire, comme avant (R11). Empêche
--      aussi un coach de créer une équipe à son nom dans une rencontre adulte.
--   3. Unicité du nom d'une équipe adulte dans sa rencontre (index partiel, R14).
--   4. Trigger `verifier_effectif_equipe_adulte` : 4 grimpeurs au plus (R12).
--   5. `liste_grimpeurs_vitesse` (écran juge) : club de l'équipe, sinon club du
--      grimpeur — sans quoi les adultes disparaîtraient de l'écran juge (R28).
--
-- Droits : aucune policy modifiée. Avec un club vide, `peut_ecrire_equipe`,
-- `peut_ecrire_composition` et `est_coach_de_club` refusent tout coach : seul
-- l'admin écrit (R10).
--
-- Réversibilité (R34/R35) : additive. Retour arrière :
-- supabase/retours-arriere/202610231100_equipes_adultes_retour_arriere.sql.
-- Prérequis : 202610231000_categorie_adulte. Idempotent. Application MANUELLE.
-- ===========================================================================

-- 1. Club facultatif (R11).
alter table interclub.equipe alter column club_id drop not null;

-- 2. Club vide ⇔ rencontre adulte (R11).
create or replace function interclub.verifier_club_equipe_categorie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
begin
  select categorie into v_categorie from interclub.rencontre where id = new.rencontre_id;
  if v_categorie = 'adulte' and new.club_id is not null then
    raise exception 'equipe_adulte_sans_club'
      using errcode = '23514',
            detail = 'Une équipe adulte n''est rattachée à aucun club (spec #20 R11).';
  end if;
  if v_categorie is distinct from 'adulte' and new.club_id is null then
    raise exception 'equipe_club_obligatoire'
      using errcode = '23502',
            detail = 'Une équipe enfant ou ado est rattachée à un club.';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_club_equipe_categorie() is
  'Trigger BEFORE INSERT/UPDATE (equipe) : club vide en rencontre adulte, club obligatoire sinon (spec #20 R11).';

drop trigger if exists equipe_club_categorie on interclub.equipe;
create trigger equipe_club_categorie
  before insert or update of club_id, rencontre_id on interclub.equipe
  for each row execute function interclub.verifier_club_equipe_categorie();

-- 3. Nom unique d'une équipe adulte dans sa rencontre (R14).
create unique index if not exists uq_equipe_adulte_nom
  on interclub.equipe (rencontre_id, nom)
  where club_id is null;

-- 4. Effectif d'une équipe adulte : 4 au plus (R12).
create or replace function interclub.verifier_effectif_equipe_adulte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
  v_autres    int;
begin
  -- Verrou de l'équipe : sérialise les ajouts concurrents.
  select r.categorie into v_categorie
    from interclub.equipe e
    join interclub.rencontre r on r.id = e.rencontre_id
   where e.id = new.equipe_id
   for update of e;
  if v_categorie is distinct from 'adulte' then
    return new;
  end if;

  select count(*) into v_autres
    from interclub.composition
   where equipe_id = new.equipe_id
     and grimpeur_id <> new.grimpeur_id;
  if v_autres >= 4 then
    raise exception 'effectif_equipe_adulte'
      using errcode = '23514',
            detail = 'Une équipe adulte compte au plus 4 grimpeurs (spec #20 R12).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_effectif_equipe_adulte() is
  'Trigger BEFORE INSERT/UPDATE OF equipe_id (composition) : 4 grimpeurs au plus dans une équipe adulte (spec #20 R12).';

drop trigger if exists composition_effectif_adulte on interclub.composition;
create trigger composition_effectif_adulte
  before insert or update of equipe_id on interclub.composition
  for each row execute function interclub.verifier_effectif_equipe_adulte();

-- 5. Roster de l'écran juge : club de l'équipe, sinon du grimpeur (R28).
create or replace function interclub.liste_grimpeurs_vitesse(p_epreuve uuid)
returns table (
  grimpeur_id uuid,
  nom         text,
  prenom      text,
  sexe        text,
  club_nom    text,
  issue       text,
  temps       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.nom, g.prenom, g.sexe, cl.nom,
    tv.issue, tv.temps
  from interclub.epreuve ep
  join interclub.equipe      e  on e.rencontre_id = ep.rencontre_id
  join interclub.composition c  on c.equipe_id = e.id
  join interclub.grimpeur    g  on g.id = c.grimpeur_id
  -- Équipe adulte sans club (spec #20 R11) : club d'origine du grimpeur.
  join interclub.club        cl on cl.id = coalesce(e.club_id, g.club_id)
  left join interclub.temps_vitesse tv
         on tv.epreuve_id = ep.id and tv.grimpeur_id = g.id
  where ep.id = p_epreuve
    and ep.type = 'vitesse'
    and (interclub.est_admin() or interclub.est_juge_de_rencontre(ep.rencontre_id));
$$;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610231100_equipes_adultes',
  'Catégorie adulte, lot 3 (spec #20 R10–R14) : equipe.club_id facultatif ; triggers club vide ⇔ rencontre adulte et effectif 4 au plus en adulte ; nom unique par rencontre adulte ; liste_grimpeurs_vitesse prend le club du grimpeur si l''équipe n''en a pas. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
