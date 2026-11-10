-- ===========================================================================
-- Retour arrière de 202611101400_durcissement_droits_anon
--
-- Restaure à l'identique les droits des 4 RPC QR (ACL dans l'ordre d'origine :
-- postgres, anon, authenticated — d'où le retrait puis ré-octroi de
-- `authenticated`), le search_path de `set_updated_at` et les deux policies.
-- Aucune donnée touchée. Application MANUELLE dans le SQL Editor, en une
-- transaction.
-- ===========================================================================

begin;

revoke execute on function interclub.ouvrir_session_qr(uuid) from authenticated;
grant execute on function interclub.ouvrir_session_qr(uuid) to anon, authenticated;
revoke execute on function interclub.contexte_coach_temporaire() from authenticated;
grant execute on function interclub.contexte_coach_temporaire() to anon, authenticated;
revoke execute on function interclub.contexte_juge() from authenticated;
grant execute on function interclub.contexte_juge() to anon, authenticated;
revoke execute on function interclub.liste_grimpeurs_vitesse(uuid) from authenticated;
grant execute on function interclub.liste_grimpeurs_vitesse(uuid) to anon, authenticated;

alter function interclub.set_updated_at() reset search_path;

drop policy if exists "lecture de son compte ou admin" on interclub.compte;
create policy "lecture de son compte ou admin"
  on interclub.compte for select
  to authenticated
  using (utilisateur_id = auth.uid() or interclub.est_admin());

drop policy if exists "session_qr_select_own" on interclub.session_qr;
create policy "session_qr_select_own" on interclub.session_qr
  for select
  using (utilisateur_id = auth.uid());

delete from interclub.version
where version = '202611101400_durcissement_droits_anon';

commit;
