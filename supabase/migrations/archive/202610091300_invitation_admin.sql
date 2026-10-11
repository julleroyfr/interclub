-- ===========================================================================
-- Invitation administrateur (spec #2 R35–R40, rév. 2026-10-09 — TODO D7)
-- ---------------------------------------------------------------------------
-- L'admin génère, depuis l'écran « Mapping de rôle », un QR/URL à USAGE UNIQUE,
-- valable 15 MINUTES, qui permet de créer un compte permanent de rôle admin.
--   - au plus UNE invitation active (R37) : index unique partiel ; la
--     génération désactive la précédente (Server Action) ;
--   - validité CALCULÉE (actif, non utilisée, expire_le > now()) et vérifiée à
--     la consommation, pas seulement à l'affichage (R39) ;
--   - consommation + mapping admin en UNE opération (R38) : la RPC
--     `finaliser_inscription_admin` verrouille la ligne par un UPDATE conditionnel
--     — deux inscriptions simultanées : une seule réussit.
--
-- Sécurité : RLS admin pour gérer (R35) ; aucune lecture par valeur côté client
-- (service_role seul, comme invitation_coach) ; RPC SECURITY DEFINER exécutable
-- par service_role SEUL (privilèges par défaut fermés, 202610031100).
--
-- Application : MANUELLE (SQL Editor) — local d'abord, puis recette, puis prod à
-- la bascule sur `main`. Idempotente.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists interclub.invitation_admin (
  id           uuid primary key default gen_random_uuid(),
  valeur       uuid not null default gen_random_uuid(),
  actif        boolean not null default true,
  cree_le      timestamptz not null default now(),
  expire_le    timestamptz not null default now() + interval '15 minutes',
  utilisee_le  timestamptz,
  utilise_par  uuid references auth.users (id) on delete set null,
  -- Le secret encodé dans l'URL/QR est unique et non devinable (R35).
  constraint uq_invitation_admin_valeur unique (valeur),
  -- Une invitation utilisée l'a été par un compte (R38) — sauf compte supprimé.
  constraint chk_invitation_admin_utilisation
    check (utilisee_le is not null or utilise_par is null)
);

-- R37 : au plus UNE invitation administrateur active.
create unique index if not exists uq_invitation_admin_active
  on interclub.invitation_admin ((true))
  where actif;

-- ---------------------------------------------------------------------------
-- 2. RLS — gestion réservée à l'admin (R35). Les colonnes d'utilisation ne sont
--    écrites que par la RPC (§4) : l'admin ne peut modifier que `actif`.
-- ---------------------------------------------------------------------------
alter table interclub.invitation_admin enable row level security;

grant select, insert on interclub.invitation_admin to authenticated;
grant update (actif) on interclub.invitation_admin to authenticated;

drop policy if exists "invitation_admin_select" on interclub.invitation_admin;
create policy "invitation_admin_select" on interclub.invitation_admin for select
  to authenticated
  using (interclub.est_admin());

drop policy if exists "invitation_admin_insert" on interclub.invitation_admin;
create policy "invitation_admin_insert" on interclub.invitation_admin for insert
  to authenticated
  with check (interclub.est_admin());

drop policy if exists "invitation_admin_update" on interclub.invitation_admin;
create policy "invitation_admin_update" on interclub.invitation_admin for update
  to authenticated
  using (interclub.est_admin())
  with check (interclub.est_admin());

-- ---------------------------------------------------------------------------
-- 3. Lecture par valeur — service_role uniquement (écran d'inscription public,
--    côté serveur) : impossible d'énumérer une invitation depuis le client.
-- ---------------------------------------------------------------------------
grant select on interclub.invitation_admin to service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC finaliser_inscription_admin — consomme l'invitation et crée le mapping
--    admin, de façon atomique (R36, R38, R39). Appelée côté serveur
--    (service_role) APRÈS création du compte Supabase. L'UPDATE conditionnel
--    verrouille la ligne : une seconde inscription concurrente réévalue la
--    condition après la première et ne trouve plus rien. Fail-closed :
--    inconnue, révoquée, expirée ou déjà utilisée ⇒ exception, aucun mapping.
-- ---------------------------------------------------------------------------
create or replace function interclub.finaliser_inscription_admin(
  p_valeur uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update interclub.invitation_admin
     set utilisee_le = now(),
         utilise_par = p_utilisateur_id
   where valeur = p_valeur
     and actif
     and utilisee_le is null
     and expire_le > now();

  if not found then
    raise exception 'invitation_admin_invalide' using errcode = 'P0001';
  end if;

  -- R38 : rôle admin, sans club (R3). Un compte déjà mappé ⇒ violation de PK.
  insert into interclub.compte (utilisateur_id, role, club_id)
  values (p_utilisateur_id, 'admin', null);
end;
$$;

revoke execute on function interclub.finaliser_inscription_admin(uuid, uuid) from public;
grant execute on function interclub.finaliser_inscription_admin(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202610091300_invitation_admin',
  'Invitation administrateur (spec #2 R35–R40, D7) : table invitation_admin (valeur unique, expire_le = génération + 15 min, usage unique, une active), RLS admin (update limité à actif), lecture service_role, RPC finaliser_inscription_admin (consommation atomique + mapping admin, service_role seul).',
  'julleroyfr'
)
on conflict (version) do nothing;
