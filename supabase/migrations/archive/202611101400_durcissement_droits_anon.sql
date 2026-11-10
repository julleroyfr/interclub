-- ===========================================================================
-- 202611101400_durcissement_droits_anon
--
-- Objet : suites des conseillers Supabase (security + performance) relevés en
--         recette le 2026-11-10. Aucune règle métier modifiée.
--
--   1. EXECUTE retiré à `anon` sur les 4 RPC des sessions QR
--      (`ouvrir_session_qr`, `contexte_coach_temporaire`, `contexte_juge`,
--      `liste_grimpeurs_vitesse`, toutes SECURITY DEFINER). Le grant à `anon`
--      ne servait pas : l'app ouvre d'abord une connexion anonyme Supabase
--      (`signInAnonymously`, ADR 0001), dont le JWT porte le rôle
--      `authenticated` ; le rôle `anon` = requête SANS session (clé publique
--      seule), pour laquelle ces RPC ne renvoyaient déjà rien (`auth.uid()`
--      nul). Désormais : refus de privilège (42501). Plus aucune fonction du
--      schéma n'est exécutable par `anon` (scripts/verifier-schema.sh).
--   2. `set_updated_at` (trigger) : `search_path` figé à vide
--      (lint function_search_path_mutable). Corps inchangé (`now()` est dans
--      `pg_catalog`, toujours résolu).
--   3. Policies `compte` « lecture de son compte ou admin » et
--      `session_qr_select_own` : `auth.uid()` → `(select auth.uid())`, évalué
--      une fois par requête au lieu d'une fois par ligne (lint
--      auth_rls_initplan). Mêmes rôles, même prédicat.
--
-- Réversibilité : supabase/retours-arriere/202611101400_durcissement_droits_anon_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

-- 1. RPC des sessions QR : plus d'EXECUTE pour `anon` (`authenticated` conservé).
revoke execute on function interclub.ouvrir_session_qr(uuid) from anon;
revoke execute on function interclub.contexte_coach_temporaire() from anon;
revoke execute on function interclub.contexte_juge() from anon;
revoke execute on function interclub.liste_grimpeurs_vitesse(uuid) from anon;

-- 2. Trigger `set_updated_at` : search_path figé.
alter function interclub.set_updated_at() set search_path = '';

-- 3. Policies : auth.uid() évalué une fois par requête.
drop policy if exists "lecture de son compte ou admin" on interclub.compte;
create policy "lecture de son compte ou admin"
  on interclub.compte for select
  to authenticated
  using (utilisateur_id = (select auth.uid()) or interclub.est_admin());

drop policy if exists "session_qr_select_own" on interclub.session_qr;
create policy "session_qr_select_own" on interclub.session_qr
  for select
  using (utilisateur_id = (select auth.uid()));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101400_durcissement_droits_anon',
  'Durcissement (conseillers Supabase) : EXECUTE retiré à anon sur les 4 RPC QR (authenticated conservé) ; search_path figé de set_updated_at ; (select auth.uid()) dans les policies compte et session_qr. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
