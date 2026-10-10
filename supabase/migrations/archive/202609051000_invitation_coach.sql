-- Migration : 202609051000_invitation_coach
-- Description : onboarding coach permanent par invitation (spec #2 R26–R33).
--               (1) table `invitation_coach` : secret durable, lié à un club,
--                   affiché par l'admin (QR + URL) ; état actif / révoqué ;
--                   au plus UNE invitation active par club (R28).
--               (2) RLS : gestion (select/insert/update) réservée à l'admin
--                   (R29). La résolution par valeur + la création du compte
--                   coach relèvent d'une RPC à droits élevés, pas d'un accès
--                   direct `authenticated` (R30, R31).
--               (3) RPC `finaliser_inscription_coach` (SECURITY DEFINER) :
--                   valide l'invitation active et crée le mapping coach du club.
-- Dépendance : requiert 202607221200 (compte) et 202607221100 (club) ainsi que
--              les helpers interclub.est_admin() et interclub.set_updated_at().
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Réf. : docs/specs/02-authentification-et-sessions-qr.md (R26–R33)
--        docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ---------------------------------------------------------------------------
-- 1. invitation_coach — secret durable d'onboarding, lié à un club (R26–R28).
--    Multi-usage : la même invitation active sert à plusieurs inscriptions
--    (R27). La validité NE dépend d'aucune rencontre/phase : uniquement de
--    `actif`. Révocation / régénération = passage de `actif` à false (R29).
-- ---------------------------------------------------------------------------
create table if not exists interclub.invitation_coach (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references interclub.club (id) on delete cascade,
  valeur      uuid not null default gen_random_uuid(),
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Le secret encodé dans l'URL/QR est unique et non devinable (R28).
  constraint uq_invitation_valeur unique (valeur)
);
create index if not exists idx_invitation_coach_club_id
  on interclub.invitation_coach (club_id);

-- R28 : au plus UNE invitation ACTIVE par club.
create unique index if not exists uq_invitation_active_par_club
  on interclub.invitation_coach (club_id)
  where actif;

-- ---------------------------------------------------------------------------
-- 2. Trigger `updated_at`.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_invitation_coach_updated_at on interclub.invitation_coach;
create trigger trg_invitation_coach_updated_at before update on interclub.invitation_coach
  for each row execute function interclub.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — fail-closed. Gestion (lecture/génération/révocation) réservée à
--    l'admin (R29). Aucun accès `coach`/`anon` : la résolution par valeur passe
--    par la RPC en §5 (droits élevés côté serveur), pas par la table.
-- ---------------------------------------------------------------------------
alter table interclub.invitation_coach enable row level security;

grant select, insert, update on interclub.invitation_coach to authenticated;

drop policy if exists "lecture invitation admin" on interclub.invitation_coach;
create policy "lecture invitation admin"
  on interclub.invitation_coach for select
  to authenticated
  using (interclub.est_admin());

drop policy if exists "génération invitation admin" on interclub.invitation_coach;
create policy "génération invitation admin"
  on interclub.invitation_coach for insert
  to authenticated
  with check (interclub.est_admin());

drop policy if exists "révocation invitation admin" on interclub.invitation_coach;
create policy "révocation invitation admin"
  on interclub.invitation_coach for update
  to authenticated
  using (interclub.est_admin())
  with check (interclub.est_admin());

-- ---------------------------------------------------------------------------
-- 4. Lecture par valeur — service_role uniquement (résolution de l'URL par
--    l'écran d'inscription public, côté serveur). anon/authenticated n'ont
--    aucun grant : impossible d'énumérer/deviner une invitation depuis le
--    client (R28, R33).
-- ---------------------------------------------------------------------------
grant select on interclub.invitation_coach to service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC finaliser_inscription_coach — crée le mapping coach du club de
--    l'invitation, de façon atomique et élevée (R30, R31). Appelée côté serveur
--    (service_role) APRÈS création du compte Supabase. Fail-closed : révoquée /
--    inexistante ⇒ exception, aucun mapping (R30, R33). Un `utilisateur_id`
--    déjà mappé ⇒ violation de PK `compte` ⇒ exception (pas de doublon, R32).
-- ---------------------------------------------------------------------------
create or replace function interclub.finaliser_inscription_coach(
  p_valeur uuid,
  p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = interclub, public
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

grant execute on function interclub.finaliser_inscription_coach(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609051000_invitation_coach',
  'invitation_coach (secret durable par club, une active par club) + RLS admin + RPC finaliser_inscription_coach (mapping coach à l''inscription) — onboarding spec #2 R26–R33.',
  'julleroyfr'
)
on conflict (version) do nothing;
