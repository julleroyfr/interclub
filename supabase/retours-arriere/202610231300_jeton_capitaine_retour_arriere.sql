-- ===========================================================================
-- RETOUR ARRIÈRE de 202610231300_jeton_capitaine (spec #20 R35)
--
-- À exécuter À LA MAIN dans le SQL Editor (recette), avant les retours
-- arrière des lots antérieurs (ordre inverse d'application).
--
--   1. Supprime les jetons capitaine (et, par cascade, leurs sessions) ;
--      ramène l'auteur « capitaine » des résultats à « coach ».
--   2. Retire policies, fonctions, trigger, index et colonne ajoutés ; restaure
--      les contraintes et, À L'IDENTIQUE, `exiger_session_coach`,
--      `peut_ecrire_resultat`, `proteger_audit_resultat` et `contexte_juge`.
--   3. Retire la ligne de suivi de version.
--
-- Une seule transaction. Ce fichier n'est PAS une migration.
-- ===========================================================================

begin;

-- 1. Données capitaine.
delete from interclub.jeton_qr where nature = 'capitaine';
-- Le trigger d'audit est contourné : on écrit en tant que propriétaire.
alter table interclub.resultat_voie disable trigger resultat_voie_proteger_audit;
alter table interclub.resultat_bloc disable trigger resultat_bloc_proteger_audit;
update interclub.resultat_voie set auteur_role = 'coach' where auteur_role = 'capitaine';
update interclub.resultat_bloc set auteur_role = 'coach' where auteur_role = 'capitaine';
alter table interclub.resultat_voie enable trigger resultat_voie_proteger_audit;
alter table interclub.resultat_bloc enable trigger resultat_bloc_proteger_audit;

-- 2a. Fonctions d'origine (avant de retirer celles qu'elles appellent).
create or replace function interclub.contexte_juge()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rencontre_id',       j.rencontre_id,
    'epreuve_vitesse_id', ev.id,
    'voie_vitesse_id',    j.voie_vitesse_id,
    'couloir_numero',     vv.numero,
    'date_rencontre',     r.date_rencontre,
    'club_porteur_nom',   cp.nom,
    'phase',              r.phase
  )
  from interclub.session_qr s
  join interclub.jeton_qr   j  on j.id = s.jeton_qr_id
  join interclub.rencontre  r  on r.id = j.rencontre_id
  join interclub.club       cp on cp.id = r.club_porteur_id
  left join interclub.epreuve ev
         on ev.rencontre_id = r.id and ev.type = 'vitesse'
  left join interclub.voie_vitesse vv on vv.id = j.voie_vitesse_id
  where s.utilisateur_id = auth.uid()
    and j.actif
    and j.nature = 'juge'
    and r.phase = 'competition'
  order by s.created_at desc
  limit 1;
$$;

create or replace function interclub.proteger_audit_resultat()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Admin ou chemin serveur sans JWT utilisateur : non contraint.
  if auth.uid() is null or interclub.est_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.controle_le  := null;
    new.controle_par := null;
  else
    new.controle_le  := old.controle_le;
    new.controle_par := old.controle_par;
  end if;

  new.auteur_utilisateur_id := auth.uid();
  new.auteur_role           := 'coach';
  return new;
end;
$$;

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

create or replace function interclub.peut_ecrire_resultat(p_epreuve uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.epreuve     ep
    join interclub.equipe      e on e.rencontre_id = ep.rencontre_id
    join interclub.composition c on c.equipe_id = e.id
    where ep.id = p_epreuve
      and c.grimpeur_id = p_grimpeur
      and (
        (interclub.club_courant() = e.club_id
         and interclub.phase_de_rencontre(ep.rencontre_id) = 'competition')
        or interclub.est_coach_temp_de(e.club_id, ep.rencontre_id)
      )
  );
$$;

-- 2b. Policies et fonctions ajoutées.
drop policy if exists "equipe_select_capitaine" on interclub.equipe;
drop policy if exists "composition_select_capitaine" on interclub.composition;
drop policy if exists "grimpeur_select_capitaine" on interclub.grimpeur;
drop function if exists interclub.voit_grimpeur_via_capitaine(uuid);
drop function if exists interclub.est_capitaine_de_equipe(uuid);
drop function if exists interclub.contexte_capitaine();
drop trigger if exists jeton_qr_capitaine on interclub.jeton_qr;
drop function if exists interclub.verifier_jeton_capitaine();

-- 2c. Contraintes d'origine, index et colonne.
alter table interclub.resultat_voie drop constraint if exists resultat_voie_auteur_role_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_auteur_role_check check (auteur_role is null or auteur_role in ('admin', 'coach'));
alter table interclub.resultat_bloc drop constraint if exists resultat_bloc_auteur_role_check;
alter table interclub.resultat_bloc
  add constraint resultat_bloc_auteur_role_check check (auteur_role is null or auteur_role in ('admin', 'coach'));

drop index if exists interclub.uq_jeton_capitaine_actif_par_equipe;
alter table interclub.jeton_qr drop constraint if exists chk_jeton_nature_perimetre;
drop index if exists interclub.idx_jeton_qr_equipe_id;
alter table interclub.jeton_qr drop column if exists equipe_id;
alter table interclub.jeton_qr drop constraint if exists jeton_qr_nature_check;
alter table interclub.jeton_qr
  add constraint jeton_qr_nature_check check (nature in ('coach_temporaire', 'juge'));
alter table interclub.jeton_qr drop constraint if exists chk_jeton_nature_perimetre;
alter table interclub.jeton_qr
  add constraint chk_jeton_nature_perimetre check (
    (nature = 'coach_temporaire' and club_id is not null and voie_vitesse_id is null)
    or (nature = 'juge' and club_id is null and voie_vitesse_id is not null)
  );

-- 3. Suivi de version.
delete from interclub.version where version = '202610231300_jeton_capitaine';

commit;
