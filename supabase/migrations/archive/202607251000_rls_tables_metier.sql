-- Migration : 202607251000_rls_tables_metier
-- Description : policies RLS des 9 tables métier (T6), implémentant la matrice
--               rôles × actions de la spec #1 et les deux chemins d'acteur de
--               l'ADR 0001 :
--                 - permanent  : auth.uid() → interclub.compte (admin / coach) ;
--                 - éphémère   : auth.uid() → session_qr → jeton_qr → rencontre
--                                (coach temporaire / juge), recalculé À CHAQUE
--                                requête contre jeton_qr.actif ET rencontre.phase
--                                = 'competition' (coupure immédiate R13/R22/R23).
--               Le périmètre et le gating de phase sont encapsulés dans des
--               fonctions SECURITY DEFINER (bypass RLS, pas de récursion), de
--               sorte que les policies restent déclaratives et lisibles.
-- Décisions   : précisions spec #1 du 2026-07-25 —
--                 - juge : périmètre d'écriture = épreuve de vitesse de sa
--                   rencontre (le couloir `voie_vitesse` reste organisationnel) ;
--                 - grimpeur : roster de club éditable hors phase ; le gating de
--                   phase ① ne porte que sur equipe/composition (engagement).
-- Sources : docs/specs/01-roles-et-autorisations.md (R5–R36, matrice),
--           docs/decisions/0001-authentification-sessions-ephemeres-qr.md (§3).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ===========================================================================
-- 1. Fonctions de périmètre (SECURITY DEFINER, stable, search_path vidé).
--    Elles lisent les tables interclub en CONTOURNANT la RLS : les policies ne
--    déclenchent donc jamais la RLS d'une autre table (ni récursion ni ligne
--    masquée). Réutilisent est_admin()/club_courant() (migrations T5a/T5c).
-- ===========================================================================

-- Phase courante d'une rencontre (NULL si inconnue).
create or replace function interclub.phase_de_rencontre(p_rencontre uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select phase from interclub.rencontre where id = p_rencontre;
$$;

-- Vrai s'il existe une session QR éphémère ACTIVE de nature `coach_temporaire`
-- pour ce club, dont la rencontre est en phase ② (coupure immédiate recalculée).
create or replace function interclub.est_coach_temp_de_club(p_club uuid)
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
      and r.phase = 'competition'
      and j.nature = 'coach_temporaire'
      and j.club_id = p_club
  );
$$;

-- Idem, borné à une rencontre précise (engagement/saisie dans CETTE rencontre).
create or replace function interclub.est_coach_temp_de(p_club uuid, p_rencontre uuid)
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
      and r.phase = 'competition'
      and j.nature = 'coach_temporaire'
      and j.club_id = p_club
      and r.id = p_rencontre
  );
$$;

-- Vrai s'il existe une session QR éphémère ACTIVE de nature `juge` pour cette
-- rencontre en phase ② (le juge est affecté à un couloir de cette rencontre).
create or replace function interclub.est_juge_de_rencontre(p_rencontre uuid)
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
      and r.phase = 'competition'
      and j.nature = 'juge'
      and r.id = p_rencontre
  );
$$;

-- Coach (permanent OU temporaire) de ce club — pour le roster et les lectures de
-- périmètre (sans gating de phase : cf. précision R6 du 2026-07-25).
create or replace function interclub.est_coach_de_club(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select interclub.club_courant() = p_club
      or interclub.est_coach_temp_de_club(p_club);
$$;

-- Droit d'ÉCRITURE sur l'engagement en rencontre (equipe) — hors admin :
--   - coach permanent de ce club EN PHASE ① (pré-saisie, R6/R25) ;
--   - coach temporaire de ce club (phase ② garantie par le helper, R27).
create or replace function interclub.peut_ecrire_equipe(p_club uuid, p_rencontre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (interclub.club_courant() = p_club
          and interclub.phase_de_rencontre(p_rencontre) = 'pre_competition')
      or interclub.est_coach_temp_de(p_club, p_rencontre);
$$;

-- Droit d'ÉCRITURE d'une composition (lien équipe ↔ grimpeur) — hors admin :
--   droit d'écrire l'équipe ET grimpeur du MÊME club que l'équipe. Le prêt d'un
--   grimpeur d'un autre club (grimpeur.club_id ≠ equipe.club_id) reste réservé à
--   l'admin (R35) ; une fois rattaché, la saisie de ses résultats suit le coach
--   de l'équipe d'accueil (R36, via peut_ecrire_resultat/voit_resultat).
create or replace function interclub.peut_ecrire_composition(p_equipe uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.equipe   e
    join interclub.grimpeur g on g.id = p_grimpeur
    where e.id = p_equipe
      and g.club_id = e.club_id
      and interclub.peut_ecrire_equipe(e.club_id, e.rencontre_id)
  );
$$;

-- LECTURE d'une composition — coach (perm/temp) du club de l'équipe.
create or replace function interclub.voit_composition(p_equipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.equipe e
    where e.id = p_equipe
      and interclub.est_coach_de_club(e.club_id)
  );
$$;

-- Droit d'ÉCRITURE d'un résultat voie/bloc pour un grimpeur sur une épreuve —
-- hors admin : le grimpeur est composé dans une équipe de MON club pour la
-- rencontre de l'épreuve, EN PHASE ② (R7/R19) ; couvre le grimpeur prêté (R36 :
-- via composition, pas via grimpeur.club_id).
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

-- LECTURE d'un résultat — coach (perm/temp) dont le club aligne le grimpeur dans
-- cette rencontre (toute phase, périmètre propre). La lecture publique cross-club
-- en phase ③ (R8/R21) relève du modèle « infos publiques » (spec dédiée).
create or replace function interclub.voit_resultat(p_epreuve uuid, p_grimpeur uuid)
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
      and interclub.est_coach_de_club(e.club_id)
  );
$$;

-- Droit d'ÉCRITURE d'un temps de vitesse — hors admin : juge affecté à la
-- rencontre de l'épreuve, ET l'épreuve est bien de type `vitesse` (R30, précision
-- 2026-07-25 : périmètre = l'épreuve de vitesse de la rencontre).
create or replace function interclub.peut_ecrire_temps_vitesse(p_epreuve uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.epreuve ep
    where ep.id = p_epreuve
      and ep.type = 'vitesse'
      and interclub.est_juge_de_rencontre(ep.rencontre_id)
  );
$$;

-- ===========================================================================
-- 2. Grants — sans privilège de table, une policy reste inopérante. La RLS est
--    la vraie frontière. `service_role` conserve ses accès (écrans admin).
-- ===========================================================================
grant select, insert, update, delete on interclub.club          to authenticated;
grant select, insert, update, delete on interclub.rencontre     to authenticated;
grant select, insert, update, delete on interclub.grimpeur      to authenticated;
grant select, insert, update, delete on interclub.equipe        to authenticated;
grant select, insert,         delete on interclub.composition   to authenticated;
grant select, insert, update, delete on interclub.epreuve       to authenticated;
grant select, insert, update, delete on interclub.voie_vitesse  to authenticated;
grant select, insert, update, delete on interclub.resultat      to authenticated;
grant select, insert, update, delete on interclub.temps_vitesse to authenticated;

grant execute on function interclub.phase_de_rencontre(uuid)          to authenticated;
grant execute on function interclub.est_coach_temp_de_club(uuid)      to authenticated;
grant execute on function interclub.est_coach_temp_de(uuid, uuid)     to authenticated;
grant execute on function interclub.est_juge_de_rencontre(uuid)       to authenticated;
grant execute on function interclub.est_coach_de_club(uuid)           to authenticated;
grant execute on function interclub.peut_ecrire_equipe(uuid, uuid)    to authenticated;
grant execute on function interclub.peut_ecrire_composition(uuid, uuid) to authenticated;
grant execute on function interclub.voit_composition(uuid)            to authenticated;
grant execute on function interclub.peut_ecrire_resultat(uuid, uuid)  to authenticated;
grant execute on function interclub.voit_resultat(uuid, uuid)         to authenticated;
grant execute on function interclub.peut_ecrire_temps_vitesse(uuid)   to authenticated;

-- ===========================================================================
-- 3. Policies — une par opération. Rejouable : drop avant recreate. RLS déjà
--    activée par les migrations socle/voie/auth (fail-closed).
-- ===========================================================================

-- --- club : lecture = référence publique ; CRUD réservé à l'admin (R11). ------
drop policy if exists "club_select" on interclub.club;
create policy "club_select" on interclub.club for select
  to authenticated using (true);

drop policy if exists "club_insert_admin" on interclub.club;
create policy "club_insert_admin" on interclub.club for insert
  to authenticated with check (interclub.est_admin());

drop policy if exists "club_update_admin" on interclub.club;
create policy "club_update_admin" on interclub.club for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

drop policy if exists "club_delete_admin" on interclub.club;
create policy "club_delete_admin" on interclub.club for delete
  to authenticated using (interclub.est_admin());

-- --- rencontre : lecture = calendrier public (R21) ; CRUD admin (R12). --------
drop policy if exists "rencontre_select" on interclub.rencontre;
create policy "rencontre_select" on interclub.rencontre for select
  to authenticated using (true);

drop policy if exists "rencontre_insert_admin" on interclub.rencontre;
create policy "rencontre_insert_admin" on interclub.rencontre for insert
  to authenticated with check (interclub.est_admin());

drop policy if exists "rencontre_update_admin" on interclub.rencontre;
create policy "rencontre_update_admin" on interclub.rencontre for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

drop policy if exists "rencontre_delete_admin" on interclub.rencontre;
create policy "rencontre_delete_admin" on interclub.rencontre for delete
  to authenticated using (interclub.est_admin());

-- --- epreuve : lecture = infos rencontre ; CRUD admin (paramétrage, R13). -----
drop policy if exists "epreuve_select" on interclub.epreuve;
create policy "epreuve_select" on interclub.epreuve for select
  to authenticated using (true);

drop policy if exists "epreuve_insert_admin" on interclub.epreuve;
create policy "epreuve_insert_admin" on interclub.epreuve for insert
  to authenticated with check (interclub.est_admin());

drop policy if exists "epreuve_update_admin" on interclub.epreuve;
create policy "epreuve_update_admin" on interclub.epreuve for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

drop policy if exists "epreuve_delete_admin" on interclub.epreuve;
create policy "epreuve_delete_admin" on interclub.epreuve for delete
  to authenticated using (interclub.est_admin());

-- --- voie_vitesse : lecture = infos rencontre ; CRUD admin (R13, R15). --------
drop policy if exists "voie_vitesse_select" on interclub.voie_vitesse;
create policy "voie_vitesse_select" on interclub.voie_vitesse for select
  to authenticated using (true);

drop policy if exists "voie_vitesse_insert_admin" on interclub.voie_vitesse;
create policy "voie_vitesse_insert_admin" on interclub.voie_vitesse for insert
  to authenticated with check (interclub.est_admin());

drop policy if exists "voie_vitesse_update_admin" on interclub.voie_vitesse;
create policy "voie_vitesse_update_admin" on interclub.voie_vitesse for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

drop policy if exists "voie_vitesse_delete_admin" on interclub.voie_vitesse;
create policy "voie_vitesse_delete_admin" on interclub.voie_vitesse for delete
  to authenticated using (interclub.est_admin());

-- --- grimpeur : roster de club, admin OU coach (perm/temp) de ce club ; -------
--     éditable hors phase (précision R6) ; création limitée à SON club (R18) ;
--     le prêt cross-club se joue en composition, pas ici (R35).
drop policy if exists "grimpeur_select" on interclub.grimpeur;
create policy "grimpeur_select" on interclub.grimpeur for select
  to authenticated
  using (interclub.est_admin() or interclub.est_coach_de_club(club_id));

drop policy if exists "grimpeur_insert" on interclub.grimpeur;
create policy "grimpeur_insert" on interclub.grimpeur for insert
  to authenticated
  with check (interclub.est_admin() or interclub.est_coach_de_club(club_id));

drop policy if exists "grimpeur_update" on interclub.grimpeur;
create policy "grimpeur_update" on interclub.grimpeur for update
  to authenticated
  using (interclub.est_admin() or interclub.est_coach_de_club(club_id))
  with check (interclub.est_admin() or interclub.est_coach_de_club(club_id));

drop policy if exists "grimpeur_delete" on interclub.grimpeur;
create policy "grimpeur_delete" on interclub.grimpeur for delete
  to authenticated
  using (interclub.est_admin() or interclub.est_coach_de_club(club_id));

-- --- equipe : lecture périmètre club ; écriture selon acteur + phase ----------
--     (permanent phase ① / coach temporaire phase ②) — R17, R20, R6, R27.
drop policy if exists "equipe_select" on interclub.equipe;
create policy "equipe_select" on interclub.equipe for select
  to authenticated
  using (interclub.est_admin() or interclub.est_coach_de_club(club_id));

drop policy if exists "equipe_insert" on interclub.equipe;
create policy "equipe_insert" on interclub.equipe for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_equipe(club_id, rencontre_id));

drop policy if exists "equipe_update" on interclub.equipe;
create policy "equipe_update" on interclub.equipe for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_equipe(club_id, rencontre_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_equipe(club_id, rencontre_id));

drop policy if exists "equipe_delete" on interclub.equipe;
create policy "equipe_delete" on interclub.equipe for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_equipe(club_id, rencontre_id));

-- --- composition : lien équipe ↔ grimpeur. Prêt cross-club = admin (R35). -----
drop policy if exists "composition_select" on interclub.composition;
create policy "composition_select" on interclub.composition for select
  to authenticated
  using (interclub.est_admin() or interclub.voit_composition(equipe_id));

drop policy if exists "composition_insert" on interclub.composition;
create policy "composition_insert" on interclub.composition for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_composition(equipe_id, grimpeur_id));

drop policy if exists "composition_delete" on interclub.composition;
create policy "composition_delete" on interclub.composition for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_composition(equipe_id, grimpeur_id));

-- --- resultat : saisie voie/bloc du coach, phase ② + périmètre (R7, R19, R36) -
drop policy if exists "resultat_select" on interclub.resultat;
create policy "resultat_select" on interclub.resultat for select
  to authenticated
  using (interclub.est_admin() or interclub.voit_resultat(epreuve_id, grimpeur_id));

drop policy if exists "resultat_insert" on interclub.resultat;
create policy "resultat_insert" on interclub.resultat for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat(epreuve_id, grimpeur_id));

drop policy if exists "resultat_update" on interclub.resultat;
create policy "resultat_update" on interclub.resultat for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat(epreuve_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat(epreuve_id, grimpeur_id));

drop policy if exists "resultat_delete" on interclub.resultat;
create policy "resultat_delete" on interclub.resultat for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat(epreuve_id, grimpeur_id));

-- --- temps_vitesse : saisie du juge (épreuve vitesse de sa rencontre, R30) ; --
--     lecture par le juge et par le coach du grimpeur concerné.
drop policy if exists "temps_vitesse_select" on interclub.temps_vitesse;
create policy "temps_vitesse_select" on interclub.temps_vitesse for select
  to authenticated
  using (
    interclub.est_admin()
    or interclub.peut_ecrire_temps_vitesse(epreuve_id)
    or interclub.voit_resultat(epreuve_id, grimpeur_id)
  );

drop policy if exists "temps_vitesse_insert" on interclub.temps_vitesse;
create policy "temps_vitesse_insert" on interclub.temps_vitesse for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_temps_vitesse(epreuve_id));

drop policy if exists "temps_vitesse_update" on interclub.temps_vitesse;
create policy "temps_vitesse_update" on interclub.temps_vitesse for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_temps_vitesse(epreuve_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_temps_vitesse(epreuve_id));

drop policy if exists "temps_vitesse_delete" on interclub.temps_vitesse;
create policy "temps_vitesse_delete" on interclub.temps_vitesse for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_temps_vitesse(epreuve_id));

-- ===========================================================================
-- 4. Suivi de version (idempotent).
-- ===========================================================================
insert into interclub.version (version, description, applique_par)
values (
  '202607251000_rls_tables_metier',
  'Policies RLS des 9 tables métier (T6) : helpers de périmètre SECURITY DEFINER (phase, coach temp./juge de rencontre, écriture équipe/composition/résultat/temps vitesse) + grants authenticated + policies par opération selon la matrice spec #1 et l''ADR 0001 (2 chemins acteur, gating de phase).',
  'julleroyfr'
)
on conflict (version) do nothing;
