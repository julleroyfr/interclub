-- ===========================================================================
-- 202610031100_durcissement_securite
--
-- Objet : DURCISSEMENT SÉCURITÉ en base — lot 1 du plan d'action de la revue
--         du 2026-10-03 (docs/revues/2026-10-03-plan-action.md), constats C1,
--         M1, M2 + fermeture par défaut des fonctions. Aucune spec ne change :
--         on impose en base ce que les specs exigent déjà.
--
-- Cause : le schéma `interclub` est créé par `postgres`, sans privilèges par
--         défaut : Postgres accorde EXECUTE à PUBLIC sur toute fonction créée.
--         Aucune migration ne faisait de `revoke` ⇒ TOUTES les fonctions du
--         schéma étaient exécutables par `anon` (clé publique du bundle JS),
--         y compris les fonctions SECURITY DEFINER qui contournent la RLS.
--
-- 1. Fermeture par défaut :
--      - `revoke execute … from public` sur toutes les fonctions existantes ;
--      - privilèges par défaut de `postgres` : plus d'EXECUTE à PUBLIC sur les
--        futures fonctions (chaque migration accorde explicitement).
--        ⚠️ Un `alter default privileges … in schema` ne peut qu'AJOUTER aux
--        privilèges globaux : la révocation doit donc être globale (sans
--        `in schema`) pour être effective.
--    Ré-octroi explicite à `authenticated` des fonctions qui n'avaient QUE
--    PUBLIC et dont on a besoin (helpers de policies RLS + RPC appelée par
--    l'app). Les grants explicites existants (anon/authenticated/service_role)
--    sont conservés tels quels. Les fonctions TRIGGER n'ont besoin d'aucun
--    EXECUTE pour se déclencher : elles restent fermées.
--
-- 2. C1 — `creer_rencontre_avec_gabarit` (SECURITY DEFINER) : garde
--    `est_admin()` en tête (spec #3 R12, CRUD rencontre réservé à l'admin).
--    Corps identique à 202609221500 par ailleurs ; signature inchangée.
--
-- 3. M1 — `finaliser_inscription_coach` (SECURITY DEFINER) : réservée à
--    `service_role` (spec #2 R30–R33, ADR 0002) — n'est plus exécutable par
--    anon/authenticated (§1) ; `search_path` vidé (noms déjà qualifiés).
--
-- 4. M2 — colonnes d'AUDIT et de CONTRÔLE protégées par trigger BEFORE
--    INSERT/UPDATE pour tout écrivain NON admin authentifié :
--      - `resultat_voie` / `resultat_bloc` : `controle_le`/`controle_par`
--        inchangés (NULL à l'insertion) — seul l'admin coche (spec #16
--        R11/R13) ; `auteur_utilisateur_id` = auth.uid(), `auteur_role` =
--        'coach' (spec #9 R14 : auteur réel de la dernière écriture) ;
--      - `temps_vitesse` : `auteur_*` = auth.uid() / 'juge' (spec #10).
--    L'admin et les chemins serveur sans JWT utilisateur (service_role,
--    postgres : auth.uid() NULL) ne sont pas contraints : comportement
--    inchangé pour la saisie admin, la coche (R14 : coche conservée si le
--    résultat est corrigé) et le NP automatique de clôture.
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, `drop trigger if exists`, grants/revokes
--         rejouables.
-- ===========================================================================

-- ===========================================================================
-- 1. Fermeture par défaut des fonctions
-- ===========================================================================

revoke execute on all functions in schema interclub from public;

alter default privileges for role postgres
  revoke execute on functions from public;

-- Fonctions qui ne reposaient QUE sur PUBLIC et dont `authenticated` a besoin.
-- Helpers utilisés par des policies RLS (évaluées avec les droits de l'appelant).
grant execute on function interclub.voit_grimpeur_via_engagement(uuid)  to authenticated;
grant execute on function interclub.voit_grimpeur_via_pret(uuid)        to authenticated;
grant execute on function interclub.peut_gerer_composition_equipe(uuid) to authenticated;
grant execute on function interclub.peut_engager_prete(uuid, uuid)      to authenticated;
-- RPC de création de rencontre (gardée admin ci-dessous, §2).
grant execute on function interclub.creer_rencontre_avec_gabarit(date, uuid, text) to authenticated;

-- ===========================================================================
-- 2. C1 — creer_rencontre_avec_gabarit : garde admin (spec #3 R12)
-- ===========================================================================

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

-- ===========================================================================
-- 3. M1 — finaliser_inscription_coach : service_role seul, search_path vidé
-- ===========================================================================

create or replace function interclub.finaliser_inscription_coach(
  p_valeur uuid,
  p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation interclub.invitation_coach%rowtype;
begin
  select * into v_invitation
    from interclub.invitation_coach
   where valeur = p_valeur;

  if not found then
    raise exception 'invitation_inconnue' using errcode = 'P0001';
  end if;

  -- R30 : invitation révoquée → aucune inscription.
  if not v_invitation.actif then
    raise exception 'invitation_revoquee' using errcode = 'P0002';
  end if;

  -- R31 : mapping coach permanent rattaché au club de l'invitation.
  insert into interclub.compte (utilisateur_id, role, club_id)
  values (p_utilisateur_id, 'coach', v_invitation.club_id);

  return v_invitation.club_id;
end;
$$;

-- Défense en profondeur : retrait explicite, au cas où un grant aurait été
-- posé à la main sur un environnement (le §1 couvre déjà PUBLIC).
revoke execute on function interclub.finaliser_inscription_coach(uuid, uuid)
  from anon, authenticated;
grant execute on function interclub.finaliser_inscription_coach(uuid, uuid)
  to service_role;

-- ===========================================================================
-- 4. M2 — protection des colonnes d'audit et de contrôle
-- ===========================================================================

-- Résultats de voie / bloc : coche réservée à l'admin (spec #16 R11/R13),
-- auteur = écrivain réel (spec #9 R14).
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

comment on function interclub.proteger_audit_resultat() is
  'Trigger BEFORE INSERT/UPDATE (resultat_voie/resultat_bloc) : pour un écrivain non admin, coche de contrôle inchangée (spec #16 R11/R13) et auteur forcé à auth.uid()/coach (spec #9 R14).';

drop trigger if exists resultat_voie_proteger_audit on interclub.resultat_voie;
create trigger resultat_voie_proteger_audit
  before insert or update on interclub.resultat_voie
  for each row execute function interclub.proteger_audit_resultat();

drop trigger if exists resultat_bloc_proteger_audit on interclub.resultat_bloc;
create trigger resultat_bloc_proteger_audit
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.proteger_audit_resultat();

-- Temps de vitesse : auteur = juge réel (spec #10, colonnes auteur juge|admin).
create or replace function interclub.proteger_audit_temps_vitesse()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or interclub.est_admin() then
    return new;
  end if;

  new.auteur_utilisateur_id := auth.uid();
  new.auteur_role           := 'juge';
  return new;
end;
$$;

comment on function interclub.proteger_audit_temps_vitesse() is
  'Trigger BEFORE INSERT/UPDATE (temps_vitesse) : pour un écrivain non admin, auteur forcé à auth.uid()/juge (spec #10).';

drop trigger if exists temps_vitesse_proteger_audit on interclub.temps_vitesse;
create trigger temps_vitesse_proteger_audit
  before insert or update on interclub.temps_vitesse
  for each row execute function interclub.proteger_audit_temps_vitesse();

-- Les deux fonctions trigger ci-dessus sont créées APRÈS le §1 : la
-- révocation par défaut (privilèges par défaut de `postgres`) les couvre déjà
-- quand la migration est jouée par `postgres` ; on la rend explicite pour
-- rester correct quel que soit le rôle qui applique la migration.
revoke execute on function interclub.proteger_audit_resultat()      from public;
revoke execute on function interclub.proteger_audit_temps_vitesse() from public;

-- ===========================================================================
-- 5. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610031100_durcissement_securite',
  'Durcissement sécurité (revue 2026-10-03, lot 1) : revoke EXECUTE from public sur toutes les fonctions interclub + privilèges par défaut fermés + ré-octroi explicite ; garde est_admin() dans creer_rencontre_avec_gabarit (C1) ; finaliser_inscription_coach réservée à service_role, search_path vidé (M1) ; triggers de protection des colonnes de contrôle/auteur sur resultat_voie/resultat_bloc/temps_vitesse (M2).',
  'julleroyfr'
)
on conflict (version) do nothing;
