-- ===========================================================================
-- RETOUR ARRIÈRE de 202610231100_equipes_adultes (spec #20 R35)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette), AVANT le retour arrière de
-- 202610231000_categorie_adulte (ordre inverse d'application).
--
--   1. Supprime les équipes sans club (équipes adultes) et, par cascade, leurs
--      compositions et résultats.
--   2. Retire triggers, fonctions et index ajoutés ; remet `equipe.club_id` à
--      NOT NULL ; restaure À L'IDENTIQUE `liste_grimpeurs_vitesse`.
--   3. Retire la ligne de suivi de version.
--
-- Une seule transaction. Ce fichier n'est PAS une migration.
-- ===========================================================================

begin;

-- 1. Équipes adultes.
delete from interclub.equipe where club_id is null;

-- 2a. Objets ajoutés.
drop trigger if exists composition_effectif_adulte on interclub.composition;
drop function if exists interclub.verifier_effectif_equipe_adulte();
drop index if exists interclub.uq_equipe_adulte_nom;
drop trigger if exists equipe_club_categorie on interclub.equipe;
drop function if exists interclub.verifier_club_equipe_categorie();

-- 2b. Club obligatoire.
alter table interclub.equipe alter column club_id set not null;

-- 2c. Roster de l'écran juge d'origine.
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
  join interclub.club        cl on cl.id = e.club_id
  left join interclub.temps_vitesse tv
         on tv.epreuve_id = ep.id and tv.grimpeur_id = g.id
  where ep.id = p_epreuve
    and ep.type = 'vitesse'
    and (interclub.est_admin() or interclub.est_juge_de_rencontre(ep.rencontre_id));
$$;

-- 3. Suivi de version.
delete from interclub.version where version = '202610231100_equipes_adultes';

commit;
