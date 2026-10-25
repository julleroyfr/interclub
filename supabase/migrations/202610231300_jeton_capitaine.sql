-- ===========================================================================
-- 202610231300_jeton_capitaine
--
-- Objet : catégorie adulte (spec #20, validée le 2026-10-23), lot 5 — jeton QR
--         capitaine d'une équipe adulte (R16–R21, R20bis).
--   1. `jeton_qr` : nature `capitaine`, colonne `equipe_id` ; périmètre :
--      capitaine ⇒ une équipe, sans club ni voie (R16) ; un seul jeton
--      capitaine actif par équipe (R16) ; l'équipe appartient à la rencontre du
--      jeton, de catégorie adulte (R20, trigger).
--   2. Fonctions `contexte_capitaine()` (garde de l'écran /capitaine) et
--      `est_capitaine_de_equipe(equipe)` : session capitaine active, jeton
--      actif, rencontre en ③ (R17).
--   3. Écriture : `exiger_session_coach` accepte la session capitaine ;
--      `peut_ecrire_resultat` autorise le capitaine de l'équipe du grimpeur
--      (voies et blocs ; la vitesse reste aux juges) (R18, R21).
--   4. Lecture : policies additionnelles sur equipe, composition, grimpeur pour
--      le capitaine de l'équipe (R19).
--   5. Auteur : rôle `capitaine` (contraintes + trigger d'audit, R20bis).
--   6. `contexte_juge` renvoie aussi le libellé de la voie (`couloir_libelle`)
--      pour l'écran juge (R9bis).
--   `ouvrir_session_qr` n'a pas à changer : toute nature autre que coach
--   temporaire n'ouvre de session qu'en ③ (R17).
--
-- Réversibilité (R34/R35) : additive. Retour arrière :
-- supabase/retours-arriere/202610231300_jeton_capitaine_retour_arriere.sql.
-- Prérequis : 202610231100_equipes_adultes. Idempotent. Application MANUELLE.
-- ===========================================================================

-- 1. Jeton capitaine (R16, R20).
alter table interclub.jeton_qr
  add column if not exists equipe_id uuid references interclub.equipe (id) on delete cascade;
create index if not exists idx_jeton_qr_equipe_id on interclub.jeton_qr (equipe_id);

alter table interclub.jeton_qr drop constraint if exists jeton_qr_nature_check;
alter table interclub.jeton_qr
  add constraint jeton_qr_nature_check check (nature in ('coach_temporaire', 'juge', 'capitaine'));
alter table interclub.jeton_qr drop constraint if exists chk_jeton_nature_perimetre;
alter table interclub.jeton_qr
  add constraint chk_jeton_nature_perimetre check (
    (nature = 'coach_temporaire' and club_id is not null and voie_vitesse_id is null and equipe_id is null)
    or (nature = 'juge' and club_id is null and voie_vitesse_id is not null and equipe_id is null)
    or (nature = 'capitaine' and club_id is null and voie_vitesse_id is null and equipe_id is not null)
  );

create unique index if not exists uq_jeton_capitaine_actif_par_equipe
  on interclub.jeton_qr (equipe_id)
  where nature = 'capitaine' and actif;

create or replace function interclub.verifier_jeton_capitaine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.nature <> 'capitaine' then
    return new;
  end if;
  if not exists (
    select 1
      from interclub.equipe e
      join interclub.rencontre r on r.id = e.rencontre_id
     where e.id = new.equipe_id
       and e.rencontre_id = new.rencontre_id
       and r.categorie = 'adulte'
  ) then
    raise exception 'jeton_capitaine_hors_adulte'
      using errcode = '23514',
            detail = 'Un jeton capitaine désigne une équipe de sa rencontre, de catégorie adulte (spec #20 R20).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_jeton_capitaine() is
  'Trigger BEFORE INSERT/UPDATE (jeton_qr) : un jeton capitaine désigne une équipe de sa rencontre adulte (spec #20 R20).';

drop trigger if exists jeton_qr_capitaine on interclub.jeton_qr;
create trigger jeton_qr_capitaine
  before insert or update of nature, equipe_id, rencontre_id on interclub.jeton_qr
  for each row execute function interclub.verifier_jeton_capitaine();

-- 2. Contexte et périmètre de la session capitaine (R17).
create or replace function interclub.contexte_capitaine()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'equipe_id',    j.equipe_id,
    'rencontre_id', j.rencontre_id,
    'phase',        r.phase
  )
  from interclub.session_qr s
  join interclub.jeton_qr   j on j.id = s.jeton_qr_id
  join interclub.rencontre  r on r.id = j.rencontre_id
  where s.utilisateur_id = auth.uid()
    and j.actif
    and j.nature = 'capitaine'
    and r.phase = 'competition'
  order by s.created_at desc
  limit 1;
$$;

comment on function interclub.contexte_capitaine() is
  'Équipe et rencontre de la session capitaine active de l''utilisateur courant, rencontre en ③ (spec #20 R17) ; NULL sinon (fail-closed).';

create or replace function interclub.est_capitaine_de_equipe(p_equipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.session_qr s
    join interclub.jeton_qr  j on j.id = s.jeton_qr_id
    join interclub.rencontre r on r.id = j.rencontre_id
    where s.utilisateur_id = auth.uid()
      and j.actif
      and j.nature = 'capitaine'
      and j.equipe_id = p_equipe
      and r.phase = 'competition'
  );
$$;

comment on function interclub.est_capitaine_de_equipe(uuid) is
  'Vrai si l''utilisateur courant a une session capitaine active sur cette équipe, rencontre en ③ (spec #20 R17/R18).';

-- Grimpeur visible du capitaine : membre de son équipe (R19).
create or replace function interclub.voit_grimpeur_via_capitaine(p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.composition c
     where c.grimpeur_id = p_grimpeur
       and interclub.est_capitaine_de_equipe(c.equipe_id)
  );
$$;

revoke execute on function interclub.contexte_capitaine()                from public;
revoke execute on function interclub.est_capitaine_de_equipe(uuid)       from public;
revoke execute on function interclub.voit_grimpeur_via_capitaine(uuid)   from public;
revoke execute on function interclub.verifier_jeton_capitaine()          from public;
grant execute on function interclub.contexte_capitaine()                 to authenticated;
grant execute on function interclub.est_capitaine_de_equipe(uuid)        to authenticated;
grant execute on function interclub.voit_grimpeur_via_capitaine(uuid)    to authenticated;

-- 3. Écriture des voies et blocs par le capitaine de l'équipe (R18, R21).
create or replace function interclub.exiger_session_coach()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Coach permanent (compte rattaché à un club), session QR coach active, ou
  -- session capitaine active (spec #20 R18).
  if interclub.club_courant() is null
     and interclub.contexte_coach_temporaire() is null
     and interclub.contexte_capitaine() is null then
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
        -- Capitaine de l'équipe du grimpeur, en ③ (spec #20 R18).
        or interclub.est_capitaine_de_equipe(c.equipe_id)
      )
  );
$$;

-- 4. Lecture de son équipe par le capitaine (R19) — policies additionnelles.
drop policy if exists "equipe_select_capitaine" on interclub.equipe;
create policy "equipe_select_capitaine" on interclub.equipe for select
  to authenticated
  using (interclub.est_capitaine_de_equipe(id));

drop policy if exists "composition_select_capitaine" on interclub.composition;
create policy "composition_select_capitaine" on interclub.composition for select
  to authenticated
  using (interclub.est_capitaine_de_equipe(equipe_id));

drop policy if exists "grimpeur_select_capitaine" on interclub.grimpeur;
create policy "grimpeur_select_capitaine" on interclub.grimpeur for select
  to authenticated
  using (interclub.voit_grimpeur_via_capitaine(id));

-- 5. Auteur « capitaine » (R20bis).
alter table interclub.resultat_voie drop constraint if exists resultat_voie_auteur_role_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_auteur_role_check check (auteur_role is null or auteur_role in ('admin', 'coach', 'capitaine'));
alter table interclub.resultat_bloc drop constraint if exists resultat_bloc_auteur_role_check;
alter table interclub.resultat_bloc
  add constraint resultat_bloc_auteur_role_check check (auteur_role is null or auteur_role in ('admin', 'coach', 'capitaine'));

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
  -- Session capitaine (spec #20 R20bis) ; sinon coach (permanent ou temporaire).
  new.auteur_role           := case when interclub.contexte_capitaine() is not null
                                    then 'capitaine' else 'coach' end;
  return new;
end;
$$;

-- 6. Libellé de la voie sur l'écran juge (R9bis).
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
    'couloir_libelle',    vv.libelle,
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

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610231300_jeton_capitaine',
  'Catégorie adulte, lot 5 (spec #20 R16–R21, R20bis) : jeton QR capitaine (nature, equipe_id, périmètre, unicité, trigger adulte) ; contexte_capitaine, est_capitaine_de_equipe, voit_grimpeur_via_capitaine ; exiger_session_coach et peut_ecrire_resultat ouverts au capitaine de l''équipe ; policies de lecture equipe/composition/grimpeur ; auteur capitaine ; contexte_juge renvoie le libellé de la voie. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
