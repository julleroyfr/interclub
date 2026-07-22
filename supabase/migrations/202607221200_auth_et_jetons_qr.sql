-- Migration : 202607221200_auth_et_jetons_qr
-- Description : modèle d'authentification applicative, dérivé de la spec #2
--               (docs/specs/02-authentification-et-sessions-qr.md).
--               (1) `compte` : mapping compte Supabase ↔ rôle applicatif (+ club
--                   pour un coach) ; (2) `jeton_qr` : jetons QR éphémères
--                   (coach temporaire → un club / juge → une voie de vitesse)
--                   pour une rencontre.
-- Dépendance : requiert la migration 202607221150 (interclub.voie_vitesse).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- RLS : activée sur chaque table (fail-closed). Policies en T6.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2, §3, §5.

-- ---------------------------------------------------------------------------
-- 1. compte — mapping compte Supabase Auth → rôle applicatif (R1–R5).
--    Un compte porte AU PLUS un rôle (`admin` ou `coach`). Un coach est
--    rattaché à un club (obligatoire) ; un admin n'a pas de club.
--    Le rôle `juge` n'a jamais de compte permanent (spec #1 R3) : absent ici.
-- ---------------------------------------------------------------------------
create table if not exists interclub.compte (
  utilisateur_id  uuid primary key references auth.users (id) on delete cascade,
  role            text not null check (role in ('admin', 'coach')),
  club_id         uuid references interclub.club (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- R3 : coach ⇒ club obligatoire ; admin ⇒ pas de club.
  constraint chk_compte_role_club check (
    (role = 'admin' and club_id is null)
    or (role = 'coach' and club_id is not null)
  )
);
create index if not exists idx_compte_club_id on interclub.compte (club_id);

-- ---------------------------------------------------------------------------
-- 2. jeton_qr — jeton QR éphémère, anonyme et multi-usage, pour une rencontre
--    (R6–R11). Deux natures : `coach_temporaire` (périmètre = un club) ou
--    `juge` (périmètre = une voie de vitesse de la rencontre, R9).
--    La validité (phase ② + non révoqué) se CALCULE : elle n'est pas stockée.
--    Révocation / régénération = passage de `actif` à false (R22, R23).
-- ---------------------------------------------------------------------------
create table if not exists interclub.jeton_qr (
  id              uuid primary key default gen_random_uuid(),
  rencontre_id    uuid not null references interclub.rencontre (id) on delete cascade,
  nature          text not null check (nature in ('coach_temporaire', 'juge')),
  club_id         uuid references interclub.club (id) on delete restrict,
  voie_vitesse_id uuid references interclub.voie_vitesse (id) on delete cascade,
  valeur          uuid not null default gen_random_uuid(),
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- R9 : coach_temporaire ⇒ un club (sans voie) ; juge ⇒ une voie de vitesse
  --      (sans club, périmètre = la voie à laquelle il est affecté).
  constraint chk_jeton_nature_perimetre check (
    (nature = 'coach_temporaire' and club_id is not null and voie_vitesse_id is null)
    or (nature = 'juge' and club_id is null and voie_vitesse_id is not null)
  ),
  -- Le secret scanné est unique (R6, contraintes de données spec #2).
  constraint uq_jeton_valeur unique (valeur)
);
create index if not exists idx_jeton_qr_rencontre_id on interclub.jeton_qr (rencontre_id);
create index if not exists idx_jeton_qr_club_id on interclub.jeton_qr (club_id);
create index if not exists idx_jeton_qr_voie_vitesse_id on interclub.jeton_qr (voie_vitesse_id);

-- R18 : au plus UN jeton `juge` ACTIF par voie de vitesse.
create unique index if not exists uq_jeton_juge_actif_par_voie
  on interclub.jeton_qr (voie_vitesse_id)
  where nature = 'juge' and actif;

-- R19 : au plus UN jeton `coach_temporaire` ACTIF par (rencontre, club).
create unique index if not exists uq_jeton_coach_actif_par_rencontre_club
  on interclub.jeton_qr (rencontre_id, club_id)
  where nature = 'coach_temporaire' and actif;

-- ---------------------------------------------------------------------------
-- 3. Triggers `updated_at`.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_compte_updated_at on interclub.compte;
create trigger trg_compte_updated_at before update on interclub.compte
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_jeton_qr_updated_at on interclub.jeton_qr;
create trigger trg_jeton_qr_updated_at before update on interclub.jeton_qr
  for each row execute function interclub.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS — activée (fail-closed). Policies par opération en T6.
-- ---------------------------------------------------------------------------
alter table interclub.compte   enable row level security;
alter table interclub.jeton_qr enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607221200_auth_et_jetons_qr',
  'Modèle auth : compte (mapping compte Supabase ↔ rôle/club) + jeton_qr (jetons éphémères coach temp.→club / juge→voie de vitesse) + RLS activée.',
  'julleroyfr'
)
on conflict (version) do nothing;
