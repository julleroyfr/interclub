-- ===========================================================================
-- 202610031300_jeton_qr_revocation_definitive
--
-- Objet : décision D-E de la revue du 2026-10-03 (constat m4) — pour un coach,
--         la mise à jour d'un jeton QR ne peut QUE le révoquer. Application de
--         la spec #2 telle qu'écrite (aucune révision) : R20/R21 (révoquer ou
--         régénérer), R22 (la révocation invalide le jeton), R23 (rétablir un
--         accès = régénérer un NOUVEAU jeton).
--
-- Constat : la policy « révocation jeton admin ou coach de son club » et le
--         grant UPDATE sur toute la table permettaient au coach de RÉACTIVER un
--         jeton révoqué (y compris par l'admin), ou d'en changer la rencontre,
--         la nature ou la valeur.
--
-- Correctif :
--   1. droit de colonne : `authenticated` ne peut modifier QUE `actif` (les
--      actions n'écrivent rien d'autre ; `updated_at` reste posé par trigger) ;
--   2. trigger : un écrivain non admin ne peut pas faire passer `actif` de
--      faux à vrai (révocation définitive). L'admin et les chemins serveur
--      sans JWT utilisateur ne sont pas contraints.
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : grants/revokes rejouables, `create or replace`,
--         `drop trigger if exists`.
-- ===========================================================================

-- 1. Droit de mise à jour limité à la colonne `actif`.
revoke update on interclub.jeton_qr from authenticated;
grant update (actif) on interclub.jeton_qr to authenticated;

-- 2. Révocation définitive pour un non-admin (spec #2 R22/R23).
create or replace function interclub.interdire_reactivation_jeton()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.actif and not old.actif
     and auth.uid() is not null
     and not interclub.est_admin() then
    raise exception 'reactivation_jeton_interdite'
      using errcode = '42501',
            detail = 'Un jeton révoqué ne se réactive pas : régénérez-en un nouveau (spec #2 R23).';
  end if;
  return new;
end;
$$;

comment on function interclub.interdire_reactivation_jeton() is
  'Trigger BEFORE UPDATE OF actif (jeton_qr) : un non-admin ne peut pas réactiver un jeton révoqué (spec #2 R22/R23, décision D-E du 2026-10-03).';

revoke execute on function interclub.interdire_reactivation_jeton() from public;

drop trigger if exists jeton_qr_revocation_definitive on interclub.jeton_qr;
create trigger jeton_qr_revocation_definitive
  before update of actif on interclub.jeton_qr
  for each row execute function interclub.interdire_reactivation_jeton();

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610031300_jeton_qr_revocation_definitive',
  'D-E revue 2026-10-03 : update de jeton_qr limité à la colonne actif pour authenticated ; trigger interdisant à un non-admin de réactiver un jeton révoqué (spec #2 R22/R23).',
  'julleroyfr'
)
on conflict (version) do nothing;
