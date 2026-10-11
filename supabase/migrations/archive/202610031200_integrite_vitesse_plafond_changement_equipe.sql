-- ===========================================================================
-- 202610031200_integrite_vitesse_plafond_changement_equipe
--
-- Objet : lot 4 du plan d'action de la revue du 2026-10-03 (constats M3, M7 ;
--         décisions D-A, D-B). Révisions de specs validées le 2026-10-03 :
--   1. spec #6 R14  — plafond de 6 voies ADO garanti PAR LA BASE ;
--   2. spec #10 R7bis — seul un grimpeur ENGAGÉ reçoit un résultat de vitesse ;
--   3. spec #10 R18 — le RETRAIT d'un grimpeur supprime son résultat de vitesse ;
--   4. spec #3 R41d / spec #10 R18bis — CHANGEMENT D'ÉQUIPE = mise à jour de
--      `composition.equipe_id` (résultats conservés), limité au club
--      d'affectation et à la même rencontre.
--
-- Les fonctions trigger sont SECURITY DEFINER (search_path vidé) : les contrôles
-- doivent voir TOUTES les lignes, indépendamment de la RLS de l'écrivain, et
-- s'appliquent à tous les écrivains, admin compris. Aucune n'est exécutable
-- directement (revoke from public ; un trigger n'exige pas EXECUTE).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, `drop trigger if exists`, grants rejouables.
-- ===========================================================================

-- ===========================================================================
-- 1. Plafond de 6 voies ado (spec #6 R14)
-- ===========================================================================
-- Refuse l'INSERTION d'un résultat de voie qui porterait à plus de 6 le nombre
-- de voies du grimpeur sur l'épreuve de voie d'une rencontre ado. Le trigger
-- BEFORE INSERT se déclenche AVANT la détection de conflit d'un upsert : une
-- CORRECTION (R13, même voie déjà saisie) est donc exclue du comptage.
-- Les insertions concurrentes pour un même grimpeur et une même épreuve sont
-- sérialisées par un verrou consultatif de transaction.

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

comment on function interclub.verifier_plafond_voies_ado() is
  'Trigger BEFORE INSERT (resultat_voie) : refuse une 7e voie par grimpeur et épreuve ado (spec #6 R14) ; correction de la même voie exclue du comptage ; insertions sérialisées par grimpeur et épreuve.';

drop trigger if exists resultat_voie_plafond_ado on interclub.resultat_voie;
create trigger resultat_voie_plafond_ado
  before insert on interclub.resultat_voie
  for each row execute function interclub.verifier_plafond_voies_ado();

-- ===========================================================================
-- 2. Résultat de vitesse réservé aux grimpeurs engagés (spec #10 R7bis)
-- ===========================================================================

create or replace function interclub.verifier_grimpeur_engage_vitesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from interclub.epreuve e
      join interclub.composition c on c.rencontre_id = e.rencontre_id
     where e.id = new.epreuve_id
       and c.grimpeur_id = new.grimpeur_id
  ) then
    raise exception 'grimpeur_non_engage'
      using errcode = '23514',
            detail = 'Seul un grimpeur engagé dans la rencontre reçoit un résultat de vitesse (spec #10 R7bis).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_grimpeur_engage_vitesse() is
  'Trigger BEFORE INSERT/UPDATE (temps_vitesse) : le grimpeur doit être composé dans la rencontre de l''épreuve (spec #10 R7bis).';

drop trigger if exists temps_vitesse_grimpeur_engage on interclub.temps_vitesse;
create trigger temps_vitesse_grimpeur_engage
  before insert or update of epreuve_id, grimpeur_id on interclub.temps_vitesse
  for each row execute function interclub.verifier_grimpeur_engage_vitesse();

-- ===========================================================================
-- 3. Purge du résultat de vitesse au retrait (spec #10 R18)
-- ===========================================================================
-- La suppression d'une composition (retrait, suppression d'équipe ou de
-- rencontre en cascade) supprime le temps_vitesse du grimpeur sur l'épreuve de
-- vitesse de la rencontre. Le trigger existant sur temps_vitesse recalcule
-- alors points_vitesse (spec #7 R20). Un CHANGEMENT D'ÉQUIPE est une mise à
-- jour (§4) : aucune suppression, donc aucune purge (spec #10 R18bis).

create or replace function interclub.purger_vitesse_au_retrait()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from interclub.temps_vitesse tv
   using interclub.epreuve e
   where e.id = tv.epreuve_id
     and e.rencontre_id = old.rencontre_id
     and e.type = 'vitesse'
     and tv.grimpeur_id = old.grimpeur_id;
  return old;
end;
$$;

comment on function interclub.purger_vitesse_au_retrait() is
  'Trigger AFTER DELETE (composition) : supprime le résultat de vitesse du grimpeur retiré pour la rencontre (spec #10 R18).';

drop trigger if exists composition_purger_vitesse on interclub.composition;
create trigger composition_purger_vitesse
  after delete on interclub.composition
  for each row execute function interclub.purger_vitesse_au_retrait();

-- Mise en cohérence des données existantes avec R7bis/R18 : temps de vitesse
-- de grimpeurs qui ne sont plus engagés (retraits antérieurs à cette migration).
delete from interclub.temps_vitesse tv
 using interclub.epreuve e
 where e.id = tv.epreuve_id
   and not exists (
     select 1 from interclub.composition c
      where c.rencontre_id = e.rencontre_id
        and c.grimpeur_id = tv.grimpeur_id
   );

-- ===========================================================================
-- 4. Changement d'équipe (spec #3 R41d, spec #10 R18bis)
-- ===========================================================================
-- Mise à jour de `composition.equipe_id` : même rencontre ET même club
-- (club d'affectation : club de l'équipe actuelle — club d'accueil d'un prêté).
-- La policy `composition_update` (admin ; coach dans son périmètre) s'applique
-- déjà ; seul le droit de colonne manquait.

create or replace function interclub.verifier_changement_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancienne interclub.equipe%rowtype;
  v_nouvelle interclub.equipe%rowtype;
begin
  if new.equipe_id = old.equipe_id then
    return new;
  end if;
  select * into v_ancienne from interclub.equipe where id = old.equipe_id;
  select * into v_nouvelle from interclub.equipe where id = new.equipe_id;
  if v_nouvelle.id is null
     or v_nouvelle.rencontre_id <> v_ancienne.rencontre_id
     or v_nouvelle.club_id <> v_ancienne.club_id then
    raise exception 'changement_equipe_hors_club'
      using errcode = '23514',
            detail = 'Changement d''équipe limité au club d''affectation, dans la même rencontre (spec #3 R41d).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_changement_equipe() is
  'Trigger BEFORE UPDATE OF equipe_id (composition) : nouvelle équipe de la même rencontre et du même club que l''actuelle (spec #3 R41d).';

drop trigger if exists composition_changement_equipe on interclub.composition;
create trigger composition_changement_equipe
  before update of equipe_id on interclub.composition
  for each row execute function interclub.verifier_changement_equipe();

grant update (equipe_id) on interclub.composition to authenticated;

-- ===========================================================================
-- 5. Fonctions trigger fermées (cf. 202610031100 : rien d'ouvert à PUBLIC)
-- ===========================================================================

revoke execute on function interclub.verifier_plafond_voies_ado()       from public;
revoke execute on function interclub.verifier_grimpeur_engage_vitesse() from public;
revoke execute on function interclub.purger_vitesse_au_retrait()        from public;
revoke execute on function interclub.verifier_changement_equipe()       from public;

-- ===========================================================================
-- 6. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610031200_integrite_vitesse_plafond_changement_equipe',
  'Lot 4 revue 2026-10-03 : trigger plafond 6 voies ado (spec #6 R14) ; résultat de vitesse réservé aux grimpeurs engagés (spec #10 R7bis) ; purge du résultat de vitesse au retrait (spec #10 R18) + nettoyage des temps orphelins ; changement d''équipe par mise à jour de composition.equipe_id limité au club d''affectation (spec #3 R41d, spec #10 R18bis), grant update(equipe_id).',
  'julleroyfr'
)
on conflict (version) do nothing;
