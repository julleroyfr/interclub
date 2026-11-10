-- ===========================================================================
-- 202611101500_gardes_en_base
--
-- Objet : la base porte les gardes que seul TypeScript faisait (lot 11 du plan
--         « appels Supabase », constats E1–E5 de l'analyse du 2026-11-10). Les
--         contrôles TypeScript restent en place et gardent leurs messages
--         (décision du 2026-11-10). Ces gardes arrêtent un appel forgé (POST
--         direct à PostgREST) ou une course entre deux clics. Aucune règle
--         métier ne change : toutes existent déjà dans les specs.
--
--   E1  Coche de contrôle (spec #16 R13) : `controle_le` / `controle_par` ne
--       changent qu'en ④ clôture. Trigger `*_verifier_controle` sur
--       `resultat_voie` et `resultat_bloc`. Il passe APRÈS `*_proteger_audit`
--       (ordre alphabétique) : la coche d'un coach y est déjà neutralisée.
--   E2  Saisie admin (spec #9 R5) : la branche `est_admin()` des policies
--       d'écriture des résultats est bornée à ③ compétition et ④ clôture. Une
--       policy plutôt qu'un trigger : les suppressions en cascade (grimpeur,
--       voie, bloc) et les fonctions SECURITY DEFINER (NP de clôture) ne sont
--       pas soumises à la RLS et restent donc possibles.
--   E3  Structure d'une rencontre (spec #3 R51) : épreuves, voies de
--       difficulté, blocs, paliers, voies de vitesse et barème de vitesse ne
--       s'écrivent qu'en ① ou ②. Exception : le repère d'une voie se modifie
--       jusqu'en ③ (spec #3 R49d). La phase est lue par le VRAI parent de la
--       ligne (ancien et nouveau en modification) : une épreuve d'une autre
--       rencontre ne contourne plus la garde. Parent introuvable : suppression
--       en cascade (la ligne parente n'est plus visible), laissée passer.
--       `ordre` (voies, blocs, paliers, et leurs équivalents du gabarit) et
--       `numero` (voie de vitesse) sont calculés (max + 1, sous verrou du
--       parent) quand l'insertion ne les donne pas : plus de lecture préalable
--       ni de doublon entre deux ajouts simultanés.
--   E4  Effectif d'une équipe enfant ou ado plafonné à 8 (spec #5 R15) ;
--       l'équipe adulte reste à 4 (trigger `composition_effectif_adulte`,
--       inchangé). Prêt (spec #1 R35) : club d'accueil différent du club du
--       grimpeur, grimpeur non engagé dans la rencontre (spec #1 R14).
--   E5  Licence générée (spec #3 R21c) : une modification ne peut pas poser une
--       licence de la plage réservée, sauf à conserver celle déjà portée. Seule
--       la modification est gardée : l'insertion d'une licence générée passe
--       par les RPC d'import et d'ajout (SECURITY INVOKER), sous l'identité de
--       l'admin.
--
-- Chemin serveur sans JWT utilisateur (seed, scripts psql, service) : E1, E3,
--       E4 et E5 ne le contraignent pas, comme `proteger_audit_resultat`.
--
-- Erreurs (message = code, SQLSTATE 23514) : `controle_hors_cloture`,
--       `structure_figee`, `effectif_equipe`, `pret_meme_club`,
--       `pret_deja_engage`, `licence_generee_reservee`. E2 : refus RLS (42501).
--
-- Additive (fonctions, triggers ; 6 policies réécrites). Aucune donnée touchée.
-- Réversibilité : supabase/retours-arriere/202611101500_gardes_en_base_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Phase de la rencontre d'une voie ou d'un bloc (E1, E2)
-- ---------------------------------------------------------------------------

create or replace function interclub.phase_de_voie(p_voie uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.phase
  from interclub.voie_difficulte vd
  join interclub.epreuve e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
$$;

create or replace function interclub.phase_de_bloc(p_bloc uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.phase
  from interclub.bloc b
  join interclub.epreuve e on e.id = b.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where b.id = p_bloc;
$$;

revoke execute on function interclub.phase_de_voie(uuid) from public, anon;
revoke execute on function interclub.phase_de_bloc(uuid) from public, anon;
grant execute on function interclub.phase_de_voie(uuid) to authenticated;
grant execute on function interclub.phase_de_bloc(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- E1 — Coche de contrôle en ④ seulement (spec #16 R13)
-- ---------------------------------------------------------------------------

create or replace function interclub.verifier_controle_en_cloture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.controle_le is null and new.controle_par is null then
      return new;
    end if;
  elsif new.controle_le is not distinct from old.controle_le
    and new.controle_par is not distinct from old.controle_par then
    return new;
  end if;

  if tg_table_name = 'resultat_voie' then
    v_phase := interclub.phase_de_voie(new.voie_difficulte_id);
  else
    v_phase := interclub.phase_de_bloc(new.bloc_id);
  end if;
  if v_phase is distinct from 'cloture' then
    raise exception 'controle_hors_cloture'
      using errcode = '23514',
            detail = 'La coche de contrôle ne se modifie qu''en clôture (spec #16 R13).';
  end if;
  return new;
end;
$$;

revoke execute on function interclub.verifier_controle_en_cloture() from public, anon;

drop trigger if exists resultat_voie_verifier_controle on interclub.resultat_voie;
create trigger resultat_voie_verifier_controle
  before insert or update on interclub.resultat_voie
  for each row execute function interclub.verifier_controle_en_cloture();

drop trigger if exists resultat_bloc_verifier_controle on interclub.resultat_bloc;
create trigger resultat_bloc_verifier_controle
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.verifier_controle_en_cloture();

-- ---------------------------------------------------------------------------
-- E2 — Saisie admin en ③ ou ④ seulement (spec #9 R5)
-- ---------------------------------------------------------------------------

drop policy if exists "resultat_voie_insert" on interclub.resultat_voie;
create policy "resultat_voie_insert" on interclub.resultat_voie for insert
  to authenticated
  with check (
    (interclub.est_admin()
     and interclub.phase_de_voie(voie_difficulte_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id)
  );

drop policy if exists "resultat_voie_update" on interclub.resultat_voie;
create policy "resultat_voie_update" on interclub.resultat_voie for update
  to authenticated
  using (
    (interclub.est_admin()
     and interclub.phase_de_voie(voie_difficulte_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id)
  )
  with check (
    (interclub.est_admin()
     and interclub.phase_de_voie(voie_difficulte_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id)
  );

drop policy if exists "resultat_voie_delete" on interclub.resultat_voie;
create policy "resultat_voie_delete" on interclub.resultat_voie for delete
  to authenticated
  using (
    (interclub.est_admin()
     and interclub.phase_de_voie(voie_difficulte_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id)
  );

drop policy if exists "resultat_bloc_insert" on interclub.resultat_bloc;
create policy "resultat_bloc_insert" on interclub.resultat_bloc for insert
  to authenticated
  with check (
    (interclub.est_admin()
     and interclub.phase_de_bloc(bloc_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id)
  );

drop policy if exists "resultat_bloc_update" on interclub.resultat_bloc;
create policy "resultat_bloc_update" on interclub.resultat_bloc for update
  to authenticated
  using (
    (interclub.est_admin()
     and interclub.phase_de_bloc(bloc_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id)
  )
  with check (
    (interclub.est_admin()
     and interclub.phase_de_bloc(bloc_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id)
  );

drop policy if exists "resultat_bloc_delete" on interclub.resultat_bloc;
create policy "resultat_bloc_delete" on interclub.resultat_bloc for delete
  to authenticated
  using (
    (interclub.est_admin()
     and interclub.phase_de_bloc(bloc_id) in ('competition', 'cloture'))
    or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id)
  );

-- ---------------------------------------------------------------------------
-- E3 — Structure modifiable en ① ou ② (spec #3 R51 ; repère : R49d)
-- ---------------------------------------------------------------------------

create or replace function interclub.verifier_structure_modifiable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lignes      jsonb[];
  v_ligne       jsonb;
  v_phase       text;
  v_repere_seul boolean := false;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_lignes := array[to_jsonb(new)];
  elsif tg_op = 'DELETE' then
    v_lignes := array[to_jsonb(old)];
  else
    v_lignes := array[to_jsonb(old), to_jsonb(new)];
    -- Seul le repère change (R49d) : permis jusqu'en ③.
    v_repere_seul := tg_table_name = 'voie_difficulte'
      and (to_jsonb(new) - array['repere', 'updated_at'])
        = (to_jsonb(old) - array['repere', 'updated_at']);
  end if;

  foreach v_ligne in array v_lignes loop
    select r.phase into v_phase
    from interclub.rencontre r
    where r.id = case tg_table_name
      when 'epreuve'      then (v_ligne->>'rencontre_id')::uuid
      when 'voie_vitesse' then (v_ligne->>'rencontre_id')::uuid
      when 'bloc_palier'  then (select e.rencontre_id
                                  from interclub.bloc b
                                  join interclub.epreuve e on e.id = b.epreuve_id
                                 where b.id = (v_ligne->>'bloc_id')::uuid)
      else                     (select e.rencontre_id
                                  from interclub.epreuve e
                                 where e.id = (v_ligne->>'epreuve_id')::uuid)
    end;

    -- Parent introuvable : suppression en cascade, ou clé étrangère qui
    -- refusera l'écriture.
    continue when not found;
    continue when v_phase in ('pre_competition', 'preparation');
    continue when v_repere_seul and v_phase = 'competition';

    raise exception 'structure_figee'
      using errcode = '23514',
            detail = 'La structure d''une rencontre ne se modifie qu''en pré-compétition ou en préparation (spec #3 R51).';
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function interclub.verifier_structure_modifiable() from public, anon;

drop trigger if exists epreuve_structure_modifiable on interclub.epreuve;
create trigger epreuve_structure_modifiable
  before insert or update or delete on interclub.epreuve
  for each row execute function interclub.verifier_structure_modifiable();

drop trigger if exists voie_difficulte_structure_modifiable on interclub.voie_difficulte;
create trigger voie_difficulte_structure_modifiable
  before insert or update or delete on interclub.voie_difficulte
  for each row execute function interclub.verifier_structure_modifiable();

drop trigger if exists bloc_structure_modifiable on interclub.bloc;
create trigger bloc_structure_modifiable
  before insert or update or delete on interclub.bloc
  for each row execute function interclub.verifier_structure_modifiable();

drop trigger if exists bloc_palier_structure_modifiable on interclub.bloc_palier;
create trigger bloc_palier_structure_modifiable
  before insert or update or delete on interclub.bloc_palier
  for each row execute function interclub.verifier_structure_modifiable();

drop trigger if exists voie_vitesse_structure_modifiable on interclub.voie_vitesse;
create trigger voie_vitesse_structure_modifiable
  before insert or update or delete on interclub.voie_vitesse
  for each row execute function interclub.verifier_structure_modifiable();

drop trigger if exists bareme_vitesse_echelon_structure_modifiable on interclub.bareme_vitesse_echelon;
create trigger bareme_vitesse_echelon_structure_modifiable
  before insert or update or delete on interclub.bareme_vitesse_echelon
  for each row execute function interclub.verifier_structure_modifiable();

-- Rang suivant (max + 1) quand l'insertion ne le donne pas. Arguments du
-- trigger : colonne du parent, colonne du rang. Le verrou consultatif du parent
-- sérialise deux ajouts simultanés ; chaque requête de la fonction voit l'ajout
-- validé du premier.
create or replace function interclub.attribuer_rang()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent  text := to_jsonb(new)->>tg_argv[0];
  v_suivant int;
begin
  if to_jsonb(new)->>tg_argv[1] is not null or v_parent is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('interclub.' || tg_table_name || ':' || v_parent, 0));
  execute format('select coalesce(max(%I), 0) + 1 from interclub.%I where %I = $1',
                 tg_argv[1], tg_table_name, tg_argv[0])
     into v_suivant
    using v_parent::uuid;

  new := jsonb_populate_record(new, jsonb_build_object(tg_argv[1], v_suivant));
  return new;
end;
$$;

revoke execute on function interclub.attribuer_rang() from public, anon;

drop trigger if exists voie_difficulte_rang on interclub.voie_difficulte;
create trigger voie_difficulte_rang
  before insert on interclub.voie_difficulte
  for each row execute function interclub.attribuer_rang('epreuve_id', 'ordre');

drop trigger if exists bloc_rang on interclub.bloc;
create trigger bloc_rang
  before insert on interclub.bloc
  for each row execute function interclub.attribuer_rang('epreuve_id', 'ordre');

drop trigger if exists bloc_palier_rang on interclub.bloc_palier;
create trigger bloc_palier_rang
  before insert on interclub.bloc_palier
  for each row execute function interclub.attribuer_rang('bloc_id', 'ordre');

drop trigger if exists voie_vitesse_rang on interclub.voie_vitesse;
create trigger voie_vitesse_rang
  before insert on interclub.voie_vitesse
  for each row execute function interclub.attribuer_rang('rencontre_id', 'numero');

drop trigger if exists gabarit_voie_difficulte_rang on interclub.gabarit_voie_difficulte;
create trigger gabarit_voie_difficulte_rang
  before insert on interclub.gabarit_voie_difficulte
  for each row execute function interclub.attribuer_rang('gabarit_epreuve_id', 'ordre');

drop trigger if exists gabarit_bloc_rang on interclub.gabarit_bloc;
create trigger gabarit_bloc_rang
  before insert on interclub.gabarit_bloc
  for each row execute function interclub.attribuer_rang('gabarit_epreuve_id', 'ordre');

drop trigger if exists gabarit_bloc_palier_rang on interclub.gabarit_bloc_palier;
create trigger gabarit_bloc_palier_rang
  before insert on interclub.gabarit_bloc_palier
  for each row execute function interclub.attribuer_rang('gabarit_bloc_id', 'ordre');

drop trigger if exists gabarit_voie_vitesse_rang on interclub.gabarit_voie_vitesse;
create trigger gabarit_voie_vitesse_rang
  before insert on interclub.gabarit_voie_vitesse
  for each row execute function interclub.attribuer_rang('gabarit_epreuve_id', 'ordre');

-- ---------------------------------------------------------------------------
-- E4 — Effectif enfant/ado (spec #5 R15) et prêts (spec #1 R14, R35)
-- ---------------------------------------------------------------------------

create or replace function interclub.verifier_effectif_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
  v_autres    int;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Verrou de l'équipe : sérialise les ajouts concurrents.
  select r.categorie into v_categorie
    from interclub.equipe e
    join interclub.rencontre r on r.id = e.rencontre_id
   where e.id = new.equipe_id
   for update of e;
  -- Adulte : plafond de 4 porté par `composition_effectif_adulte`.
  if v_categorie is null or v_categorie = 'adulte' then
    return new;
  end if;

  select count(*) into v_autres
    from interclub.composition
   where equipe_id = new.equipe_id
     and grimpeur_id <> new.grimpeur_id;
  if v_autres >= 8 then
    raise exception 'effectif_equipe'
      using errcode = '23514',
            detail = 'Une équipe enfant ou ado compte au plus 8 grimpeurs (spec #5 R15).';
  end if;
  return new;
end;
$$;

revoke execute on function interclub.verifier_effectif_equipe() from public, anon;

drop trigger if exists composition_effectif on interclub.composition;
create trigger composition_effectif
  before insert or update of equipe_id on interclub.composition
  for each row execute function interclub.verifier_effectif_equipe();

create or replace function interclub.verifier_pret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1 from interclub.grimpeur g
    where g.id = new.grimpeur_id and g.club_id = new.club_accueil_id
  ) then
    raise exception 'pret_meme_club'
      using errcode = '23514',
            detail = 'Un grimpeur n''est pas prêté à son propre club (spec #1 R35).';
  end if;

  if (tg_op = 'INSERT'
      or new.rencontre_id is distinct from old.rencontre_id
      or new.grimpeur_id is distinct from old.grimpeur_id)
     and exists (
       select 1 from interclub.composition c
       where c.rencontre_id = new.rencontre_id and c.grimpeur_id = new.grimpeur_id
     ) then
    raise exception 'pret_deja_engage'
      using errcode = '23514',
            detail = 'Un grimpeur déjà engagé dans la rencontre n''est pas disponible au prêt (spec #1 R14).';
  end if;
  return new;
end;
$$;

revoke execute on function interclub.verifier_pret() from public, anon;

drop trigger if exists pret_verifier on interclub.pret;
create trigger pret_verifier
  before insert or update on interclub.pret
  for each row execute function interclub.verifier_pret();

-- ---------------------------------------------------------------------------
-- E5 — Licence générée non posée par une modification (spec #3 R21c)
-- ---------------------------------------------------------------------------

create or replace function interclub.verifier_licence_generee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.licence >= 2000000000 and new.licence is distinct from old.licence then
    raise exception 'licence_generee_reservee'
      using errcode = '23514',
            detail = 'La plage [2 000 000 000, 2 147 483 647] est réservée aux licences générées (spec #3 R21c).';
  end if;
  return new;
end;
$$;

revoke execute on function interclub.verifier_licence_generee() from public, anon;

drop trigger if exists grimpeur_licence_generee on interclub.grimpeur;
create trigger grimpeur_licence_generee
  before update of licence on interclub.grimpeur
  for each row execute function interclub.verifier_licence_generee();

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101500_gardes_en_base',
  'Gardes en base (lot 11, constats E1–E5) : coche de contrôle en ④ (spec #16 R13) ; saisie admin bornée à ③/④ dans les policies resultat_* (spec #9 R5) ; structure en ①/② sauf repère jusqu''en ③ (spec #3 R51, R49d) avec ordre/numéro calculés ; effectif enfant/ado ≤ 8 (spec #5 R15) ; prêt hors club et hors engagés (spec #1 R14, R35) ; licence générée non posée en modification (spec #3 R21c). Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
