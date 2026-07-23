-- Migration : 202607230900_rls_jeton_qr_et_grants
-- Description : policies RLS de `interclub.jeton_qr` (T5c) selon la spec #2 :
--               génération / affichage / révocation / régénération des jetons.
--               - admin : tout jeton, tout périmètre (R15, R20) ;
--               - coach permanent : uniquement le jeton `coach_temporaire` de SON
--                 club (R16, R21) ; jamais un jeton `juge` (R17).
--               Ajoute le helper `club_courant()` et les grants nécessaires
--               (jeton_qr en écriture pour authenticated ; lecture des
--               catalogues rencontre/voie/equipe pour service_role — écrans de
--               génération, cf. ADR 0002/0003).
-- Sources : docs/specs/02-authentification-et-sessions-qr.md (R15–R23),
--           docs/specs/01-roles-et-autorisations.md (R14, R26, R29).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ---------------------------------------------------------------------------
-- 1. Helper : club du compte connecté (NULL si admin ou sans mapping).
--    SECURITY DEFINER pour lire `compte` sans dépendre de la RLS de `jeton_qr`
--    (cohérent avec role_courant()/est_admin()).
-- ---------------------------------------------------------------------------
create or replace function interclub.club_courant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select club_id from interclub.compte where utilisateur_id = auth.uid();
$$;

comment on function interclub.club_courant() is
  'Club (club_id) du compte coach connecté, NULL sinon (spec #2 R3). SECURITY DEFINER : évite la récursion RLS.';

-- ---------------------------------------------------------------------------
-- 2. Grants — sans privilège de table, une policy reste inopérante.
--    Écritures jeton_qr par `authenticated` (RLS = vraie frontière) ; la
--    révocation/régénération se font par UPDATE (actif=false) → pas de delete.
--    Lecture des catalogues par `service_role` pour peupler les écrans de
--    génération (rencontre/voie/equipe pas encore ouverts en RLS, cf. T6).
-- ---------------------------------------------------------------------------
grant select, insert, update on interclub.jeton_qr to authenticated;
grant execute on function interclub.club_courant() to authenticated;

grant select on interclub.rencontre    to service_role;
grant select on interclub.voie_vitesse to service_role;
grant select on interclub.equipe       to service_role;

-- ---------------------------------------------------------------------------
-- 3. Policies RLS de `jeton_qr` — une par opération (RLS déjà activée en
--    202607221200). Rejouable : drop avant recreate.
--    Prédicat commun : admin OU (jeton coach temporaire de MON club).
-- ---------------------------------------------------------------------------
drop policy if exists "lecture jeton admin ou coach de son club" on interclub.jeton_qr;
create policy "lecture jeton admin ou coach de son club"
  on interclub.jeton_qr for select
  to authenticated
  using (
    interclub.est_admin()
    or (nature = 'coach_temporaire' and club_id = interclub.club_courant())
  );

drop policy if exists "génération jeton admin ou coach de son club" on interclub.jeton_qr;
create policy "génération jeton admin ou coach de son club"
  on interclub.jeton_qr for insert
  to authenticated
  with check (
    interclub.est_admin()
    or (nature = 'coach_temporaire' and club_id = interclub.club_courant())
  );

drop policy if exists "révocation jeton admin ou coach de son club" on interclub.jeton_qr;
create policy "révocation jeton admin ou coach de son club"
  on interclub.jeton_qr for update
  to authenticated
  using (
    interclub.est_admin()
    or (nature = 'coach_temporaire' and club_id = interclub.club_courant())
  )
  with check (
    interclub.est_admin()
    or (nature = 'coach_temporaire' and club_id = interclub.club_courant())
  );

-- ---------------------------------------------------------------------------
-- 4. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607230900_rls_jeton_qr_et_grants',
  'Helper club_courant() + grants (jeton_qr écriture authenticated ; select rencontre/voie/equipe service_role) + policies RLS de jeton_qr (admin tout ; coach temp. de son club) pour T5c.',
  'julleroyfr'
)
on conflict (version) do nothing;
