-- ============================================================================
-- FICHIER GÉNÉRÉ par scripts/consolider-archive.sh — NE PAS MODIFIER.
-- Concaténation des 47 migrations de supabase/migrations/archive/,
-- déjà appliquées en recette et en prod (cf. JOURNAL.md).
-- Usage LOCAL uniquement (supabase db reset) : ne jamais l'appliquer en
-- recette ni en prod.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- archive/202607221000_creation_schema_interclub_et_version.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607221000_creation_schema_interclub_et_version
-- Description : création du schéma applicatif `interclub` et de la table de
--               suivi des migrations `interclub.version` (première migration).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, puis prod.
--               Rejouable sur base neuve (idempotent).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §5, §5bis.

-- 1. Schéma dédié à l'application (le métier ne vit pas dans `public`).
create schema if not exists interclub;

-- 2. Table de suivi des migrations réellement appliquées sur CET environnement.
create table if not exists interclub.version (
  version       text primary key,
  description   text not null,
  applique_le   timestamptz not null default now(),
  applique_par  text not null
);

comment on table interclub.version is
  'Suivi des migrations SQL appliquées sur cet environnement (une ligne par migration).';

-- 3. Ligne de suivi de la présente migration (idempotent).
--    ⚠️ Renseigner `applique_par` avec l''auteur réel lors de l''application.
insert into interclub.version (version, description, applique_par)
values (
  '202607221000_creation_schema_interclub_et_version',
  'Création du schéma interclub et de la table de suivi interclub.version.',
  'julleroyfr'
)
on conflict (version) do nothing;

-- 4. RAPPEL (à faire côté Dashboard, hors SQL) :
--    Settings → API → Exposed schemas : ajouter `interclub`
--    pour rendre le schéma requêtable par le client Supabase.


-- ----------------------------------------------------------------------------
-- archive/202607221100_modele_donnees_socle.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607221100_modele_donnees_socle
-- Description : modèle de données socle du domaine interclub (clubs, coachs,
--               grimpeurs, rencontres, équipes, compositions, épreuves,
--               résultats, temps de vitesse), dérivé de la spec #1
--               (docs/specs/01-roles-et-autorisations.md).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- RLS : activée sur chaque table (fail-closed). Les policies viendront en T6
--       (une par opération, selon la matrice rôles × actions).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2, §2bis, §3, §5.

-- ---------------------------------------------------------------------------
-- 0. Fonction utilitaire : maintien de `updated_at` à chaque UPDATE.
-- ---------------------------------------------------------------------------
create or replace function interclub.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. club — structure regroupant équipes et grimpeurs (R11, R16).
-- ---------------------------------------------------------------------------
create table if not exists interclub.club (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. coach — rattaché à exactement un club (R16). Permanent ou temporaire (R2).
--    Le mapping compte Supabase ↔ coach relève de l'auth (T5, hors périmètre spec #1).
-- ---------------------------------------------------------------------------
create table if not exists interclub.coach (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references interclub.club (id) on delete cascade,
  est_permanent boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_coach_club_id on interclub.coach (club_id);

-- ---------------------------------------------------------------------------
-- 3. grimpeur — licencié dans un club (R18). Ne porte pas d'équipe : il peut
--    être composé dans plusieurs équipes au fil des rencontres (cf. composition).
--    On ne conserve que l'année de naissance (base de la catégorie enfant/ado).
-- ---------------------------------------------------------------------------
create table if not exists interclub.grimpeur (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references interclub.club (id) on delete cascade,
  nom              text not null,
  prenom           text not null,
  annee_naissance  int not null check (annee_naissance between 1900 and 2100),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_grimpeur_club_id on interclub.grimpeur (club_id);

-- ---------------------------------------------------------------------------
-- 4. rencontre — confrontation programmée, portée par un club, dans une
--    catégorie d'âge, avec une phase courante (R5, R12).
-- ---------------------------------------------------------------------------
create table if not exists interclub.rencontre (
  id               uuid primary key default gen_random_uuid(),
  date_rencontre   date not null,
  club_porteur_id  uuid not null references interclub.club (id) on delete restrict,
  categorie        text not null check (categorie in ('enfant', 'ado')),
  phase            text not null default 'pre_competition'
                     check (phase in ('pre_competition', 'competition', 'resultats_publics')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_rencontre_club_porteur_id on interclub.rencontre (club_porteur_id);

-- ---------------------------------------------------------------------------
-- 5. equipe — engagée par un club POUR une rencontre (composée pour l'occasion).
--    La catégorie n'est pas portée par l'équipe : elle découle de la rencontre.
--    Un club peut aligner plusieurs équipes dans une même rencontre (nom distinct).
-- ---------------------------------------------------------------------------
create table if not exists interclub.equipe (
  id           uuid primary key default gen_random_uuid(),
  rencontre_id uuid not null references interclub.rencontre (id) on delete cascade,
  club_id      uuid not null references interclub.club (id) on delete restrict,
  nom          text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (rencontre_id, club_id, nom)
);
create index if not exists idx_equipe_rencontre_id on interclub.equipe (rencontre_id);
create index if not exists idx_equipe_club_id on interclub.equipe (club_id);

-- ---------------------------------------------------------------------------
-- 6. composition — liaison équipe ↔ grimpeur (many-to-many pour une rencontre).
-- ---------------------------------------------------------------------------
create table if not exists interclub.composition (
  equipe_id    uuid not null references interclub.equipe (id) on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (equipe_id, grimpeur_id)
);
create index if not exists idx_composition_grimpeur_id on interclub.composition (grimpeur_id);

-- ---------------------------------------------------------------------------
-- 7. epreuve — discipline évaluée dans une rencontre : voie, bloc ou vitesse
--    (cf. Vocabulaire « Épreuve », R30). Une épreuve par type et par rencontre.
-- ---------------------------------------------------------------------------
create table if not exists interclub.epreuve (
  id           uuid primary key default gen_random_uuid(),
  rencontre_id uuid not null references interclub.rencontre (id) on delete cascade,
  type         text not null check (type in ('voie', 'bloc', 'vitesse')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (rencontre_id, type)
);
create index if not exists idx_epreuve_rencontre_id on interclub.epreuve (rencontre_id);

-- ---------------------------------------------------------------------------
-- 8. resultat — résultat d'un grimpeur sur une épreuve de voie ou de bloc (R19).
--    Structure MINIMALE : le scoring/classement détaillé est hors périmètre de
--    la spec #1 et fera l'objet d'une spec dédiée. `valeur` est un placeholder.
-- ---------------------------------------------------------------------------
create table if not exists interclub.resultat (
  id           uuid primary key default gen_random_uuid(),
  epreuve_id   uuid not null references interclub.epreuve (id) on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  valeur       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (epreuve_id, grimpeur_id)
);
create index if not exists idx_resultat_epreuve_id on interclub.resultat (epreuve_id);
create index if not exists idx_resultat_grimpeur_id on interclub.resultat (grimpeur_id);

comment on column interclub.resultat.valeur is
  'Placeholder — scoring détaillé (voie/bloc) hors périmètre spec #1, à préciser dans une spec dédiée.';

-- ---------------------------------------------------------------------------
-- 9. temps_vitesse — temps d'un grimpeur pour l'épreuve de vitesse (R30, R31).
--    Un seul temps par grimpeur et par épreuve de vitesse (pas d'autre passage).
--    La contrainte « épreuve de type vitesse » sera garantie par la logique/les
--    policies (T6) ; ici on borne l'unicité du passage.
-- ---------------------------------------------------------------------------
create table if not exists interclub.temps_vitesse (
  id           uuid primary key default gen_random_uuid(),
  epreuve_id   uuid not null references interclub.epreuve (id) on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  temps        numeric(7,3) not null check (temps > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (epreuve_id, grimpeur_id)
);
create index if not exists idx_temps_vitesse_epreuve_id on interclub.temps_vitesse (epreuve_id);
create index if not exists idx_temps_vitesse_grimpeur_id on interclub.temps_vitesse (grimpeur_id);

-- ---------------------------------------------------------------------------
-- 10. Triggers `updated_at` sur les tables porteuses de la colonne.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_club_updated_at on interclub.club;
create trigger trg_club_updated_at before update on interclub.club
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_coach_updated_at on interclub.coach;
create trigger trg_coach_updated_at before update on interclub.coach
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_grimpeur_updated_at on interclub.grimpeur;
create trigger trg_grimpeur_updated_at before update on interclub.grimpeur
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_rencontre_updated_at on interclub.rencontre;
create trigger trg_rencontre_updated_at before update on interclub.rencontre
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_equipe_updated_at on interclub.equipe;
create trigger trg_equipe_updated_at before update on interclub.equipe
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_epreuve_updated_at on interclub.epreuve;
create trigger trg_epreuve_updated_at before update on interclub.epreuve
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_resultat_updated_at on interclub.resultat;
create trigger trg_resultat_updated_at before update on interclub.resultat
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_temps_vitesse_updated_at on interclub.temps_vitesse;
create trigger trg_temps_vitesse_updated_at before update on interclub.temps_vitesse
  for each row execute function interclub.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. RLS — activée sur toutes les tables (fail-closed : aucune policy = aucun
--     accès). Les policies par opération seront ajoutées en T6.
-- ---------------------------------------------------------------------------
alter table interclub.club          enable row level security;
alter table interclub.coach         enable row level security;
alter table interclub.grimpeur      enable row level security;
alter table interclub.rencontre     enable row level security;
alter table interclub.equipe        enable row level security;
alter table interclub.composition   enable row level security;
alter table interclub.epreuve       enable row level security;
alter table interclub.resultat      enable row level security;
alter table interclub.temps_vitesse enable row level security;

-- ---------------------------------------------------------------------------
-- 12. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607221100_modele_donnees_socle',
  'Modèle de données socle : club, coach, grimpeur, rencontre, equipe, composition, epreuve, resultat, temps_vitesse (+ RLS activée).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202607221150_voie_de_vitesse.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607221150_voie_de_vitesse
-- Description : voies de l'épreuve de vitesse d'une rencontre (nombre
--               paramétrable). Un juge est affecté à une voie (cf. spec #2 R9b,
--               R17, R18). Dérivé de la spec #2
--               (docs/specs/02-authentification-et-sessions-qr.md).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- RLS : activée (fail-closed). Policies en T6.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2, §3, §5.

-- ---------------------------------------------------------------------------
-- voie_vitesse — couloir/ligne de l'épreuve de vitesse d'une rencontre.
--   Le nombre de voies est paramétrable (0..n par rencontre). Rattachée à la
--   rencontre (qui a au plus une épreuve de vitesse). NB : « voie » désigne ici
--   un couloir de vitesse, à ne pas confondre avec l'épreuve de type « voie »
--   (difficulté) de la table interclub.epreuve.
-- ---------------------------------------------------------------------------
create table if not exists interclub.voie_vitesse (
  id            uuid primary key default gen_random_uuid(),
  rencontre_id  uuid not null references interclub.rencontre (id) on delete cascade,
  numero        int not null check (numero > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (rencontre_id, numero)
);
create index if not exists idx_voie_vitesse_rencontre_id on interclub.voie_vitesse (rencontre_id);

drop trigger if exists trg_voie_vitesse_updated_at on interclub.voie_vitesse;
create trigger trg_voie_vitesse_updated_at before update on interclub.voie_vitesse
  for each row execute function interclub.set_updated_at();

alter table interclub.voie_vitesse enable row level security;

insert into interclub.version (version, description, applique_par)
values (
  '202607221150_voie_de_vitesse',
  'Voies de vitesse d''une rencontre (nombre paramétrable) + RLS activée.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202607221200_auth_et_jetons_qr.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202607221300_rls_compte_et_role_courant.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607221300_rls_compte_et_role_courant
-- Description : première tranche d'auth (T5a). Fonctions de lecture du rôle
--               courant (SECURITY DEFINER, sans récursion RLS), grants
--               fondateurs sur le schéma `interclub` et la table `compte`, et
--               policies RLS de `compte` (une par opération, selon la matrice
--               rôles × actions de la spec #1 et le mapping de la spec #2).
-- Sources : docs/specs/02-authentification-et-sessions-qr.md (R1–R5),
--           docs/specs/01-roles-et-autorisations.md (R4, R10).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ---------------------------------------------------------------------------
-- 1. Fonctions de rôle — SECURITY DEFINER pour lire `compte` en CONTOURNANT la
--    RLS (sinon une policy de `compte` qui interroge `compte` boucle). `stable`
--    car le résultat est constant dans une même requête. `search_path` vidé et
--    objets pleinement qualifiés (bonne pratique sécurité des fonctions definer).
-- ---------------------------------------------------------------------------
create or replace function interclub.role_courant()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Rôle applicatif du compte connecté, ou NULL si pas de mapping (R5 fail-closed).
  select role from interclub.compte where utilisateur_id = auth.uid();
$$;

comment on function interclub.role_courant() is
  'Rôle applicatif (admin/coach) du compte connecté, NULL si pas de mapping (spec #2 R5). SECURITY DEFINER : évite la récursion RLS sur compte.';

create or replace function interclub.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.compte
    where utilisateur_id = auth.uid() and role = 'admin'
  );
$$;

comment on function interclub.est_admin() is
  'Vrai si le compte connecté a le rôle admin (spec #1 R10). SECURITY DEFINER : évite la récursion RLS sur compte.';

-- ---------------------------------------------------------------------------
-- 2. Grants fondateurs — sans privilège de table, une policy RLS reste
--    inopérante (permission denied). Les migrations socle/auth n'ont fait
--    qu'activer la RLS ; on accorde ici l'accès de base au rôle `authenticated`.
--    (Les grants des autres tables métier viendront avec leurs policies en T6.)
-- ---------------------------------------------------------------------------
grant usage on schema interclub to anon, authenticated;
grant select, insert, update, delete on interclub.compte to authenticated;
grant execute on function interclub.role_courant() to authenticated;
grant execute on function interclub.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policies RLS de `compte` — une par opération (RLS déjà activée en
--    202607221200). Rejouable : on droppe avant de recréer.
--    Lecture : chacun voit SA ligne ; l'admin voit tout (R4, R10).
--    Écritures : réservées à l'admin — administration du mapping (spec #2 R4).
-- ---------------------------------------------------------------------------
drop policy if exists "lecture de son compte ou admin" on interclub.compte;
create policy "lecture de son compte ou admin"
  on interclub.compte for select
  to authenticated
  using (utilisateur_id = auth.uid() or interclub.est_admin());

drop policy if exists "admin crée un mapping" on interclub.compte;
create policy "admin crée un mapping"
  on interclub.compte for insert
  to authenticated
  with check (interclub.est_admin());

drop policy if exists "admin modifie un mapping" on interclub.compte;
create policy "admin modifie un mapping"
  on interclub.compte for update
  to authenticated
  using (interclub.est_admin())
  with check (interclub.est_admin());

drop policy if exists "admin supprime un mapping" on interclub.compte;
create policy "admin supprime un mapping"
  on interclub.compte for delete
  to authenticated
  using (interclub.est_admin());

-- ---------------------------------------------------------------------------
-- 4. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607221300_rls_compte_et_role_courant',
  'Fonctions role_courant()/est_admin() (SECURITY DEFINER) + grants schéma/compte + policies RLS de compte (lecture sa ligne/admin ; écritures admin).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202607221400_grants_service_role_mapping.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607221400_grants_service_role_mapping
-- Description : accorde au rôle `service_role` l'accès en LECTURE dont le backend
--               admin a besoin pour l'écran de mapping de rôle (T5b) : lister les
--               comptes mappés et le catalogue des clubs. Le schéma `interclub`
--               est custom : contrairement à `public`, `service_role` n'y a AUCUN
--               privilège par défaut. `service_role` contourne la RLS mais reste
--               soumis aux GRANTs de table — d'où ces grants explicites.
-- Contexte : cf. docs/decisions/0002-liste-des-comptes-via-cle-service.md (ADR 0002).
--            L'ÉCRITURE du mapping reste faite par `authenticated` via la RLS
--            (policies « admin crée/modifie un mapping », spec #2 R4) : on n'ouvre
--            donc à `service_role` que le SELECT, pas les écritures.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §5.

-- Usage du schéma (sans lui, aucune lecture possible pour ce rôle).
grant usage on schema interclub to service_role;

-- Lectures nécessaires à l'écran de mapping (loaders `chargerContexteMapping`).
-- `club` n'est pas encore ouvert en RLS `authenticated` (T6) : le backend admin
-- le lit via `service_role` (ADR 0002). `compte` : lecture de tous les mappings.
grant select on interclub.club   to service_role;
grant select on interclub.compte to service_role;

-- ---------------------------------------------------------------------------
-- Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607221400_grants_service_role_mapping',
  'Grants de lecture service_role sur interclub (usage schéma + select club/compte) pour l''écran admin de mapping (T5b, ADR 0002).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202607230900_rls_jeton_qr_et_grants.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202607231000_session_qr_et_rpc.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607231000_session_qr_et_rpc
-- Description : table `interclub.session_qr` (lie un utilisateur anonyme au
--               jeton scanné) + RLS + RPC `ouvrir_session_qr` (SECURITY
--               DEFINER) — ADR 0001, spec #2 R6–R14, R22–R25.
-- Dépendance : requiert 202607221200 (jeton_qr) et 202607221100 (rencontre).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Prérequis Supabase Dashboard : activer « Anonymous sign-ins »
--   (Authentication → Providers → Anonymous).
-- Réf. : docs/decisions/0001-authentification-sessions-ephemeres-qr.md
--         docs/specs/02-authentification-et-sessions-qr.md R6–R14

-- ---------------------------------------------------------------------------
-- 1. session_qr — lie un utilisateur anonyme au jeton qu'il a scanné (ADR 0001 §4).
--    Pas de `updated_at` : la ligne est créée à l'ouverture et ne change pas.
-- ---------------------------------------------------------------------------
create table if not exists interclub.session_qr (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  jeton_qr_id    uuid not null references interclub.jeton_qr (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create index if not exists idx_session_qr_utilisateur_id on interclub.session_qr (utilisateur_id);
create index if not exists idx_session_qr_jeton_qr_id    on interclub.session_qr (jeton_qr_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — fail-closed. L'utilisateur voit uniquement sa propre ligne.
--    Aucun insert/update/delete direct (ouverture par la RPC uniquement).
-- ---------------------------------------------------------------------------
alter table interclub.session_qr enable row level security;

drop policy if exists "session_qr_select_own" on interclub.session_qr;
create policy "session_qr_select_own" on interclub.session_qr
  for select
  using (utilisateur_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Grants lecture — anon et authenticated peuvent lire leur propre ligne
--    (la policy filtre déjà ; le grant est la pré-condition).
-- ---------------------------------------------------------------------------
grant select on interclub.session_qr to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC ouvrir_session_qr — seule surface SECURITY DEFINER (ADR 0001 §2).
--    Valide le secret, la phase ②, puis insère la session et renvoie le
--    rôle + périmètre. `set search_path` restreint la surface d'attaque.
-- ---------------------------------------------------------------------------
create or replace function interclub.ouvrir_session_qr(p_valeur uuid)
returns jsonb
language plpgsql
security definer
set search_path = interclub, public
as $$
declare
  v_jeton    interclub.jeton_qr%rowtype;
  v_rencontre interclub.rencontre%rowtype;
begin
  -- Retrouver le jeton par son secret (valeur unique non devinable).
  select * into v_jeton
    from interclub.jeton_qr
   where valeur = p_valeur;

  if not found then
    raise exception 'jeton_inconnu' using errcode = 'P0001';
  end if;

  -- R22 : jeton révoqué → aucune session.
  if not v_jeton.actif then
    raise exception 'jeton_revoque' using errcode = 'P0002';
  end if;

  -- R12 : hors phase ② (competition) → aucune session.
  select * into v_rencontre
    from interclub.rencontre
   where id = v_jeton.rencontre_id;

  if v_rencontre.phase <> 'competition' then
    raise exception 'hors_phase_competition' using errcode = 'P0003';
  end if;

  -- Ouvrir la session : lier cet utilisateur anonyme au jeton.
  insert into interclub.session_qr (utilisateur_id, jeton_qr_id)
  values (auth.uid(), v_jeton.id);

  -- Retourner rôle + périmètre (snake_case pour correspondre à la convention SQL).
  return jsonb_build_object(
    'nature',           v_jeton.nature,
    'club_id',          v_jeton.club_id,
    'voie_vitesse_id',  v_jeton.voie_vitesse_id,
    'rencontre_id',     v_jeton.rencontre_id
  );
end;
$$;

-- L'anon exécute AVANT signInAnonymously (race possible) ; authenticated = après.
grant execute on function interclub.ouvrir_session_qr(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607231000_session_qr_et_rpc',
  'session_qr (utilisateur_id → jeton_qr_id) + RLS select own + RPC ouvrir_session_qr SECURITY DEFINER (ADR 0001).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202607251000_rls_tables_metier.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202607291000_gabarit_et_voies_epreuve.sql
-- ----------------------------------------------------------------------------
-- Migration : 202607291000_gabarit_et_voies_epreuve
-- Description : gabarit de rencontre par catégorie (spec #3 R29–R37) + tables
--               voie_difficulte et bloc instanciées sur les épreuves + libellé
--               sur voie_vitesse + RPC creer_rencontre_avec_gabarit (copie
--               atomique gabarit → rencontre, R30) + seed des deux gabarits
--               (enfant R33, ado R34).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--               recette, puis prod à la bascule sur `main`.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2, §3, §5.

-- ===========================================================================
-- 1. Tables gabarit — modèle de format configurable par catégorie (R29)
-- ===========================================================================

-- gabarit_epreuve : une ligne par (catégorie, type d'épreuve).
create table if not exists interclub.gabarit_epreuve (
  id         uuid primary key default gen_random_uuid(),
  categorie  text not null check (categorie in ('enfant', 'ado')),
  type       text not null check (type in ('voie', 'bloc', 'vitesse')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categorie, type)
);

-- gabarit_voie_difficulte : voies de difficulté du gabarit.
--   niveau : M1–M4 (moulinette) ou T1–T10 (tête) — contraint en app (R37).
--   Le niveau n'est pas unique : un même niveau peut être doublé/triplé.
create table if not exists interclub.gabarit_voie_difficulte (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  niveau              text not null,
  type_voie           text not null check (type_voie in ('moulinette', 'tete')),
  cotation            text not null,
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_gabarit_voie_diff_epreuve
  on interclub.gabarit_voie_difficulte (gabarit_epreuve_id);

-- gabarit_bloc : blocs du gabarit (B1, B2).
create table if not exists interclub.gabarit_bloc (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  code                text not null,
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (gabarit_epreuve_id, code)
);
create index if not exists idx_gabarit_bloc_epreuve
  on interclub.gabarit_bloc (gabarit_epreuve_id);

-- gabarit_voie_vitesse : voies de vitesse du gabarit (Filles, Garçons).
create table if not exists interclub.gabarit_voie_vitesse (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  libelle             text not null,
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_gabarit_voie_vitesse_epreuve
  on interclub.gabarit_voie_vitesse (gabarit_epreuve_id);

-- ===========================================================================
-- 2. Tables rencontre instanciées (voies de difficulté + blocs)
-- ===========================================================================

-- voie_difficulte : voies de difficulté d'une épreuve de type 'voie'.
--   Alimentée par copie du gabarit à la création (R30) ou ajout post-création
--   (R36). Le niveau n'est pas unique dans l'épreuve (doublé/triplé possible).
create table if not exists interclub.voie_difficulte (
  id          uuid primary key default gen_random_uuid(),
  epreuve_id  uuid not null references interclub.epreuve (id) on delete cascade,
  niveau      text not null,
  type_voie   text not null check (type_voie in ('moulinette', 'tete')),
  cotation    text not null,
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_voie_difficulte_epreuve_id
  on interclub.voie_difficulte (epreuve_id);

-- bloc : blocs d'une épreuve de type 'bloc' (B1, B2, …).
create table if not exists interclub.bloc (
  id          uuid primary key default gen_random_uuid(),
  epreuve_id  uuid not null references interclub.epreuve (id) on delete cascade,
  code        text not null,
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (epreuve_id, code)
);
create index if not exists idx_bloc_epreuve_id
  on interclub.bloc (epreuve_id);

-- ===========================================================================
-- 3. Ajout de libelle sur voie_vitesse (R31/R32)
-- ===========================================================================

alter table interclub.voie_vitesse
  add column if not exists libelle text;

-- ===========================================================================
-- 4. Triggers updated_at
-- ===========================================================================

drop trigger if exists trg_gabarit_epreuve_updated_at on interclub.gabarit_epreuve;
create trigger trg_gabarit_epreuve_updated_at
  before update on interclub.gabarit_epreuve
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_gabarit_voie_diff_updated_at on interclub.gabarit_voie_difficulte;
create trigger trg_gabarit_voie_diff_updated_at
  before update on interclub.gabarit_voie_difficulte
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_gabarit_bloc_updated_at on interclub.gabarit_bloc;
create trigger trg_gabarit_bloc_updated_at
  before update on interclub.gabarit_bloc
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_gabarit_voie_vitesse_updated_at on interclub.gabarit_voie_vitesse;
create trigger trg_gabarit_voie_vitesse_updated_at
  before update on interclub.gabarit_voie_vitesse
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_voie_difficulte_updated_at on interclub.voie_difficulte;
create trigger trg_voie_difficulte_updated_at
  before update on interclub.voie_difficulte
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_bloc_updated_at on interclub.bloc;
create trigger trg_bloc_updated_at
  before update on interclub.bloc
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 5. RLS — activée sur les nouvelles tables (fail-closed)
-- ===========================================================================

alter table interclub.gabarit_epreuve        enable row level security;
alter table interclub.gabarit_voie_difficulte enable row level security;
alter table interclub.gabarit_bloc            enable row level security;
alter table interclub.gabarit_voie_vitesse    enable row level security;
alter table interclub.voie_difficulte         enable row level security;
alter table interclub.bloc                    enable row level security;

-- Gabarit : lecture pour tous les comptes authentifiés, écriture admin seul.
create policy gabarit_epreuve_select_authenticated
  on interclub.gabarit_epreuve for select
  to authenticated using (true);

create policy gabarit_epreuve_all_admin
  on interclub.gabarit_epreuve for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy gabarit_voie_diff_select_authenticated
  on interclub.gabarit_voie_difficulte for select
  to authenticated using (true);

create policy gabarit_voie_diff_all_admin
  on interclub.gabarit_voie_difficulte for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy gabarit_bloc_select_authenticated
  on interclub.gabarit_bloc for select
  to authenticated using (true);

create policy gabarit_bloc_all_admin
  on interclub.gabarit_bloc for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy gabarit_voie_vitesse_select_authenticated
  on interclub.gabarit_voie_vitesse for select
  to authenticated using (true);

create policy gabarit_voie_vitesse_all_admin
  on interclub.gabarit_voie_vitesse for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

-- voie_difficulte / bloc : admin full, lecture en phase résultats publics.
create policy voie_difficulte_all_admin
  on interclub.voie_difficulte for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy voie_difficulte_select_authenticated
  on interclub.voie_difficulte for select
  to authenticated
  using (
    exists (
      select 1 from interclub.epreuve e
      join interclub.rencontre r on r.id = e.rencontre_id
      where e.id = voie_difficulte.epreuve_id
        and r.phase = 'resultats_publics'
    )
    or interclub.est_admin()
  );

create policy bloc_all_admin
  on interclub.bloc for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bloc_select_authenticated
  on interclub.bloc for select
  to authenticated
  using (
    exists (
      select 1 from interclub.epreuve e
      join interclub.rencontre r on r.id = e.rencontre_id
      where e.id = bloc.epreuve_id
        and r.phase = 'resultats_publics'
    )
    or interclub.est_admin()
  );

-- ===========================================================================
-- 6. Grants service_role sur les nouvelles tables (lecture catalogue admin)
-- ===========================================================================

grant usage on schema interclub to service_role;
grant select on interclub.gabarit_epreuve         to service_role;
grant select on interclub.gabarit_voie_difficulte  to service_role;
grant select on interclub.gabarit_bloc             to service_role;
grant select on interclub.gabarit_voie_vitesse     to service_role;
grant select on interclub.voie_difficulte          to service_role;
grant select on interclub.bloc                     to service_role;

-- ===========================================================================
-- 7. RPC creer_rencontre_avec_gabarit — copie atomique gabarit → rencontre
--    (R30 : transaction annulée dans son intégralité si l'une des étapes échoue)
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
  v_ge            record;
begin
  -- Garde : catégorie valide (redondant avec la contrainte SQL, défense en
  -- profondeur côté fonction).
  if p_categorie not in ('enfant', 'ado') then
    raise exception 'Catégorie invalide : %', p_categorie;
  end if;

  -- 1. Créer la rencontre (phase pré-compétition par défaut).
  insert into interclub.rencontre (date_rencontre, club_porteur_id, categorie)
  values (p_date, p_club_porteur, p_categorie)
  returning id into v_rencontre_id;

  -- 2. Copier chaque épreuve du gabarit.
  for v_ge in
    select id, type
    from interclub.gabarit_epreuve
    where categorie = p_categorie
    order by type  -- ordre stable
  loop
    insert into interclub.epreuve (rencontre_id, type)
    values (v_rencontre_id, v_ge.type)
    returning id into v_epreuve_id;

    -- Voies de difficulté
    insert into interclub.voie_difficulte (epreuve_id, niveau, type_voie, cotation, ordre)
    select v_epreuve_id, niveau, type_voie, cotation, ordre
    from interclub.gabarit_voie_difficulte
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Blocs
    insert into interclub.bloc (epreuve_id, code, ordre)
    select v_epreuve_id, code, ordre
    from interclub.gabarit_bloc
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

    -- Voies de vitesse (rattachées à la rencontre, pas à l'épreuve — modèle existant)
    insert into interclub.voie_vitesse (rencontre_id, numero, libelle)
    select
      v_rencontre_id,
      (row_number() over (order by ordre))::int,
      libelle
    from interclub.gabarit_voie_vitesse
    where gabarit_epreuve_id = v_ge.id
    order by ordre;

  end loop;

  return v_rencontre_id;
end;
$$;

-- ===========================================================================
-- 8. Seed — gabarit enfant (R33) et ado (R34)
--    Idempotent : on n'insère que si la ligne n'existe pas encore.
-- ===========================================================================

do $$
declare
  -- gabarit_epreuve IDs
  ge_enfant_voie     uuid;
  ge_enfant_bloc     uuid;
  ge_enfant_vitesse  uuid;
  ge_ado_voie        uuid;
  ge_ado_bloc        uuid;
  ge_ado_vitesse     uuid;
begin

  -- ---- Gabarit enfant ----

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('enfant', 'voie')
  on conflict (categorie, type) do nothing
  returning id into ge_enfant_voie;

  if ge_enfant_voie is null then
    select id into ge_enfant_voie
    from interclub.gabarit_epreuve
    where categorie = 'enfant' and type = 'voie';
  end if;

  -- Voies moulinette enfant : M1–M4
  insert into interclub.gabarit_voie_difficulte
    (gabarit_epreuve_id, niveau, type_voie, cotation, ordre)
  values
    (ge_enfant_voie, 'M1', 'moulinette', '4c',  1),
    (ge_enfant_voie, 'M2', 'moulinette', '5a',  2),
    (ge_enfant_voie, 'M3', 'moulinette', '5b',  3),
    (ge_enfant_voie, 'M4', 'moulinette', '5c',  4),
    -- Voies tête enfant : T1–T10 (cotations règlement CT33 § Matin)
    (ge_enfant_voie, 'T1',  'tete', '4c',   5),
    (ge_enfant_voie, 'T2',  'tete', '5a',   6),
    (ge_enfant_voie, 'T3',  'tete', '5b',   7),
    (ge_enfant_voie, 'T4',  'tete', '5c',   8),
    (ge_enfant_voie, 'T5',  'tete', '6a',   9),
    (ge_enfant_voie, 'T6',  'tete', '6b',  10),
    (ge_enfant_voie, 'T7',  'tete', '6c',  11),
    (ge_enfant_voie, 'T8',  'tete', '7a',  12),
    (ge_enfant_voie, 'T9',  'tete', '7b',  13),
    (ge_enfant_voie, 'T10', 'tete', '7c',  14)
  on conflict do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('enfant', 'bloc')
  on conflict (categorie, type) do nothing
  returning id into ge_enfant_bloc;

  if ge_enfant_bloc is null then
    select id into ge_enfant_bloc
    from interclub.gabarit_epreuve
    where categorie = 'enfant' and type = 'bloc';
  end if;

  insert into interclub.gabarit_bloc (gabarit_epreuve_id, code, ordre)
  values
    (ge_enfant_bloc, 'B1', 1),
    (ge_enfant_bloc, 'B2', 2)
  on conflict (gabarit_epreuve_id, code) do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('enfant', 'vitesse')
  on conflict (categorie, type) do nothing
  returning id into ge_enfant_vitesse;

  if ge_enfant_vitesse is null then
    select id into ge_enfant_vitesse
    from interclub.gabarit_epreuve
    where categorie = 'enfant' and type = 'vitesse';
  end if;

  insert into interclub.gabarit_voie_vitesse (gabarit_epreuve_id, libelle, ordre)
  values
    (ge_enfant_vitesse, 'Filles',  1),
    (ge_enfant_vitesse, 'Garçons', 2)
  on conflict do nothing;

  -- ---- Gabarit ado ----

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('ado', 'voie')
  on conflict (categorie, type) do nothing
  returning id into ge_ado_voie;

  if ge_ado_voie is null then
    select id into ge_ado_voie
    from interclub.gabarit_epreuve
    where categorie = 'ado' and type = 'voie';
  end if;

  -- Voies tête ado : T1–T10 (pas de moulinette, R34/R37 ; cotations § Après-midi)
  insert into interclub.gabarit_voie_difficulte
    (gabarit_epreuve_id, niveau, type_voie, cotation, ordre)
  values
    (ge_ado_voie, 'T1',  'tete', '4c',   1),
    (ge_ado_voie, 'T2',  'tete', '5a',   2),
    (ge_ado_voie, 'T3',  'tete', '5b',   3),
    (ge_ado_voie, 'T4',  'tete', '5c',   4),
    (ge_ado_voie, 'T5',  'tete', '6a',   5),
    (ge_ado_voie, 'T6',  'tete', '6b',   6),
    (ge_ado_voie, 'T7',  'tete', '6c',   7),
    (ge_ado_voie, 'T8',  'tete', '7a',   8),
    (ge_ado_voie, 'T9',  'tete', '7b',   9),
    (ge_ado_voie, 'T10', 'tete', '7c',  10)
  on conflict do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('ado', 'bloc')
  on conflict (categorie, type) do nothing
  returning id into ge_ado_bloc;

  if ge_ado_bloc is null then
    select id into ge_ado_bloc
    from interclub.gabarit_epreuve
    where categorie = 'ado' and type = 'bloc';
  end if;

  insert into interclub.gabarit_bloc (gabarit_epreuve_id, code, ordre)
  values
    (ge_ado_bloc, 'B1', 1),
    (ge_ado_bloc, 'B2', 2)
  on conflict (gabarit_epreuve_id, code) do nothing;

  insert into interclub.gabarit_epreuve (categorie, type)
  values ('ado', 'vitesse')
  on conflict (categorie, type) do nothing
  returning id into ge_ado_vitesse;

  if ge_ado_vitesse is null then
    select id into ge_ado_vitesse
    from interclub.gabarit_epreuve
    where categorie = 'ado' and type = 'vitesse';
  end if;

  insert into interclub.gabarit_voie_vitesse (gabarit_epreuve_id, libelle, ordre)
  values
    (ge_ado_vitesse, 'Filles',  1),
    (ge_ado_vitesse, 'Garçons', 2)
  on conflict do nothing;

end;
$$;

-- ===========================================================================
-- 9. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202607291000_gabarit_et_voies_epreuve',
  'Gabarit de rencontre par catégorie (gabarit_epreuve/voie_difficulte/bloc/voie_vitesse) + tables rencontre voie_difficulte/bloc + libelle voie_vitesse + RPC creer_rencontre_avec_gabarit + seed enfant/ado.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202607311000_points_gabarit_voie_bloc.sql
-- ----------------------------------------------------------------------------
-- Migration : points des voies de difficulté (R38) et paliers de blocs (R39)
-- Spec #3 — « profiter de la configuration des gabarits pour ajouter les points ».
--
-- Périmètre : voies de difficulté (points voie entière + prise valorisée enfant /
-- zones ado) et blocs (paliers de points). Points de vitesse = hors périmètre
-- (itération dédiée, cf. spec §Hors périmètre).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Colonnes de points sur les voies de difficulté (gabarit + rencontre) — R38
-- ===========================================================================

alter table interclub.gabarit_voie_difficulte
  add column if not exists points                    int not null default 0
    check (points >= 0),
  add column if not exists points_prise_valorisee    int
    check (points_prise_valorisee is null or points_prise_valorisee >= 0),
  add column if not exists points_zone1              int
    check (points_zone1 is null or points_zone1 >= 0),
  add column if not exists points_zone2              int
    check (points_zone2 is null or points_zone2 >= 0);

alter table interclub.voie_difficulte
  add column if not exists points                    int not null default 0
    check (points >= 0),
  add column if not exists points_prise_valorisee    int
    check (points_prise_valorisee is null or points_prise_valorisee >= 0),
  add column if not exists points_zone1              int
    check (points_zone1 is null or points_zone1 >= 0),
  add column if not exists points_zone2              int
    check (points_zone2 is null or points_zone2 >= 0);

-- ===========================================================================
-- 2. Tables de paliers de blocs (gabarit + rencontre) — R39
-- ===========================================================================

create table if not exists interclub.gabarit_bloc_palier (
  id               uuid primary key default gen_random_uuid(),
  gabarit_bloc_id  uuid not null
                     references interclub.gabarit_bloc (id) on delete cascade,
  libelle          text not null,
  points           int  not null check (points >= 0),
  ordre            int  not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_gabarit_bloc_palier_bloc
  on interclub.gabarit_bloc_palier (gabarit_bloc_id);

create table if not exists interclub.bloc_palier (
  id          uuid primary key default gen_random_uuid(),
  bloc_id     uuid not null references interclub.bloc (id) on delete cascade,
  libelle     text not null,
  points      int  not null check (points >= 0),
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_bloc_palier_bloc
  on interclub.bloc_palier (bloc_id);

-- ===========================================================================
-- 3. Triggers updated_at
-- ===========================================================================

drop trigger if exists trg_gabarit_bloc_palier_updated_at on interclub.gabarit_bloc_palier;
create trigger trg_gabarit_bloc_palier_updated_at
  before update on interclub.gabarit_bloc_palier
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_bloc_palier_updated_at on interclub.bloc_palier;
create trigger trg_bloc_palier_updated_at
  before update on interclub.bloc_palier
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 4. RLS — paliers (mêmes règles que leur bloc parent)
-- ===========================================================================

alter table interclub.gabarit_bloc_palier enable row level security;
alter table interclub.bloc_palier         enable row level security;

create policy gabarit_bloc_palier_select_authenticated
  on interclub.gabarit_bloc_palier for select
  to authenticated using (true);

create policy gabarit_bloc_palier_all_admin
  on interclub.gabarit_bloc_palier for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bloc_palier_all_admin
  on interclub.bloc_palier for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bloc_palier_select_authenticated
  on interclub.bloc_palier for select
  to authenticated
  using (
    exists (
      select 1
      from interclub.bloc b
      join interclub.epreuve e on e.id = b.epreuve_id
      join interclub.rencontre r on r.id = e.rencontre_id
      where b.id = bloc_palier.bloc_id
        and r.phase = 'resultats_publics'
    )
    or interclub.est_admin()
  );

-- ===========================================================================
-- 5. Grants service_role (lecture catalogue admin)
-- ===========================================================================

grant select on interclub.gabarit_bloc_palier to service_role;
grant select on interclub.bloc_palier          to service_role;

-- ===========================================================================
-- 6. RPC creer_rencontre_avec_gabarit — copie des points et paliers (R30)
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
  if p_categorie not in ('enfant', 'ado') then
    raise exception 'Catégorie invalide : %', p_categorie;
  end if;

  -- 1. Créer la rencontre (phase pré-compétition par défaut).
  insert into interclub.rencontre (date_rencontre, club_porteur_id, categorie)
  values (p_date, p_club_porteur, p_categorie)
  returning id into v_rencontre_id;

  -- 2. Copier chaque épreuve du gabarit.
  for v_ge in
    select id, type
    from interclub.gabarit_epreuve
    where categorie = p_categorie
    order by type
  loop
    insert into interclub.epreuve (rencontre_id, type)
    values (v_rencontre_id, v_ge.type)
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

  end loop;

  return v_rencontre_id;
end;
$$;

-- ===========================================================================
-- 7. Seed — points des voies (R38) et paliers de blocs (R39)
--    Idempotent : UPDATE des points par niveau ; paliers insérés si absents.
-- ===========================================================================

-- Points voies enfant (§ Matin) — par niveau.
update interclub.gabarit_voie_difficulte v
set points = m.pts, points_prise_valorisee = m.pv
from (values
  ('M1', 1, null::int), ('M2', 2, null), ('M3', 3, null), ('M4', 4, null),
  ('T1', 5, 3), ('T2', 6, 3), ('T3', 7, 4), ('T4', 8, 4), ('T5', 9, 5),
  ('T6', 10, 5), ('T7', 11, 6), ('T8', 12, 6), ('T9', 13, 7), ('T10', 14, 8)
) as m(niveau, pts, pv)
where v.niveau = m.niveau
  and v.gabarit_epreuve_id in (
    select id from interclub.gabarit_epreuve where categorie = 'enfant' and type = 'voie'
  );

-- Points voies ado (§ Après-midi) — par niveau (zone1/zone2/voie entière).
update interclub.gabarit_voie_difficulte v
set points = a.pts, points_zone1 = a.z1, points_zone2 = a.z2
from (values
  ('T1', 4, 1, 2), ('T2', 6, 3, 4), ('T3', 8, 5, 6), ('T4', 10, 7, 8),
  ('T5', 12, 9, 10), ('T6', 14, 11, 12), ('T7', 16, 13, 14), ('T8', 18, 15, 16),
  ('T9', 20, 17, 18), ('T10', 22, 19, 20)
) as a(niveau, pts, z1, z2)
where v.niveau = a.niveau
  and v.gabarit_epreuve_id in (
    select id from interclub.gabarit_epreuve where categorie = 'ado' and type = 'voie'
  );

-- Paliers de blocs — enfant (par essai) et ado (par zone).
do $$
declare
  b_enfant_b1 uuid;
  b_enfant_b2 uuid;
  b_ado_b1    uuid;
  b_ado_b2    uuid;
begin
  select gb.id into b_enfant_b1
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'enfant' and ge.type = 'bloc' and gb.code = 'B1';

  select gb.id into b_enfant_b2
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'enfant' and ge.type = 'bloc' and gb.code = 'B2';

  select gb.id into b_ado_b1
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'ado' and ge.type = 'bloc' and gb.code = 'B1';

  select gb.id into b_ado_b2
  from interclub.gabarit_bloc gb
  join interclub.gabarit_epreuve ge on ge.id = gb.gabarit_epreuve_id
  where ge.categorie = 'ado' and ge.type = 'bloc' and gb.code = 'B2';

  -- N'insère que si le bloc n'a pas déjà de paliers (idempotence).
  if b_enfant_b1 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_enfant_b1
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_enfant_b1, '1er essai', 4, 1), (b_enfant_b1, '2e essai', 3, 2);
  end if;

  if b_enfant_b2 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_enfant_b2
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_enfant_b2, '1er essai', 6, 1), (b_enfant_b2, '2e essai', 5, 2),
           (b_enfant_b2, '3e essai', 4, 3);
  end if;

  if b_ado_b1 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_ado_b1
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_ado_b1, 'Zone', 10, 1), (b_ado_b1, 'Bloc complet', 30, 2);
  end if;

  if b_ado_b2 is not null and not exists (
    select 1 from interclub.gabarit_bloc_palier where gabarit_bloc_id = b_ado_b2
  ) then
    insert into interclub.gabarit_bloc_palier (gabarit_bloc_id, libelle, points, ordre)
    values (b_ado_b2, 'Zone 1', 20, 1), (b_ado_b2, 'Zone 2', 40, 2),
           (b_ado_b2, 'Bloc complet', 60, 3);
  end if;
end;
$$;

-- ===========================================================================
-- 8. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202607311000_points_gabarit_voie_bloc',
  'Points des voies de difficulté (voie entière + prise valorisée enfant / zones ado, R38) + paliers de blocs (R39) sur gabarit et rencontre + copie RPC + seed barème CT33.',
  'julleroyfr'
)

;

-- ----------------------------------------------------------------------------
-- archive/202608281000_grants_authenticated_gabarit_structure.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202608281000_grants_authenticated_gabarit_structure
--
-- Objet : corriger un oubli de GRANT dans les migrations 202607291000
--         (gabarit + voie_difficulte/bloc) et 202607311000 (paliers). Ces
--         migrations ont créé les tables, activé la RLS et posé les policies
--         (`*_all_admin` en écriture, `*_select_authenticated` en lecture) mais
--         n'ont accordé de privilèges qu'au rôle `service_role` (SELECT). Le
--         rôle `authenticated` n'ayant AUCUN grant, PostgREST renvoie
--         « permission denied » AVANT même l'évaluation de la RLS : la frontière
--         d'écriture `*_all_admin` (with check est_admin()) est donc inopérante.
--
-- Effet : l'ajout de voies/blocs/paliers au gabarit (écran /admin/gabarit) et à
--         une rencontre (écran /admin/rencontres/[id], spec #3 R36/R43) échouait
--         silencieusement. La lecture reste faite via `service_role` derrière la
--         garde admin (ADR 0003) ; l'écriture passe par la RLS/`authenticated`
--         (vraie frontière), comme pour les tables socle — d'où ces grants.
--
-- Idempotent : les GRANT sont réappliquables sans effet de bord.
-- ===========================================================================

-- Écriture (et lecture, scopée par les policies `*_select_authenticated`)
-- ouverte au rôle `authenticated` ; la RLS `*_all_admin` reste la frontière.
grant select, insert, update, delete on interclub.gabarit_epreuve         to authenticated;
grant select, insert, update, delete on interclub.gabarit_voie_difficulte to authenticated;
grant select, insert, update, delete on interclub.gabarit_bloc            to authenticated;
grant select, insert, update, delete on interclub.gabarit_bloc_palier     to authenticated;
grant select, insert, update, delete on interclub.gabarit_voie_vitesse    to authenticated;

grant select, insert, update, delete on interclub.voie_difficulte         to authenticated;
grant select, insert, update, delete on interclub.bloc                    to authenticated;
grant select, insert, update, delete on interclub.bloc_palier             to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202608281000_grants_authenticated_gabarit_structure',
  'Grants authenticated (select/insert/update/delete) sur les tables gabarit_* et voie_difficulte/bloc/bloc_palier — oubli des migrations 202607291000/202607311000, la RLS *_all_admin devient effective (écriture admin via RLS, ADR 0003).',
  'julleroyfr'
)

;

-- ----------------------------------------------------------------------------
-- archive/202609011000_phase_cloture.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609011000_phase_cloture
--
-- Objet : le cycle de vie d'une rencontre passe de 3 à 4 phases (spec #1 R5,
--         rév. 2026-09-01). Insertion d'une phase « clôture » entre la
--         compétition et les résultats publics : compétition terminée, l'admin
--         vérifie/corrige la saisie ; les résultats ne sont pas encore publics.
--
-- Effet : élargit la contrainte CHECK de `rencontre.phase`. Aucune donnée
--         existante n'est modifiée (les valeurs actuelles restent valides) ;
--         l'ordre du cycle est porté côté domaine (`src/domaine/rencontre.ts`).
--
-- Écritures en clôture : aucune nouvelle policy nécessaire. L'admin écrit sans
--         gating de phase (policies `est_admin()`), tandis que coachs et juges
--         restent bornés à la phase ② compétition (helpers `= 'competition'`),
--         donc automatiquement exclus de la clôture.
--
-- Idempotent : drop-if-exists puis re-création de la contrainte nommée.
-- ===========================================================================

alter table interclub.rencontre
  drop constraint if exists rencontre_phase_check;

alter table interclub.rencontre
  add constraint rencontre_phase_check
  check (phase in ('pre_competition', 'competition', 'cloture', 'resultats_publics'));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609011000_phase_cloture',
  'Cycle de vie à 4 phases : ajout de « cloture » entre compétition et résultats publics (spec #1 R5, rév. 2026-09-01). Élargit le CHECK de rencontre.phase ; admin seul écrit en clôture (gating existant inchangé).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609011100_composition_engagement.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609011100_composition_engagement
--
-- Objet : deux évolutions de `interclub.composition` pour l'espace coach
--         (spec #5) :
--   1. R14 — un grimpeur ne peut appartenir qu'à UNE équipe par rencontre.
--      La PK (equipe_id, grimpeur_id) ne borne qu'au sein d'une équipe. On
--      dénormalise `rencontre_id` (rempli par trigger depuis `equipe`, cohérence
--      garantie) et on pose `unique (rencontre_id, grimpeur_id)`.
--   2. R19 — groupe de départ (rencontres enfant) : colonne `groupe_depart`
--      NULLABLE (optionnel, sans objet pour l'ado). Valeurs = niveaux de départ
--      M1–M4 / T1–T8 (T9/T10 exclus, ne laissent pas 3 voies croissantes, R20).
--
-- Écriture du groupe de départ : édition possible après l'ajout (« à définir »
--         puis complété). On accorde donc un GRANT UPDATE **colonne**
--         `groupe_depart` seulement + une policy `composition_update`. Comme
--         `peut_ecrire_composition` s'appuie sur `peut_ecrire_equipe`,
--         l'écriture reste bornée au coach permanent en phase ① (ou admin) —
--         cohérent avec le gel de l'engagement (voir migration RLS suivante).
--
-- Idempotent : add-column-if-not-exists, drop-if-exists des contraintes/policy/
--         trigger avant (re)création, create-index-if-not-exists.
--
-- ⚠ Pré-requis données : la contrainte d'unicité échoue si un grimpeur figure
--    déjà dans 2 équipes d'une même rencontre. Corriger les données avant.
-- ===========================================================================

-- --- 1. Dénormalisation rencontre_id + unicité (R14) -----------------------

alter table interclub.composition
  add column if not exists rencontre_id uuid;

-- Trigger : rencontre_id est TOUJOURS dérivé de l'équipe (jamais saisi).
create or replace function interclub.composition_set_rencontre_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.rencontre_id
    into new.rencontre_id
    from interclub.equipe e
   where e.id = new.equipe_id;
  return new;
end;
$$;

drop trigger if exists trg_composition_rencontre_id on interclub.composition;
create trigger trg_composition_rencontre_id
  before insert or update of equipe_id on interclub.composition
  for each row execute function interclub.composition_set_rencontre_id();

-- Reprise des lignes existantes puis passage NOT NULL.
update interclub.composition c
   set rencontre_id = e.rencontre_id
  from interclub.equipe e
 where e.id = c.equipe_id
   and c.rencontre_id is distinct from e.rencontre_id;

alter table interclub.composition
  alter column rencontre_id set not null;

alter table interclub.composition
  drop constraint if exists composition_rencontre_id_fkey;
alter table interclub.composition
  add constraint composition_rencontre_id_fkey
  foreign key (rencontre_id) references interclub.rencontre (id) on delete cascade;

create index if not exists idx_composition_rencontre_id
  on interclub.composition (rencontre_id);

-- R14 : un grimpeur = une seule équipe par rencontre.
alter table interclub.composition
  drop constraint if exists composition_rencontre_grimpeur_key;
alter table interclub.composition
  add constraint composition_rencontre_grimpeur_key
  unique (rencontre_id, grimpeur_id);

-- --- 2. Groupe de départ (R19) ---------------------------------------------

alter table interclub.composition
  add column if not exists groupe_depart text;

-- Vocabulaire des niveaux de DÉPART (défense en profondeur ; la pertinence
-- « enfant uniquement » est portée par le domaine + Server Action). T9/T10 exclus.
alter table interclub.composition
  drop constraint if exists composition_groupe_depart_check;
alter table interclub.composition
  add constraint composition_groupe_depart_check
  check (
    groupe_depart is null
    or groupe_depart in (
      'M1', 'M2', 'M3', 'M4',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'
    )
  );

-- Édition du seul groupe de départ (colonne) par le coach, bornée par la RLS.
grant update (groupe_depart) on interclub.composition to authenticated;

drop policy if exists "composition_update" on interclub.composition;
create policy "composition_update" on interclub.composition for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_composition(equipe_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_composition(equipe_id, grimpeur_id));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609011100_composition_engagement',
  'composition : rencontre_id dénormalisé (trigger depuis equipe) + unique(rencontre_id, grimpeur_id) (R14, un grimpeur = 1 équipe/rencontre) ; colonne groupe_depart nullable + check M1–M4/T1–T8 (R19) + grant update(groupe_depart) et policy composition_update (spec #5).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609011300_phase_preparation.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609011300_phase_preparation
--
-- Objet : insérer une phase « préparation » entre pré-compétition et compétition
--         (spec #1 R5, rév. 2026-09-01). Cette phase, activée par l'admin le
--         **jour J** (garde-fou date porté par l'application), ouvre l'édition de
--         l'engagement au coach **temporaire** aux côtés du permanent. Le cycle
--         passe à 5 phases : pre_competition → preparation → competition →
--         cloture → resultats_publics.
--
-- Effet : élargit la contrainte CHECK de `rencontre.phase`. Aucune donnée
--         existante modifiée ; l'ordre du cycle est porté côté domaine
--         (`src/domaine/rencontre.ts`).
--
-- Idempotent : drop-if-exists puis re-création de la contrainte nommée.
-- ===========================================================================

alter table interclub.rencontre
  drop constraint if exists rencontre_phase_check;

alter table interclub.rencontre
  add constraint rencontre_phase_check
  check (phase in (
    'pre_competition', 'preparation', 'competition', 'cloture', 'resultats_publics'
  ));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609011300_phase_preparation',
  'Cycle à 5 phases : ajout de « preparation » (jour J) entre pré-compétition et compétition (spec #1 R5, rév. 2026-09-01). Élargit le CHECK de rencontre.phase.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609011400_rls_engagement_preparation.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609011400_rls_engagement_preparation
--
-- Objet : câbler les droits du coach temporaire sur le nouveau modèle « jour J »
--         (spec #1 R6/R9/R27, spec #5 R16, rév. 2026-09-01). Remplace la
--         migration de « gel » (202609011200, supprimée) par le modèle définitif :
--
--   - Session temporaire « du jour » = phases `preparation` OU `competition`.
--   - ENGAGEMENT (équipes/compositions/groupes) éditable :
--       * coach PERMANENT en `pre_competition` OU `preparation` ;
--       * coach TEMPORAIRE en `preparation` uniquement (droits identiques au
--         permanent le jour J) ;
--       * gelé dès `competition` (admin seul, via les policies `est_admin()`).
--   - RÉSULTATS (resultat/temps_vitesse) : inchangés, gatés en `competition`
--     (helper `est_coach_temp_de` conservé phase compétition).
--
-- Points d'attention :
--   * `est_coach_temp_de` (compétition) N'EST PAS élargi : sinon les résultats
--     s'ouvriraient en préparation. On introduit des helpers dédiés.
--   * `peut_ecrire_composition` est inchangée : elle s'appuie sur
--     `peut_ecrire_equipe`, donc hérite de la nouvelle fenêtre.
--
-- Idempotent : `create or replace function` + `grant` réappliquables.
-- ===========================================================================

-- Session temporaire ACTIVE « du jour » (préparation OU compétition) — sert aux
-- LECTURES de périmètre (roster, compositions). Révoquée dès la clôture.
create or replace function interclub.est_coach_temp_actif_club(p_club uuid)
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
      and j.nature = 'coach_temporaire'
      and j.club_id = p_club
      and r.phase in ('preparation', 'competition')
  );
$$;

-- Droit du coach temporaire d'ÉDITER L'ENGAGEMENT d'une rencontre : session
-- active pour ce club ET rencontre EN PHASE `preparation` (jour J) uniquement.
create or replace function interclub.est_coach_temp_engagement(p_club uuid, p_rencontre uuid)
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
      and j.nature = 'coach_temporaire'
      and j.club_id = p_club
      and r.id = p_rencontre
      and r.phase = 'preparation'
  );
$$;

-- LECTURE de périmètre : coach permanent de ce club, OU coach temporaire actif le
-- jour J (préparation/compétition). Élargit l'ancienne définition (qui bornait le
-- temporaire à la compétition) pour lui permettre de préparer l'engagement.
create or replace function interclub.est_coach_de_club(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select interclub.club_courant() = p_club
      or interclub.est_coach_temp_actif_club(p_club);
$$;

-- Droit d'ÉCRITURE sur l'engagement (equipe) — hors admin :
--   coach PERMANENT du club en `pre_competition` OU `preparation`,
--   OU coach TEMPORAIRE en `preparation` (jour J).
-- Gelé dès `competition` : seul l'admin (policies `est_admin()`) corrige alors.
create or replace function interclub.peut_ecrire_equipe(p_club uuid, p_rencontre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (interclub.club_courant() = p_club
          and interclub.phase_de_rencontre(p_rencontre) in ('pre_competition', 'preparation'))
      or interclub.est_coach_temp_engagement(p_club, p_rencontre);
$$;

grant execute on function interclub.est_coach_temp_actif_club(uuid)          to authenticated;
grant execute on function interclub.est_coach_temp_engagement(uuid, uuid)    to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609011400_rls_engagement_preparation',
  'Droits jour J du coach temporaire : helpers est_coach_temp_actif_club (lecture, préparation/compétition) et est_coach_temp_engagement (préparation) ; est_coach_de_club élargi ; peut_ecrire_equipe = permanent en pre_competition/preparation OU temporaire en preparation (spec #1 R6/R27, spec #5 R16). Résultats inchangés (compétition).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609011500_session_qr_coach_temp_prepa.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609011500_session_qr_coach_temp_prepa
--
-- Objet : rendre le coach temporaire opérationnel le jour J (spec #5 R16,
--         spec #2 R12, rév. 2026-09-01). Deux évolutions des surfaces
--         SECURITY DEFINER des sessions QR :
--
--   1. `ouvrir_session_qr` — validité de la fenêtre désormais NATURE-DÉPENDANTE
--      (spec #2 R12) : un jeton « coach temporaire » ouvre une session en
--      phase `preparation` OU `competition` (le jour J) ; un jeton « juge »
--      reste borné à `competition`. Auparavant l'ouverture exigeait
--      `competition` pour toute nature, ce qui empêchait le coach temporaire
--      de préparer l'engagement en `preparation`.
--
--   2. `contexte_coach_temporaire()` — NOUVELLE RPC de lecture : renvoie le
--      périmètre (club + rencontre) de la session temporaire active de
--      l'utilisateur courant, pour que la couche applicative (Next) puisse
--      autoriser l'espace coach et l'édition. Nécessaire car l'anonyme ne peut
--      PAS lire `jeton_qr` directement (policy `jeton_qr` = admin ou coach
--      permanent du club via `club_courant()`, NULL pour un anonyme).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Idempotent : `create or replace` + `grant` réappliquables.
-- Réf. : docs/specs/02-authentification-et-sessions-qr.md R12,
--         docs/specs/05-espace-coach.md R16, ADR 0001.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. ouvrir_session_qr — fenêtre nature-dépendante (spec #2 R12).
--    Remplace la version 202607231000 (exigeait `competition` pour toute nature).
-- ---------------------------------------------------------------------------
create or replace function interclub.ouvrir_session_qr(p_valeur uuid)
returns jsonb
language plpgsql
security definer
set search_path = interclub, public
as $$
declare
  v_jeton     interclub.jeton_qr%rowtype;
  v_rencontre interclub.rencontre%rowtype;
begin
  -- Retrouver le jeton par son secret (valeur unique non devinable).
  select * into v_jeton
    from interclub.jeton_qr
   where valeur = p_valeur;

  if not found then
    raise exception 'jeton_inconnu' using errcode = 'P0001';
  end if;

  -- R22 : jeton révoqué → aucune session.
  if not v_jeton.actif then
    raise exception 'jeton_revoque' using errcode = 'P0002';
  end if;

  -- R12 : hors de la fenêtre du jeton → aucune session. La fenêtre dépend de la
  -- NATURE : coach temporaire = préparation OU compétition (le jour J) ; juge =
  -- compétition uniquement.
  select * into v_rencontre
    from interclub.rencontre
   where id = v_jeton.rencontre_id;

  if v_jeton.nature = 'coach_temporaire' then
    if v_rencontre.phase not in ('preparation', 'competition') then
      raise exception 'hors_fenetre' using errcode = 'P0003';
    end if;
  else
    -- Juge (et toute autre nature future non prévue) : compétition seule.
    if v_rencontre.phase <> 'competition' then
      raise exception 'hors_fenetre' using errcode = 'P0003';
    end if;
  end if;

  -- Ouvrir la session : lier cet utilisateur anonyme au jeton.
  insert into interclub.session_qr (utilisateur_id, jeton_qr_id)
  values (auth.uid(), v_jeton.id);

  -- Retourner rôle + périmètre (snake_case pour correspondre à la convention SQL).
  return jsonb_build_object(
    'nature',           v_jeton.nature,
    'club_id',          v_jeton.club_id,
    'voie_vitesse_id',  v_jeton.voie_vitesse_id,
    'rencontre_id',     v_jeton.rencontre_id
  );
end;
$$;

grant execute on function interclub.ouvrir_session_qr(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. contexte_coach_temporaire — périmètre de la session temporaire active de
--    l'utilisateur courant, pour la garde applicative (spec #5 R16).
--    SECURITY DEFINER : contourne la RLS `jeton_qr` (inaccessible à l'anonyme).
--    Ne renvoie une ligne que si la session est « du jour » (préparation OU
--    compétition) et le jeton actif — révoquée/close ⇒ NULL (fail-closed).
--    À la scan multiple, on retient la session la plus récente.
-- ---------------------------------------------------------------------------
create or replace function interclub.contexte_coach_temporaire()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'club_id',      j.club_id,
    'rencontre_id', j.rencontre_id,
    'phase',        r.phase
  )
  from interclub.session_qr s
  join interclub.jeton_qr   j on j.id = s.jeton_qr_id
  join interclub.rencontre  r on r.id = j.rencontre_id
  where s.utilisateur_id = auth.uid()
    and j.actif
    and j.nature = 'coach_temporaire'
    and r.phase in ('preparation', 'competition')
  order by s.created_at desc
  limit 1;
$$;

grant execute on function interclub.contexte_coach_temporaire() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609011500_session_qr_coach_temp_prepa',
  'ouvrir_session_qr : fenêtre nature-dépendante (coach temp = préparation/compétition, juge = compétition ; spec #2 R12) ; nouvelle RPC contexte_coach_temporaire() (club+rencontre de la session temporaire active) pour la garde applicative (spec #5 R16).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609020900_rls_grimpeur_prete_lisible.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- RLS : lecture du grimpeur PRÊTÉ par le coach d'accueil (spec #5 R13)
-- ---------------------------------------------------------------------------
-- Problème : `grimpeur_select` (migration 202607251000) n'autorise le coach qu'à
-- lire les grimpeurs de SON club (`est_coach_de_club(club_id)`). Un grimpeur
-- prêté d'un autre club (R35), une fois rattaché par l'admin à une équipe
-- d'accueil, n'est donc PAS lisible par le coach d'accueil : son nom s'affiche
-- « (inconnu) » et le badge « Prêté » disparaît (loader getEngagementRencontre).
--
-- Correctif : élargir la LECTURE (pas l'écriture) — un grimpeur est aussi visible
-- s'il est composé dans une équipe d'un club que l'appelant coache. Le prêt reste
-- réservé à l'admin (policies d'écriture inchangées, R35). Même logique que
-- peut_ecrire_resultat/voit_resultat : le périmètre du prêté se joue via la
-- composition, pas via grimpeur.club_id (R36).
-- ===========================================================================

-- Helper SECURITY DEFINER (contourne la RLS de composition/equipe → pas de
-- récursion sur grimpeur_select), calqué sur voit_composition.
create or replace function interclub.voit_grimpeur_via_engagement(p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.composition c
    join interclub.equipe       e on e.id = c.equipe_id
    where c.grimpeur_id = p_grimpeur
      and interclub.est_coach_de_club(e.club_id)
  );
$$;

-- Élargit la lecture ; admin et coach-de-son-club inchangés.
drop policy if exists "grimpeur_select" on interclub.grimpeur;
create policy "grimpeur_select" on interclub.grimpeur for select
  to authenticated
  using (
    interclub.est_admin()
    or interclub.est_coach_de_club(club_id)
    or interclub.voit_grimpeur_via_engagement(id)
  );

-- ===========================================================================
-- RLS : GESTION d'un grimpeur PRÊTÉ par le coach d'accueil — groupe de départ
--       (UPDATE, R19-R21) et retrait (DELETE, R36)
-- ---------------------------------------------------------------------------
-- Même racine que ci-dessus : `composition_update` et `composition_delete`
-- s'appuyaient sur `peut_ecrire_composition`, qui exige
-- `grimpeur.club_id = equipe.club_id`. Le coach d'accueil ne pouvait donc ni
-- définir le groupe de départ d'un prêté (le PATCH passait mais touchait 0 ligne
-- → le select revenait à « à définir »), ni le retirer (R36). L'INSERT reste, lui,
-- sur `peut_ecrire_composition` (le rattachement cross-club demeure admin, R35).
--
-- Correctif : la gestion d'une composition existante (groupe, retrait) dépend de
-- l'ÉQUIPE D'ACCUEIL (peut_ecrire_equipe, qui porte le gating de phase), pas du
-- club du grimpeur → couvre membre propre ET prêté, en phase d'édition seulement
-- (gel R16/R17 préservé).
-- ===========================================================================

create or replace function interclub.peut_gerer_composition_equipe(p_equipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.equipe e
    where e.id = p_equipe
      and interclub.peut_ecrire_equipe(e.club_id, e.rencontre_id)
  );
$$;

-- UPDATE (groupe de départ) : lié à l'équipe d'accueil (couvre le prêté, R19-R21).
drop policy if exists "composition_update" on interclub.composition;
create policy "composition_update" on interclub.composition for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_gerer_composition_equipe(equipe_id))
  with check (interclub.est_admin() or interclub.peut_gerer_composition_equipe(equipe_id));

-- DELETE (retrait) : idem — couvre le retrait d'un prêté (R36).
drop policy if exists "composition_delete" on interclub.composition;
create policy "composition_delete" on interclub.composition for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_gerer_composition_equipe(equipe_id));

-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609020900_rls_grimpeur_prete_lisible',
  'Grimpeur prêté géré par le coach d''accueil : grimpeur_select élargi (voit_grimpeur_via_engagement, lecture du nom, R13) + composition_update/_delete sur peut_gerer_composition_equipe (équipe d''accueil + gating de phase : groupe de départ R19-R21 et retrait R36). INSERT cross-club inchangé (admin, R35). Spec #5.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609021000_pret_grimpeur.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- Prêt de grimpeur : relation PERSISTANTE distincte de l'affectation en équipe
-- (spec #1 R35/R36, spec #5 R12/R13, rév. 2026-09-02)
-- ---------------------------------------------------------------------------
-- Le prêt exprime « ce grimpeur (d'un autre club) est mis à disposition du club
-- d'accueil pour cette rencontre ». Créé/révoqué par l'ADMIN seul (R35). Tant
-- qu'il est actif, le coach d'accueil gère le grimpeur comme les siens : il
-- l'affecte / le retire / le déplace entre ses équipes (R36) — le retrait ne met
-- PAS fin au prêt. On garde AUSSI le chemin direct admin (insertion en équipe
-- d'un cross-club sans prêt) : les deux coexistent.
-- ===========================================================================

create table if not exists interclub.pret (
  rencontre_id    uuid not null references interclub.rencontre(id) on delete cascade,
  grimpeur_id     uuid not null references interclub.grimpeur(id)  on delete cascade,
  club_accueil_id uuid not null references interclub.club(id),
  -- Un grimpeur est prêté à au plus un club par rencontre.
  primary key (rencontre_id, grimpeur_id)
);

alter table interclub.pret enable row level security;
grant select, insert, update, delete on interclub.pret to authenticated;
-- Lecture des catalogues par les écrans admin via service_role (ADR 0002/0003) :
-- l'écran de gestion des prêts liste prêts et grimpeurs (tous clubs).
grant select on interclub.pret to service_role;
grant select on interclub.grimpeur to service_role;
-- L'écran de prêts exclut les grimpeurs déjà engagés (R14) : lecture composition.
grant select on interclub.composition to service_role;

-- RLS pret : lecture admin + coach du club d'accueil (pour peupler son roster) ;
-- écriture réservée à l'admin (R35).
drop policy if exists "pret_select" on interclub.pret;
create policy "pret_select" on interclub.pret for select
  to authenticated
  using (interclub.est_admin() or interclub.est_coach_de_club(club_accueil_id));

drop policy if exists "pret_insert" on interclub.pret;
create policy "pret_insert" on interclub.pret for insert
  to authenticated with check (interclub.est_admin());

drop policy if exists "pret_update" on interclub.pret;
create policy "pret_update" on interclub.pret for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

drop policy if exists "pret_delete" on interclub.pret;
create policy "pret_delete" on interclub.pret for delete
  to authenticated using (interclub.est_admin());

-- --- Lecture d'un grimpeur PRÊTÉ à un club que je coache (roster, avant même -
--     toute composition). Complète voit_grimpeur_via_engagement (202609020900).
create or replace function interclub.voit_grimpeur_via_pret(p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.pret p
    where p.grimpeur_id = p_grimpeur
      and interclub.est_coach_de_club(p.club_accueil_id)
  );
$$;

drop policy if exists "grimpeur_select" on interclub.grimpeur;
create policy "grimpeur_select" on interclub.grimpeur for select
  to authenticated
  using (
    interclub.est_admin()
    or interclub.est_coach_de_club(club_id)
    or interclub.voit_grimpeur_via_engagement(id)
    or interclub.voit_grimpeur_via_pret(id)
  );

-- --- Le coach peut ENGAGER un grimpeur prêté à son club dans une équipe qu'il --
--     peut éditer (R36 + gating de phase). L'INSERT reste refusé pour un
--     cross-club SANS prêt (R13) ; le chemin admin direct passe par est_admin().
create or replace function interclub.peut_engager_prete(p_equipe uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.equipe e
    join interclub.pret   p
      on p.rencontre_id = e.rencontre_id
     and p.grimpeur_id  = p_grimpeur
     and p.club_accueil_id = e.club_id
    where e.id = p_equipe
      and interclub.peut_ecrire_equipe(e.club_id, e.rencontre_id)
  );
$$;

drop policy if exists "composition_insert" on interclub.composition;
create policy "composition_insert" on interclub.composition for insert
  to authenticated
  with check (
    interclub.est_admin()
    or interclub.peut_ecrire_composition(equipe_id, grimpeur_id)
    or interclub.peut_engager_prete(equipe_id, grimpeur_id)
  );

-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609021000_pret_grimpeur',
  'Table pret (rencontre, grimpeur, club_accueil) = prêt persistant, écriture admin (R35) + lecture coach d''accueil. grimpeur_select élargi (voit_grimpeur_via_pret : roster). composition_insert élargi (peut_engager_prete : le coach affecte un prêté à son équipe, R36). Grants service_role select sur pret+grimpeur+composition (écran admin de prêts, ADR 0002/0003 ; exclusion des grimpeurs déjà engagés). Chemin admin direct conservé. Spec #1 R35/R36, spec #5 R12/R13.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609051000_invitation_coach.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202609081000_saisie_resultats_voie_bloc.sql
-- ----------------------------------------------------------------------------
-- Migration : 202609081000_saisie_resultats_voie_bloc
-- Description : modèle réel de la SAISIE DES RÉSULTATS (spec #6). Remplace le
--               placeholder `interclub.resultat` (valeur text, jamais utilisé) par
--               deux tables dédiées :
--                 - resultat_voie (issue par voie de difficulté × grimpeur, R8–R14) ;
--                 - resultat_bloc (palier atteint par bloc × grimpeur, R15–R17).
--               + helpers d'écriture voie/bloc (réutilisent peut_ecrire_resultat,
--               T6 : permanent OU temporaire en phase ③ compétition, via
--               composition → couvre le grimpeur prêté, R36) ;
--               + LECTURE des résultats et de la structure (voies/blocs/paliers)
--               ouverte à TOUT compte authentifié, tous clubs confondus, DÈS la
--               phase ③ (R6/R8, rév. spec #1 2026-09-08). La phase ⑤ ne change pas
--               la visibilité : elle officialise (fige) — hors de cette migration.
-- Hors périmètre de cette migration (itérations dédiées) :
--   - Accès `anon` (visiteur NON authentifié) : le DROIT de lecture publique dès
--     la ③ est acté (spec #1 R8), mais la surface publique concrète (route + grants
--     `anon`) relève d'une itération dédiée. Ici : lecture `authenticated` seule.
--   - NP automatique à la clôture (R18) : matérialisé côté application dans
--     l'action `changerPhaseRencontre` (③→④) via le domaine `manquantsCloture` +
--     `voiesDuGroupeDepart` (pas de duplication de l'échelle des niveaux en SQL).
--     La colonne `issue` accepte déjà 'np' pour ces insertions (admin).
-- Sources : docs/specs/06-saisie-des-resultats.md ; spec #1 R8 (rév. 2026-09-08) ;
--           spec #3 R38/R39 (points/paliers) ; T6 (202607251000, helpers).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ===========================================================================
-- 1. Retrait du placeholder `resultat` (non utilisé par le code applicatif).
--    CASCADE retire ses policies (resultat_*) et dépendances. `temps_vitesse`
--    (vitesse, juge) est CONSERVÉE : hors périmètre spec #6.
-- ===========================================================================
drop table if exists interclub.resultat cascade;

-- ===========================================================================
-- 2. Tables de résultats voie / bloc.
-- ===========================================================================

-- resultat_voie : une issue par (voie de difficulté, grimpeur) — R8/R13.
--   Meilleure tentative, pas de cumul. Cohérence issue ↔ catégorie/type de voie
--   (R10/R12) garantie par trigger (nécessite des jointures : hors d'un CHECK).
create table if not exists interclub.resultat_voie (
  id                 uuid primary key default gen_random_uuid(),
  voie_difficulte_id uuid not null
                       references interclub.voie_difficulte (id) on delete cascade,
  grimpeur_id        uuid not null
                       references interclub.grimpeur (id) on delete cascade,
  issue              text not null
                       check (issue in ('top', 'prise_valorisee', 'zone1', 'zone2', 'echec', 'np')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (voie_difficulte_id, grimpeur_id)          -- R13 : une réalisation par voie
);
create index if not exists idx_resultat_voie_voie
  on interclub.resultat_voie (voie_difficulte_id);
create index if not exists idx_resultat_voie_grimpeur
  on interclub.resultat_voie (grimpeur_id);

-- resultat_bloc : une issue par (bloc, grimpeur) — R15/R17.
--   `palier_id` = meilleur palier atteint (R16), requis SSI issue = 'palier'.
--   Appartenance du palier au bloc garantie par trigger (jointure).
create table if not exists interclub.resultat_bloc (
  id           uuid primary key default gen_random_uuid(),
  bloc_id      uuid not null references interclub.bloc (id) on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  issue        text not null check (issue in ('palier', 'echec', 'np')),
  palier_id    uuid references interclub.bloc_palier (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (bloc_id, grimpeur_id),                    -- R17 : un résultat par bloc
  check ((issue = 'palier') = (palier_id is not null))  -- R16 : palier ⇔ palier_id
);
create index if not exists idx_resultat_bloc_bloc
  on interclub.resultat_bloc (bloc_id);
create index if not exists idx_resultat_bloc_grimpeur
  on interclub.resultat_bloc (grimpeur_id);

-- ===========================================================================
-- 3. Triggers : updated_at + validations métier (R10/R12/R16).
-- ===========================================================================

drop trigger if exists trg_resultat_voie_updated_at on interclub.resultat_voie;
create trigger trg_resultat_voie_updated_at
  before update on interclub.resultat_voie
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_resultat_bloc_updated_at on interclub.resultat_bloc;
create trigger trg_resultat_bloc_updated_at
  before update on interclub.resultat_bloc
  for each row execute function interclub.set_updated_at();

-- Cohérence issue ↔ catégorie / type de voie (R10/R12) :
--   - 'prise_valorisee' : voies TÊTE ENFANT uniquement ;
--   - 'zone1' / 'zone2' : catégorie ADO uniquement.
--   ('top', 'echec', 'np' : admises partout.)
create or replace function interclub.valider_resultat_voie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
  v_type_voie text;
begin
  select r.categorie, vd.type_voie
    into v_categorie, v_type_voie
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = new.voie_difficulte_id;

  if new.issue = 'prise_valorisee'
     and not (v_categorie = 'enfant' and v_type_voie = 'tete') then
    raise exception
      'Issue « prise_valorisee » réservée aux voies tête enfant (R10).';
  end if;

  if new.issue in ('zone1', 'zone2') and v_categorie <> 'ado' then
    raise exception
      'Issues « zone1 »/« zone2 » réservées à la catégorie ado (R12).';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_resultat_voie_valider on interclub.resultat_voie;
create trigger trg_resultat_voie_valider
  before insert or update on interclub.resultat_voie
  for each row execute function interclub.valider_resultat_voie();

-- Appartenance du palier au bloc (R16) : le palier référencé doit être un palier
-- de CE bloc.
create or replace function interclub.valider_resultat_bloc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.palier_id is not null
     and not exists (
       select 1 from interclub.bloc_palier bp
       where bp.id = new.palier_id and bp.bloc_id = new.bloc_id
     ) then
    raise exception 'Le palier choisi doit appartenir au bloc (R16).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resultat_bloc_valider on interclub.resultat_bloc;
create trigger trg_resultat_bloc_valider
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.valider_resultat_bloc();

-- ===========================================================================
-- 4. Helpers de périmètre (SECURITY DEFINER) — écriture et lecture.
--    Réutilisent peut_ecrire_resultat(epreuve, grimpeur) (T6 : permanent en ③
--    compétition OU coach temporaire, via composition — couvre le prêté R36).
-- ===========================================================================

-- Résultats consultables : la rencontre a atteint la ③ compétition (ou au-delà).
-- Avant la ③, aucun résultat n'existe ; la ⑤ ne change que le caractère officiel.
create or replace function interclub.resultats_visibles(p_rencontre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select interclub.phase_de_rencontre(p_rencontre)
         in ('competition', 'cloture', 'resultats_publics');
$$;

-- Écriture d'un résultat de voie : droit de saisie sur l'épreuve de la voie.
create or replace function interclub.peut_ecrire_resultat_voie(p_voie uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.voie_difficulte vd
    where vd.id = p_voie
      and interclub.peut_ecrire_resultat(vd.epreuve_id, p_grimpeur)
  );
$$;

-- Lecture d'un résultat de voie : rencontre de la voie en phase ③+ (public
-- authentifié, tous clubs — R6/R8).
create or replace function interclub.resultat_voie_lisible(p_voie uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.voie_difficulte vd
    join interclub.epreuve e on e.id = vd.epreuve_id
    where vd.id = p_voie
      and interclub.resultats_visibles(e.rencontre_id)
  );
$$;

-- Écriture d'un résultat de bloc.
create or replace function interclub.peut_ecrire_resultat_bloc(p_bloc uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.bloc b
    where b.id = p_bloc
      and interclub.peut_ecrire_resultat(b.epreuve_id, p_grimpeur)
  );
$$;

-- Lecture d'un résultat de bloc : rencontre du bloc en phase ③+.
create or replace function interclub.resultat_bloc_lisible(p_bloc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.bloc b
    join interclub.epreuve e on e.id = b.epreuve_id
    where b.id = p_bloc
      and interclub.resultats_visibles(e.rencontre_id)
  );
$$;

-- ===========================================================================
-- 5. Grants (authenticated) — la RLS reste la frontière. `anon` : différé
--    (itération surface publique). `service_role` conserve ses accès admin.
-- ===========================================================================
grant select, insert, update, delete on interclub.resultat_voie to authenticated;
grant select, insert, update, delete on interclub.resultat_bloc to authenticated;
grant select on interclub.resultat_voie to service_role;
grant select on interclub.resultat_bloc to service_role;

grant execute on function interclub.resultats_visibles(uuid)                 to authenticated;
grant execute on function interclub.peut_ecrire_resultat_voie(uuid, uuid)    to authenticated;
grant execute on function interclub.resultat_voie_lisible(uuid)              to authenticated;
grant execute on function interclub.peut_ecrire_resultat_bloc(uuid, uuid)    to authenticated;
grant execute on function interclub.resultat_bloc_lisible(uuid)              to authenticated;

-- ===========================================================================
-- 6. RLS — résultats voie/bloc. Une policy par opération (rejouable).
--    Lecture : admin OU rencontre en ③+ (tout authentifié, tous clubs — R6/R8).
--    Écriture : admin OU coach habilité (permanent ③ / temporaire ③) — R5/R7.
-- ===========================================================================
alter table interclub.resultat_voie enable row level security;
alter table interclub.resultat_bloc enable row level security;

drop policy if exists "resultat_voie_select" on interclub.resultat_voie;
create policy "resultat_voie_select" on interclub.resultat_voie for select
  to authenticated
  using (interclub.est_admin() or interclub.resultat_voie_lisible(voie_difficulte_id));

drop policy if exists "resultat_voie_insert" on interclub.resultat_voie;
create policy "resultat_voie_insert" on interclub.resultat_voie for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_voie_update" on interclub.resultat_voie;
create policy "resultat_voie_update" on interclub.resultat_voie for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_voie_delete" on interclub.resultat_voie;
create policy "resultat_voie_delete" on interclub.resultat_voie for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_bloc_select" on interclub.resultat_bloc;
create policy "resultat_bloc_select" on interclub.resultat_bloc for select
  to authenticated
  using (interclub.est_admin() or interclub.resultat_bloc_lisible(bloc_id));

drop policy if exists "resultat_bloc_insert" on interclub.resultat_bloc;
create policy "resultat_bloc_insert" on interclub.resultat_bloc for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

drop policy if exists "resultat_bloc_update" on interclub.resultat_bloc;
create policy "resultat_bloc_update" on interclub.resultat_bloc for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

drop policy if exists "resultat_bloc_delete" on interclub.resultat_bloc;
create policy "resultat_bloc_delete" on interclub.resultat_bloc for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

-- ===========================================================================
-- 7. Lecture de la STRUCTURE ouverte dès la ③ (pour afficher les résultats).
--    Auparavant (202607291000 / 202607311000) : lecture réservée à
--    `resultats_publics` ou admin. On l'élargit à toute rencontre en ③+ afin que
--    tout compte authentifié voie les voies/blocs/paliers pendant la compétition
--    (R6/R8). Écriture inchangée (admin, spec #3).
-- ===========================================================================
drop policy if exists voie_difficulte_select_authenticated on interclub.voie_difficulte;
create policy voie_difficulte_select_authenticated
  on interclub.voie_difficulte for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1 from interclub.epreuve e
      where e.id = voie_difficulte.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

drop policy if exists bloc_select_authenticated on interclub.bloc;
create policy bloc_select_authenticated
  on interclub.bloc for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1 from interclub.epreuve e
      where e.id = bloc.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

drop policy if exists bloc_palier_select_authenticated on interclub.bloc_palier;
create policy bloc_palier_select_authenticated
  on interclub.bloc_palier for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1
      from interclub.bloc b
      join interclub.epreuve e on e.id = b.epreuve_id
      where b.id = bloc_palier.bloc_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

-- ===========================================================================
-- 8. Suivi de version (idempotent).
-- ===========================================================================
insert into interclub.version (version, description, applique_par)
values (
  '202609081000_saisie_resultats_voie_bloc',
  'Saisie des résultats (spec #6) : tables resultat_voie (issue par voie×grimpeur, R8–R14) et resultat_bloc (palier par bloc×grimpeur, R15–R17) remplaçant le placeholder resultat ; triggers de cohérence issue↔catégorie (R10/R12) et palier↔bloc (R16) ; helpers peut_ecrire_resultat_voie/_bloc (réutilisent peut_ecrire_resultat, ③ compétition) et resultat_*_lisible ; lecture des résultats et de la structure (voie_difficulte/bloc/bloc_palier) ouverte à tout authentifié dès la ③ (R6/R8, rév. spec #1 2026-09-08). anon (surface publique) et NP clôture (action) hors migration.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609181000_grimpeur_sexe.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609181000_grimpeur_sexe
--
-- Objet : ajouter le sexe du grimpeur, prérequis du classement individuel
--         séparé Filles / Garçons (spec #7 « Classement » R8b, validée le
--         2026-09-18). Champ mutualisé avec l'itération vitesse/sexe (les points
--         de vitesse sont attribués par rang dans un classement par sexe, §5/§8
--         du règlement CT33) : c'est cette composante qui fonde la séparation.
--
-- Cadrage (spec #7, Contraintes de données) : `sexe` est OBLIGATOIRE, valeurs
--         'F' (Filles) / 'G' (Garçons) — tout grimpeur relève de l'un des deux
--         classements, aucun cas « sans sexe ».
--
-- Backfill : la colonne est d'abord ajoutée NULLABLE pour permettre de renseigner
--         le sexe des grimpeurs EXISTANTS avant de poser la contrainte NOT NULL.
--         - En local (Docker) : la table est vide au moment des migrations (le
--           seed s'applique après), donc rien à backfiller ; le seed porte le
--           sexe des grimpeurs de test (cf. supabase/seed/01-jeu-de-test.sql).
--         - En recette / prod (application manuelle) : RENSEIGNER À LA MAIN le
--           sexe ('F'/'G') de chaque grimpeur existant AVANT de rejouer l'étape
--           NOT NULL. Le garde-fou ci-dessous refuse de continuer tant qu'il
--           reste un grimpeur sans sexe (aucune valeur par défaut fiable).
--
-- RLS : aucune nouvelle policy — `sexe` est une colonne de `grimpeur`, couverte
--         par les policies de la table (les grants table valent pour la colonne).
--
-- Idempotent : `add column if not exists`, garde-fou avant NOT NULL,
--         `drop constraint if exists` avant la contrainte finale.
-- ===========================================================================

-- 1. Colonne sexe — d'abord nullable (fenêtre de backfill).
alter table interclub.grimpeur
  add column if not exists sexe text;

-- 2. Backfill des grimpeurs existants.
--    Local : table vide → aucune ligne touchée. Recette/prod : renseigner ici
--    (ou via le SQL Editor) le sexe des grimpeurs déjà en base avant l'étape 3.
--    (Les grimpeurs de test sont dotés d'un sexe par le seed, pas par la migration.)

-- 3. Garde-fou : interdit de poser NOT NULL s'il reste des grimpeurs sans sexe.
do $$
begin
  if exists (select 1 from interclub.grimpeur where sexe is null) then
    raise exception
      'Des grimpeurs sans sexe subsistent : renseigner ''F''/''G'' pour chacun avant de poser NOT NULL (spec #7 R8b).';
  end if;
end
$$;

-- 4. Contrainte définitive : obligatoire + valeurs bornées à 'F' / 'G'.
alter table interclub.grimpeur
  alter column sexe set not null;

alter table interclub.grimpeur
  drop constraint if exists grimpeur_sexe_check;

alter table interclub.grimpeur
  add constraint grimpeur_sexe_check check (sexe in ('F', 'G'));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609181000_grimpeur_sexe',
  'Ajout de grimpeur.sexe (''F''/''G'', NOT NULL) — prérequis du classement individuel séparé par sexe (spec #7 R8b). Colonne ajoutée nullable pour backfill, garde-fou avant NOT NULL, contrainte finale grimpeur_sexe_check.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609181100_grant_epreuve_service_role.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609181100_grant_epreuve_service_role
--
-- Objet : corriger un oubli de GRANT. La table `interclub.epreuve` (créée par la
--         migration socle 202607221100) n'a JAMAIS reçu de `grant select ... to
--         service_role`, contrairement aux autres tables de structure
--         (`voie_difficulte`, `bloc`, `bloc_palier`, `equipe`, `composition`,
--         `grimpeur`, `club`, `resultat_voie`, `resultat_bloc` — toutes déjà
--         accordées).
--
-- Effet : l'assemblage du **classement** (spec #7, `getClassementRencontre`) lit
--         les épreuves d'une rencontre via le client `service_role` (lecture
--         transverse tous clubs, ADR 0002/0003). Sans ce grant, PostgREST renvoie
--         « permission denied for table epreuve » : le loader ne retrouve pas les
--         épreuves voie/bloc, n'assemble aucun barème, et **tous les scores
--         s'affichent à 0** (les grimpeurs apparaissent quand même, via les
--         compositions). Ce grant rétablit le calcul.
--
-- Note : lecture SEULE (le service_role n'écrit pas d'épreuve — la création passe
--        par la RPC `creer_rencontre_avec_gabarit`, security definer). La RLS de
--        `epreuve` reste inchangée ; service_role la contourne par nature, comme
--        pour les autres tables transverses lues par les loaders admin.
--
-- Idempotent : le GRANT est réappliquable sans effet de bord.
-- ===========================================================================

grant select on interclub.epreuve to service_role;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609181100_grant_epreuve_service_role',
  'Grant SELECT sur interclub.epreuve au rôle service_role (oubli de la migration socle 202607221100). Débloque l''assemblage du classement (spec #7) : sans lui, permission denied → épreuves introuvables → tous les scores à 0.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609221000_resultat_auteur.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609221000_resultat_auteur
--
-- Objet : traçabilité de l'AUTEUR des résultats (spec #9 R14). Ajoute sur
--         `resultat_voie` ET `resultat_bloc` de quoi savoir « qui a saisi/corrigé
--         quoi » : l'utilisateur auth et son rôle au moment de l'écriture.
--         Prérequis de la saisie/correction admin (spec #9) ; renseigné aussi par
--         la saisie coach (spec #6).
--
-- Choix de modélisation : on référence `auth.users(id)` (et NON `interclub.compte`)
--         car le COACH TEMPORAIRE écrit via une session ANONYME (QR) SANS ligne
--         `compte` (spec #1 R9/R27) ; seul `auth.users` couvre tous les auteurs
--         (admin, coach permanent, coach temporaire). Le rôle effectif est stocké
--         à part dans `auteur_role` ('admin' | 'coach').
--
-- Nullable : colonnes optionnelles — aucun rétro-remplissage des résultats
--         existants. `on delete set null` : la suppression d'un compte auth ne
--         supprime pas le résultat (audit conservé, auteur devenu inconnu).
--
-- Audit seul : ces colonnes n'entrent NI dans le score NI dans les classements
--         (spec #7) ; pas de RLS ni de grant spécifiques (les privilèges de table
--         couvrent les nouvelles colonnes).
--
-- Idempotent : `add column if not exists`, `drop constraint if exists`.
-- ===========================================================================

-- resultat_voie
alter table interclub.resultat_voie
  add column if not exists auteur_utilisateur_id uuid
    references auth.users (id) on delete set null,
  add column if not exists auteur_role text;

alter table interclub.resultat_voie
  drop constraint if exists resultat_voie_auteur_role_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_auteur_role_check
  check (auteur_role is null or auteur_role in ('admin', 'coach'));

-- resultat_bloc
alter table interclub.resultat_bloc
  add column if not exists auteur_utilisateur_id uuid
    references auth.users (id) on delete set null,
  add column if not exists auteur_role text;

alter table interclub.resultat_bloc
  drop constraint if exists resultat_bloc_auteur_role_check;
alter table interclub.resultat_bloc
  add constraint resultat_bloc_auteur_role_check
  check (auteur_role is null or auteur_role in ('admin', 'coach'));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609221000_resultat_auteur',
  'Traçabilité de l''auteur des résultats (spec #9 R14) : colonnes auteur_utilisateur_id (→ auth.users, couvre le coach temporaire anonyme) et auteur_role (admin|coach) sur resultat_voie/resultat_bloc, nullable, audit seul (hors score/classement).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609221400_saisie_vitesse_juge.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609221400_saisie_vitesse_juge
--
-- Objet : rendre la SAISIE DE LA VITESSE par le juge opérationnelle (spec #10,
--         validée le 2026-09-22). Trois évolutions :
--
--   1. `temps_vitesse` porte désormais les TROIS FORMES du résultat de vitesse
--      (spec #1 R31, spec #10 R7) : un temps chronométré (en SECONDES, R8), une
--      CHUTE, ou une NON-PRÉSENTATION. Aujourd'hui la table ne stocke qu'un
--      `temps not null` : on ajoute `issue`, on rend `temps` nullable et on
--      garantit la cohérence forme ↔ durée (R9). Traçabilité de l'auteur
--      (juge|admin) alignée sur spec #9 (audit seul).
--
--   2. `temps_vitesse_select` — LECTURE élargie aux authentifiés DÈS LA ③ (même
--      régime que les résultats voie/bloc, spec #6 R6 / spec #1 R8, spec #10
--      R15) : la policy actuelle ne l'ouvrait qu'au coach du club du grimpeur
--      (`voit_resultat`). L'écriture (juge affecté, ③) reste inchangée.
--
--   3. `contexte_juge()` — NOUVELLE RPC de lecture (SECURITY DEFINER, analogue à
--      `contexte_coach_temporaire`, migration 202609011500) : renvoie le
--      périmètre (rencontre + épreuve de vitesse + couloir) de la session JUGE
--      active de l'utilisateur courant, pour la garde applicative de l'espace
--      `/juge` (spec #10 R1/R2). Nécessaire car l'anonyme ne peut PAS lire
--      `jeton_qr` directement.
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Idempotent : `add column if not exists`, `drop constraint if exists`,
--               `create or replace`, `drop policy if exists`.
-- Réf. : docs/specs/10-saisie-vitesse-juge.md (Modèle de données),
--         docs/conventions/03-base-de-donnees-supabase.md §5.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. temps_vitesse — trois formes de résultat (R7/R8/R9) + auteur (spec #9).
-- ---------------------------------------------------------------------------

-- 1a. Forme du résultat (issue) — d'abord nullable pour rétro-remplir l'existant.
alter table interclub.temps_vitesse
  add column if not exists issue text;

-- 1b. Rétro-remplissage : toute ligne existante porte un temps ⇒ forme « temps ».
update interclub.temps_vitesse
   set issue = 'temps'
 where issue is null;

-- 1c. `temps` devient nullable (null pour chute / non-présentation, R9). L'ancien
--     CHECK inline `temps > 0` reste valide : sur NULL il s'évalue à NULL (passe),
--     ce qui équivaut à `temps is null or temps > 0` (R8).
alter table interclub.temps_vitesse
  alter column temps drop not null;

-- 1d. Contraintes de forme et de cohérence (R7/R9).
alter table interclub.temps_vitesse
  drop constraint if exists temps_vitesse_issue_check;
alter table interclub.temps_vitesse
  add constraint temps_vitesse_issue_check
  check (issue in ('temps', 'chute', 'non_presentation'));

alter table interclub.temps_vitesse
  drop constraint if exists temps_vitesse_forme_coherente_check;
alter table interclub.temps_vitesse
  add constraint temps_vitesse_forme_coherente_check
  check ((issue = 'temps') = (temps is not null));

-- 1e. `issue` obligatoire une fois l'existant rétro-rempli (1b).
alter table interclub.temps_vitesse
  alter column issue set not null;

-- 1f. Traçabilité de l'auteur (spec #9 R14) — audit seul, hors score/classement.
--     Référence `auth.users` (couvre le juge, session ANONYME sans `compte`).
alter table interclub.temps_vitesse
  add column if not exists auteur_utilisateur_id uuid
    references auth.users (id) on delete set null,
  add column if not exists auteur_role text;

alter table interclub.temps_vitesse
  drop constraint if exists temps_vitesse_auteur_role_check;
alter table interclub.temps_vitesse
  add constraint temps_vitesse_auteur_role_check
  check (auteur_role is null or auteur_role in ('juge', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Lecture au fil de l'eau (R15) — authentifiés dès la ③, tous clubs, comme
--    les résultats voie/bloc (`resultats_visibles`). L'écriture reste bornée au
--    juge affecté en ③ (`peut_ecrire_temps_vitesse`, inchangée).
-- ---------------------------------------------------------------------------
drop policy if exists "temps_vitesse_select" on interclub.temps_vitesse;
create policy "temps_vitesse_select" on interclub.temps_vitesse for select
  to authenticated
  using (
    interclub.est_admin()
    or interclub.peut_ecrire_temps_vitesse(epreuve_id)
    or interclub.voit_resultat(epreuve_id, grimpeur_id)
    or exists (
      select 1 from interclub.epreuve ep
      where ep.id = epreuve_id
        and interclub.resultats_visibles(ep.rencontre_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. contexte_juge — périmètre de la session JUGE active de l'utilisateur
--    courant (spec #10 R1/R2). SECURITY DEFINER : contourne la RLS `jeton_qr`
--    (inaccessible à l'anonyme). Ne renvoie une ligne que si la session est
--    « du jour » (③ compétition) et le jeton actif — sinon NULL (fail-closed).
--    Renvoie l'ÉPREUVE DE VITESSE de la rencontre (périmètre d'écriture, R30)
--    et le couloir du jeton (info d'organisation). À scans multiples, on
--    retient la session la plus récente.
-- ---------------------------------------------------------------------------
create or replace function interclub.contexte_juge()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rencontre_id',       j.rencontre_id,
    'epreuve_vitesse_id', ev.id,
    'voie_vitesse_id',    j.voie_vitesse_id,
    'couloir_numero',     vv.numero,
    'date_rencontre',     r.date_rencontre,
    'club_porteur_nom',   cp.nom,
    'phase',              r.phase
  )
  from interclub.session_qr s
  join interclub.jeton_qr   j  on j.id = s.jeton_qr_id
  join interclub.rencontre  r  on r.id = j.rencontre_id
  join interclub.club       cp on cp.id = r.club_porteur_id
  left join interclub.epreuve ev
         on ev.rencontre_id = r.id and ev.type = 'vitesse'
  left join interclub.voie_vitesse vv on vv.id = j.voie_vitesse_id
  where s.utilisateur_id = auth.uid()
    and j.actif
    and j.nature = 'juge'
    and r.phase = 'competition'
  order by s.created_at desc
  limit 1;
$$;

grant execute on function interclub.contexte_juge() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. liste_grimpeurs_vitesse — roster des compétiteurs engagés + leur résultat
--    de vitesse, pour l'écran juge (spec #10 R2/R12/R13). SECURITY DEFINER : le
--    juge est ANONYME et n'a AUCUN accès direct à grimpeur/equipe/composition
--    (RLS réservée admin/coach) ; cette fonction contourne cette RLS mais
--    RESTREINT au juge de la rencontre (ou admin) — sinon renvoie 0 ligne
--    (fail-closed). Renvoie une ligne par grimpeur engagé (unicité
--    `composition(rencontre, grimpeur)`), avec le club de l'équipe où il concourt
--    et son résultat courant (issue/temps, null si « à saisir »).
-- ---------------------------------------------------------------------------
create or replace function interclub.liste_grimpeurs_vitesse(p_epreuve uuid)
returns table (
  grimpeur_id uuid,
  nom         text,
  prenom      text,
  sexe        text,
  club_nom    text,
  issue       text,
  temps       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.nom, g.prenom, g.sexe, cl.nom,
    tv.issue, tv.temps
  from interclub.epreuve ep
  join interclub.equipe      e  on e.rencontre_id = ep.rencontre_id
  join interclub.composition c  on c.equipe_id = e.id
  join interclub.grimpeur    g  on g.id = c.grimpeur_id
  join interclub.club        cl on cl.id = e.club_id
  left join interclub.temps_vitesse tv
         on tv.epreuve_id = ep.id and tv.grimpeur_id = g.id
  where ep.id = p_epreuve
    and ep.type = 'vitesse'
    and (interclub.est_admin() or interclub.est_juge_de_rencontre(ep.rencontre_id));
$$;

grant execute on function interclub.liste_grimpeurs_vitesse(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609221400_saisie_vitesse_juge',
  'Saisie de la vitesse (spec #10) : temps_vitesse porte les 3 formes du résultat (colonne issue temps|chute|non_presentation, temps nullable + checks de cohérence forme↔durée, R7/R8/R9) + auteur (juge|admin, spec #9) ; temps_vitesse_select élargi aux authentifiés dès la ③ (resultats_visibles, R15) ; RPC contexte_juge() SECURITY DEFINER (rencontre + épreuve vitesse + couloir de la session juge active) pour la garde applicative de /juge (R1/R2) ; RPC liste_grimpeurs_vitesse(epreuve) SECURITY DEFINER (roster engagés + résultat, restreint juge de la rencontre/admin) — le juge anonyme n''a pas d''accès RLS direct à grimpeur/equipe/composition (R2/R12).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609221500_bareme_vitesse.sql
-- ----------------------------------------------------------------------------
-- Migration : barème de vitesse par rang (spec #3 R46) — gabarit + rencontre.
-- Comble le report de la spec #3 R39 (« points de vitesse hors périmètre »).
--
-- Le barème de vitesse est un barème PAR RANG propre à l'épreuve de vitesse :
--   - des ÉCHELONS (rang_min, rang_max, points, décrément) : dans un échelon, le
--     rang r vaut points - (r - rang_min) * decrement (decrement = 0 => palier
--     plat) ; rang_max NULL = « au-delà » (dernier échelon, sans borne haute) ;
--   - deux points fixes : chute et non-présentation, portés par l'épreuve.
-- Barème identique Filles/Garçons ; seul le CLASSEMENT est séparé par sexe. Le
-- CALCUL des points relève de la spec #7 (R16–R20, migration suivante : trigger).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Points fixes chute / non-présentation sur l'épreuve (gabarit + rencontre)
--    Nullables (n'ont de sens que pour une épreuve de type vitesse) ; >= 0.
-- ===========================================================================

alter table interclub.gabarit_epreuve
  add column if not exists points_chute             int check (points_chute is null or points_chute >= 0),
  add column if not exists points_non_presentation  int check (points_non_presentation is null or points_non_presentation >= 0);

alter table interclub.epreuve
  add column if not exists points_chute             int check (points_chute is null or points_chute >= 0),
  add column if not exists points_non_presentation  int check (points_non_presentation is null or points_non_presentation >= 0);

-- ===========================================================================
-- 2. Tables d'échelons du barème par rang (gabarit + rencontre) — R46
-- ===========================================================================

create table if not exists interclub.gabarit_bareme_vitesse_echelon (
  id                  uuid primary key default gen_random_uuid(),
  gabarit_epreuve_id  uuid not null
                        references interclub.gabarit_epreuve (id) on delete cascade,
  rang_min            int  not null check (rang_min >= 1),
  rang_max            int  check (rang_max is null or rang_max >= rang_min),
  points              int  not null check (points >= 0),
  decrement           int  not null default 0 check (decrement >= 0),
  ordre               int  not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_gabarit_bareme_vitesse_echelon_epreuve
  on interclub.gabarit_bareme_vitesse_echelon (gabarit_epreuve_id);

create table if not exists interclub.bareme_vitesse_echelon (
  id          uuid primary key default gen_random_uuid(),
  epreuve_id  uuid not null references interclub.epreuve (id) on delete cascade,
  rang_min    int  not null check (rang_min >= 1),
  rang_max    int  check (rang_max is null or rang_max >= rang_min),
  points      int  not null check (points >= 0),
  decrement   int  not null default 0 check (decrement >= 0),
  ordre       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_bareme_vitesse_echelon_epreuve
  on interclub.bareme_vitesse_echelon (epreuve_id);

-- ===========================================================================
-- 3. Triggers updated_at
-- ===========================================================================

drop trigger if exists trg_gabarit_bareme_vitesse_echelon_updated_at
  on interclub.gabarit_bareme_vitesse_echelon;
create trigger trg_gabarit_bareme_vitesse_echelon_updated_at
  before update on interclub.gabarit_bareme_vitesse_echelon
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_bareme_vitesse_echelon_updated_at
  on interclub.bareme_vitesse_echelon;
create trigger trg_bareme_vitesse_echelon_updated_at
  before update on interclub.bareme_vitesse_echelon
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 4. RLS — barème (mêmes règles que les points de voie/bloc, spec #3)
--    Gabarit : lecture authentifiée ; écriture admin.
--    Rencontre : écriture admin ; lecture admin ou « résultats visibles » (③+).
-- ===========================================================================

alter table interclub.gabarit_bareme_vitesse_echelon enable row level security;
alter table interclub.bareme_vitesse_echelon         enable row level security;

create policy gabarit_bareme_vitesse_echelon_select_authenticated
  on interclub.gabarit_bareme_vitesse_echelon for select
  to authenticated using (true);

create policy gabarit_bareme_vitesse_echelon_all_admin
  on interclub.gabarit_bareme_vitesse_echelon for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bareme_vitesse_echelon_all_admin
  on interclub.bareme_vitesse_echelon for all
  to authenticated using (interclub.est_admin())
  with check (interclub.est_admin());

create policy bareme_vitesse_echelon_select_authenticated
  on interclub.bareme_vitesse_echelon for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1
      from interclub.epreuve e
      where e.id = bareme_vitesse_echelon.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

-- ===========================================================================
-- 5. Grants (authenticated pour la RLS ; service_role pour l'assemblage serveur)
-- ===========================================================================

grant select, insert, update, delete
  on interclub.gabarit_bareme_vitesse_echelon to authenticated;
grant select, insert, update, delete
  on interclub.bareme_vitesse_echelon         to authenticated;
grant select on interclub.gabarit_bareme_vitesse_echelon to service_role;
grant select on interclub.bareme_vitesse_echelon         to service_role;

-- ===========================================================================
-- 6. RPC creer_rencontre_avec_gabarit — copie du barème de vitesse (R30/R46)
--    Réécriture complète : ajoute la copie de points_chute/points_non_presentation
--    (épreuve) et des échelons de barème de vitesse.
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
-- 7. Seed du barème gabarit (§ Matin enfant / § Après-midi ado, CT33 v3)
--    Idempotent : points chute/NP par UPDATE ; échelons insérés si absents.
-- ===========================================================================

-- Points fixes chute / non-présentation sur les épreuves de vitesse du gabarit.
update interclub.gabarit_epreuve
set points_chute = 1, points_non_presentation = 0
where type = 'vitesse' and categorie = 'enfant';

update interclub.gabarit_epreuve
set points_chute = 5, points_non_presentation = 0
where type = 'vitesse' and categorie = 'ado';

-- Échelons du barème par rang.
do $$
declare
  ge_enfant uuid;
  ge_ado    uuid;
begin
  select id into ge_enfant
  from interclub.gabarit_epreuve where categorie = 'enfant' and type = 'vitesse';
  select id into ge_ado
  from interclub.gabarit_epreuve where categorie = 'ado' and type = 'vitesse';

  -- Enfant (§ Matin) : 1–5 (15,−1), puis paliers plats par 5, au-delà 45 = 2.
  if ge_enfant is not null and not exists (
    select 1 from interclub.gabarit_bareme_vitesse_echelon where gabarit_epreuve_id = ge_enfant
  ) then
    insert into interclub.gabarit_bareme_vitesse_echelon
      (gabarit_epreuve_id, rang_min, rang_max, points, decrement, ordre)
    values
      (ge_enfant,  1,   5, 15, 1,  1),
      (ge_enfant,  6,  10, 10, 0,  2),
      (ge_enfant, 11,  15,  9, 0,  3),
      (ge_enfant, 16,  20,  8, 0,  4),
      (ge_enfant, 21,  25,  7, 0,  5),
      (ge_enfant, 26,  30,  6, 0,  6),
      (ge_enfant, 31,  35,  5, 0,  7),
      (ge_enfant, 36,  40,  4, 0,  8),
      (ge_enfant, 41,  45,  3, 0,  9),
      (ge_enfant, 46, null,  2, 0, 10);
  end if;

  -- Ado (§ Après-midi) : 1–5 (60,−1), 6–50 (55,−1 => 55..11), au-delà 50 = 10.
  if ge_ado is not null and not exists (
    select 1 from interclub.gabarit_bareme_vitesse_echelon where gabarit_epreuve_id = ge_ado
  ) then
    insert into interclub.gabarit_bareme_vitesse_echelon
      (gabarit_epreuve_id, rang_min, rang_max, points, decrement, ordre)
    values
      (ge_ado,  1,   5, 60, 1, 1),
      (ge_ado,  6,  50, 55, 1, 2),
      (ge_ado, 51, null, 10, 0, 3);
  end if;
end;
$$;

-- ===========================================================================
-- 8. Backfill des rencontres existantes (épreuves de vitesse déjà créées)
--    Renseigne points chute/NP + échelons par catégorie, si manquants, pour que
--    le calcul (spec #7) fonctionne aussi sur les rencontres pré-existantes.
-- ===========================================================================

update interclub.epreuve e
set points_chute = case r.categorie when 'enfant' then 1 when 'ado' then 5 end,
    points_non_presentation = 0
from interclub.rencontre r
where e.rencontre_id = r.id
  and e.type = 'vitesse'
  and (e.points_chute is null or e.points_non_presentation is null);

insert into interclub.bareme_vitesse_echelon
  (epreuve_id, rang_min, rang_max, points, decrement, ordre)
select e.id, g.rang_min, g.rang_max, g.points, g.decrement, g.ordre
from interclub.epreuve e
join interclub.rencontre r on r.id = e.rencontre_id
join interclub.gabarit_epreuve ge
  on ge.categorie = r.categorie and ge.type = 'vitesse'
join interclub.gabarit_bareme_vitesse_echelon g
  on g.gabarit_epreuve_id = ge.id
where e.type = 'vitesse'
  and not exists (
    select 1 from interclub.bareme_vitesse_echelon b where b.epreuve_id = e.id
  );

-- ===========================================================================
-- 9. Contrainte de cohérence : une épreuve de vitesse porte ses points fixes.
--    Posée après backfill (les épreuves vitesse existantes sont renseignées).
-- ===========================================================================

alter table interclub.gabarit_epreuve
  drop constraint if exists chk_gabarit_epreuve_vitesse_points_fixes;
alter table interclub.gabarit_epreuve
  add constraint chk_gabarit_epreuve_vitesse_points_fixes
  check (type <> 'vitesse'
         or (points_chute is not null and points_non_presentation is not null));

alter table interclub.epreuve
  drop constraint if exists chk_epreuve_vitesse_points_fixes;
alter table interclub.epreuve
  add constraint chk_epreuve_vitesse_points_fixes
  check (type <> 'vitesse'
         or (points_chute is not null and points_non_presentation is not null));

-- ===========================================================================
-- 10. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609221500_bareme_vitesse',
  'Barème de vitesse par rang (spec #3 R46) : échelons (gabarit_bareme_vitesse_echelon / bareme_vitesse_echelon) + points chute/non-présentation sur (gabarit_)epreuve ; RLS admin + lecture ③ ; copie RPC ; seed CT33 enfant/ado ; backfill rencontres existantes. Base du calcul spec #7 (trigger à venir).',
  'julleroyfr'
);


-- ----------------------------------------------------------------------------
-- archive/202609221600_points_vitesse_trigger.sql
-- ----------------------------------------------------------------------------
-- Migration : points de vitesse matérialisés + trigger de recalcul (spec #7 R20).
--
-- Contrairement à voie/bloc (calculés à la lecture, rien stocké — R10), la
-- composante VITESSE est FIELD-DEPENDENT : un nouveau temps peut changer le rang,
-- donc les points, de plusieurs grimpeurs du même sexe (R19). On la MATÉRIALISE
-- dans `points_vitesse` et on la RECALCULE en base par un TRIGGER sur
-- `temps_vitesse` (spec #10). Motifs : cohérence quel que soit le chemin
-- d'écriture + compatibilité realtime (un écran peut s'abonner à la table).
--
-- Calcul (R15–R17) :
--   - classement par SEXE des grimpeurs ayant un TEMPS, par temps croissant ;
--     ex æquo standard (rank() : 1,2,2,4) ;
--   - points = barème par échelon (spec #3 R46) : points - (rang-rang_min)*decrement ;
--   - chute / non-présentation = points fixes de l'épreuve (rang NULL) ;
--   - absence de temps_vitesse = pas de ligne (0 à la lecture, R17).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Table points_vitesse — une ligne par (épreuve vitesse, grimpeur saisi)
-- ===========================================================================

create table if not exists interclub.points_vitesse (
  id           uuid primary key default gen_random_uuid(),
  epreuve_id   uuid not null references interclub.epreuve (id)  on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  rang         int,                                   -- NULL si chute / non-présentation
  points       int  not null default 0 check (points >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (epreuve_id, grimpeur_id)
);
create index if not exists idx_points_vitesse_epreuve
  on interclub.points_vitesse (epreuve_id);
create index if not exists idx_points_vitesse_grimpeur
  on interclub.points_vitesse (grimpeur_id);

drop trigger if exists trg_points_vitesse_updated_at on interclub.points_vitesse;
create trigger trg_points_vitesse_updated_at
  before update on interclub.points_vitesse
  for each row execute function interclub.set_updated_at();

-- ===========================================================================
-- 2. Fonction de recalcul — points de vitesse de TOUTE l'épreuve (par sexe)
--    Idempotente : recalcul complet à partir de temps_vitesse + barème stocké.
--    Upsert (préserve les lignes inchangées → événements realtime minimaux).
-- ===========================================================================

create or replace function interclub.recalculer_points_vitesse(p_epreuve uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pts_chute int;
  v_pts_np    int;
begin
  -- Barème de points fixes ; sort si l'épreuve n'existe pas / n'est pas vitesse.
  select points_chute, points_non_presentation
    into v_pts_chute, v_pts_np
  from interclub.epreuve
  where id = p_epreuve and type = 'vitesse';
  if not found then
    return;
  end if;

  -- 1) Purger les grimpeurs qui n'ont plus de temps_vitesse sur l'épreuve.
  delete from interclub.points_vitesse pv
  where pv.epreuve_id = p_epreuve
    and not exists (
      select 1 from interclub.temps_vitesse tv
      where tv.epreuve_id = p_epreuve and tv.grimpeur_id = pv.grimpeur_id
    );

  -- 2) Recalculer et upserter chaque grimpeur saisi.
  insert into interclub.points_vitesse (epreuve_id, grimpeur_id, rang, points)
  select
    p_epreuve,
    c.grimpeur_id,
    c.rang,
    case
      when c.issue = 'non_presentation' then v_pts_np
      when c.issue = 'chute'            then v_pts_chute
      when c.issue = 'temps' then coalesce((
        -- Barème par échelon : points - (rang - rang_min) * decrement.
        select e.points - (c.rang - e.rang_min) * e.decrement
        from interclub.bareme_vitesse_echelon e
        where e.epreuve_id = p_epreuve
          and c.rang >= e.rang_min
          and (e.rang_max is null or c.rang <= e.rang_max)
        order by e.rang_min desc
        limit 1
      ), 0)
      else 0
    end as points
  from (
    select
      tv.grimpeur_id,
      tv.issue,
      -- Rang par SEXE, temps croissant, ex æquo standard (rank). Les formes sans
      -- temps (chute/NP, temps NULL) sont triées en fin (nulls last) et leur rang
      -- est ignoré (mis à NULL ci-dessous).
      case when tv.issue = 'temps'
        then rank() over (partition by g.sexe order by tv.temps asc)
        else null
      end as rang
    from interclub.temps_vitesse tv
    join interclub.grimpeur g on g.id = tv.grimpeur_id
    where tv.epreuve_id = p_epreuve
  ) c
  on conflict (epreuve_id, grimpeur_id) do update
    set rang   = excluded.rang,
        points = excluded.points,
        updated_at = now();
end;
$$;

-- ===========================================================================
-- 3. Trigger sur temps_vitesse — recalcule l'épreuve concernée (R20)
-- ===========================================================================

create or replace function interclub.trg_recalculer_points_vitesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform interclub.recalculer_points_vitesse(old.epreuve_id);
    return old;
  end if;

  perform interclub.recalculer_points_vitesse(new.epreuve_id);
  -- UPDATE changeant d'épreuve (rare) : recalculer aussi l'ancienne.
  if tg_op = 'UPDATE' and new.epreuve_id is distinct from old.epreuve_id then
    perform interclub.recalculer_points_vitesse(old.epreuve_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_temps_vitesse_points_vitesse on interclub.temps_vitesse;
create trigger trg_temps_vitesse_points_vitesse
  after insert or update or delete on interclub.temps_vitesse
  for each row execute function interclub.trg_recalculer_points_vitesse();

-- ===========================================================================
-- 4. RLS — points_vitesse : écriture réservée au trigger (SECURITY DEFINER),
--    lecture des authentifiés dès la ③ (même régime que les résultats, R15).
--    Surface publique anon (⑤) = spec #8, hors migration.
-- ===========================================================================

alter table interclub.points_vitesse enable row level security;

create policy points_vitesse_select_authenticated
  on interclub.points_vitesse for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1
      from interclub.epreuve e
      where e.id = points_vitesse.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );
-- Pas de policy insert/update/delete : seules les fonctions SECURITY DEFINER
-- (trigger de recalcul) écrivent dans cette table dérivée.

-- ===========================================================================
-- 5. Grants (lecture ; l'écriture passe par le trigger definer)
-- ===========================================================================

grant select on interclub.points_vitesse to authenticated;
grant select on interclub.points_vitesse to service_role;
grant execute on function interclub.recalculer_points_vitesse(uuid) to service_role;

-- ===========================================================================
-- 6. Backfill — matérialiser les points des temps déjà saisis
-- ===========================================================================

do $$
declare
  r record;
begin
  for r in select id from interclub.epreuve where type = 'vitesse' loop
    perform interclub.recalculer_points_vitesse(r.id);
  end loop;
end;
$$;

-- ===========================================================================
-- 7. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609221600_points_vitesse_trigger',
  'Points de vitesse matérialisés (spec #7 R20) : table points_vitesse + fonction recalculer_points_vitesse(epreuve) (classement par sexe rank() + barème échelon spec #3 R46 + chute/NP) + trigger sur temps_vitesse (insert/update/delete) ; RLS lecture ③ (écriture trigger definer) ; backfill.',
  'julleroyfr'
);


-- ----------------------------------------------------------------------------
-- archive/202609231000_realtime_publication.sql
-- ----------------------------------------------------------------------------
-- Migration : publication Realtime des tables de résultats (spec #11 R1–R3).
--
-- Active Supabase Realtime *Postgres Changes* sur les tables sources du live des
-- écrans AUTHENTIFIÉS (coach #6, admin #9, classement #7, juge #10) :
--   - resultat_voie / resultat_bloc  → saisie coach/admin + classement ;
--   - points_vitesse (table dérivée)  → classement (bouge à chaque temps) ;
--   - temps_vitesse                   → saisie coach/admin (score voie+bloc+vitesse)
--                                       + synchronisation entre écrans juge.
--
-- Sécurité (spec #11 R5, spec #8 préservée) : Realtime évalue la RLS du rôle
-- ABONNÉ. Les policies SELECT « authentifié dès ③ » existent déjà (migrations
-- 202607251000 / 202609081000 / 202609221400 / 202609221600) et `authenticated`
-- a le GRANT SELECT sur les 4 tables. `anon` n'a NI policy NI grant de lecture sur
-- ces tables → un abonnement anonyme ne reçoit RIEN : AUCUNE ouverture `anon`
-- n'est nécessaire ni faite ici (le live public reste hors périmètre — Broadcast
-- serveur ultérieur). Cette migration N'AJOUTE donc aucune policy ni aucun grant.
--
-- REPLICA IDENTITY FULL : sans elle, un évènement DELETE ne porte que la clé
-- primaire, ce qui peut empêcher Realtime d'évaluer la RLS et de diffuser un DELETE
-- légitime (spec #11, « Contraintes de données »). Coût WAL négligeable (petites
-- tables, écritures humaines).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Publication `supabase_realtime` — présente par défaut sur Supabase ;
--    créée (vide) si absente, pour rejouabilité en local/pur Postgres.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- ===========================================================================
-- 2. Ajout des 4 tables sources à la publication (idempotent).
-- ===========================================================================

do $$
declare
  t text;
  tables text[] := array[
    'resultat_voie',
    'resultat_bloc',
    'points_vitesse',
    'temps_vitesse'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'interclub'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table interclub.%I', t
      );
    end if;
  end loop;
end;
$$;

-- ===========================================================================
-- 3. REPLICA IDENTITY FULL — évènements DELETE complets pour l'évaluation RLS.
--    (Rejouable : positionner l'identité de réplication est idempotent.)
-- ===========================================================================

alter table interclub.resultat_voie   replica identity full;
alter table interclub.resultat_bloc   replica identity full;
alter table interclub.points_vitesse  replica identity full;
alter table interclub.temps_vitesse   replica identity full;

-- ===========================================================================
-- 4. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609231000_realtime_publication',
  'Publication Realtime (spec #11) : ajout de resultat_voie/resultat_bloc/points_vitesse/temps_vitesse à la publication supabase_realtime + REPLICA IDENTITY FULL (DELETE complets). Aucune policy ni grant (RLS ③ existante ; anon reçoit rien → spec #8 préservée).',
  'julleroyfr'
);


-- ----------------------------------------------------------------------------
-- archive/202609250900_grimpeur_sexe_h.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609250900_grimpeur_sexe_h
--
-- Objet : renommer la valeur 'G' (Garçons) en 'H' (Homme) dans grimpeur.sexe.
--         Vocabulaire aligné sur Femme / Homme (spec #3 R21b, 2026-09-25).
--
-- Étapes :
--   1. Supprimer l'ancienne contrainte (bloque la mise à jour).
--   2. Mettre à jour les lignes existantes 'G' → 'H'.
--   3. Poser la nouvelle contrainte ('F', 'H').
--
-- Backfill : automatique (update sur toutes les lignes valant 'G').
-- Idempotent : drop constraint if exists ; update ne touche que les 'G'.
-- ===========================================================================

-- 1. Supprime l'ancienne contrainte (acceptait 'F'/'G').
alter table interclub.grimpeur
  drop constraint if exists grimpeur_sexe_check;

-- 2. Renomme toutes les valeurs 'G' → 'H'.
update interclub.grimpeur
  set sexe = 'H'
  where sexe = 'G';

-- 3. Nouvelle contrainte : 'F' ou 'H'.
alter table interclub.grimpeur
  add constraint grimpeur_sexe_check check (sexe in ('F', 'H'));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609250900_grimpeur_sexe_h',
  'Renommage grimpeur.sexe ''G'' → ''H'' (Femme/Homme) : update données + contrainte grimpeur_sexe_check mise à jour (''F''/''H'').',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609251000_grimpeur_licence.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609251000_grimpeur_licence
--
-- Objet : ajouter le numéro de licence FFME sur le grimpeur (spec #3 R21b,
--         décision produit 2026-09-25). Champ obligatoire (NOT NULL), entier
--         strictement positif, unique parmi tous les grimpeurs.
--
-- ⚠️  Les seeds 01/02 n'ont pas été mis à jour — à compléter avant de jouer
--     `supabase db reset` en local. En recette/prod : renseigner la licence
--     de chaque grimpeur existant AVANT de rejouer l'étape NOT NULL
--     (le garde-fou ci-dessous refuse de continuer sinon).
--
-- Contrainte SQL : `licence integer not null check (licence > 0) unique`.
-- RLS : aucune nouvelle policy — colonne de `grimpeur`, couverte par les
--       policies existantes (`grimpeur_*`).
-- Idempotent : `add column if not exists`, `drop constraint if exists`.
-- ===========================================================================

-- 1. Colonne licence — d'abord nullable (fenêtre de backfill).
alter table interclub.grimpeur
  add column if not exists licence integer;

-- 2. Backfill des grimpeurs existants.
--    Recette/prod : renseigner ici (ou via le SQL Editor) la licence de chaque
--    grimpeur existant avant de passer à l'étape 3.

-- 3. Garde-fou : interdit de poser NOT NULL s'il reste des grimpeurs sans licence.
do $$
begin
  if exists (select 1 from interclub.grimpeur where licence is null) then
    raise exception
      'Des grimpeurs sans licence subsistent : renseigner un entier positif pour chacun avant de poser NOT NULL (spec #3 R21b).';
  end if;
end
$$;

-- 4. Contraintes définitives : NOT NULL + check > 0 + unicité.
alter table interclub.grimpeur
  alter column licence set not null;

alter table interclub.grimpeur
  drop constraint if exists grimpeur_licence_check;

alter table interclub.grimpeur
  add constraint grimpeur_licence_check check (licence > 0);

alter table interclub.grimpeur
  drop constraint if exists grimpeur_licence_unique;

alter table interclub.grimpeur
  add constraint grimpeur_licence_unique unique (licence);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251000_grimpeur_licence',
  'Ajout de grimpeur.licence (integer not null, check > 0, unique) — numéro de licence FFME obligatoire et unique (spec #3 R21b).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609251100_rpc_importer_licencies.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609251100_rpc_importer_licencies
--
-- Objet : RPC `interclub.importer_licencies(jsonb)` — écriture **atomique** de
--         l'import des licenciés (spec #13 R16) : création des clubs manquants
--         par nom (R11–R12) puis **upsert** des grimpeurs sur la licence (R13).
--         Tout ou rien : la fonction s'exécute dans une seule transaction ; la
--         moindre erreur (contrainte sexe/licence/année) annule l'ensemble.
--
-- Sécurité : **SECURITY INVOKER** (défaut) — la fonction s'exécute avec les
--            droits de l'appelant, donc la **RLS** (`club_insert_admin`,
--            `grimpeur_insert`/`grimpeur_update`) reste la frontière réelle.
--            Garde applicative supplémentaire : refus si l'appelant n'est pas
--            admin (`est_admin()`), défense en profondeur (spec #13 R1).
--
-- Entrée : p_grimpeurs = tableau JSON d'objets
--          { nom, prenom, annee_naissance, sexe, licence, club }.
--          (Le parsing, la normalisation, le filtre d'âge et la consolidation
--          des doublons sont faits en amont dans le domaine TS — spec #13 R15.)
-- Sortie : { crees, mis_a_jour, clubs_crees: [noms] }.
--
-- Aucune nouvelle table ni colonne. Idempotent : create or replace.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

create or replace function interclub.importer_licencies(p_grimpeurs jsonb)
returns jsonb
language plpgsql
set search_path = interclub, public
as $$
declare
  v_clubs_crees text[] := '{}';
  v_crees       int := 0;
  v_mis_a_jour  int := 0;
  v_nom         text;
  v_rec         jsonb;
  v_club_id     uuid;
  v_licence     int;
begin
  -- Garde applicative (R1). La RLS refuserait déjà les écritures d'un non-admin.
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = 'P0001';
  end if;

  -- 1. Créer les clubs absents, par nom exact (R11–R12). On collecte les noms
  --    réellement créés pour le compte-rendu (R18).
  for v_nom in
    select distinct (elem->>'club')
      from jsonb_array_elements(coalesce(p_grimpeurs, '[]'::jsonb)) as t(elem)
  loop
    if not exists (select 1 from interclub.club where nom = v_nom) then
      insert into interclub.club (nom) values (v_nom)
      on conflict (nom) do nothing;
      v_clubs_crees := array_append(v_clubs_crees, v_nom);
    end if;
  end loop;

  -- 2. Upsert des grimpeurs sur la licence (R13). On teste l'existence de la
  --    licence pour distinguer création et mise à jour (pas de dépendance au
  --    pseudo-colonne système `xmax`).
  for v_rec in
    select elem from jsonb_array_elements(coalesce(p_grimpeurs, '[]'::jsonb)) as t(elem)
  loop
    v_licence := (v_rec->>'licence')::int;
    select id into v_club_id from interclub.club where nom = (v_rec->>'club');

    if exists (select 1 from interclub.grimpeur where licence = v_licence) then
      update interclub.grimpeur
         set club_id         = v_club_id,
             nom             = v_rec->>'nom',
             prenom          = v_rec->>'prenom',
             annee_naissance = (v_rec->>'annee_naissance')::int,
             sexe            = v_rec->>'sexe'
       where licence = v_licence;
      v_mis_a_jour := v_mis_a_jour + 1;
    else
      insert into interclub.grimpeur
        (club_id, nom, prenom, annee_naissance, sexe, licence)
      values (
        v_club_id,
        v_rec->>'nom',
        v_rec->>'prenom',
        (v_rec->>'annee_naissance')::int,
        v_rec->>'sexe',
        v_licence
      );
      v_crees := v_crees + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'crees',       v_crees,
    'mis_a_jour',  v_mis_a_jour,
    'clubs_crees', to_jsonb(v_clubs_crees)
  );
end;
$$;

grant execute on function interclub.importer_licencies(jsonb) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251100_rpc_importer_licencies',
  'RPC importer_licencies(jsonb) SECURITY INVOKER : création clubs manquants + upsert grimpeurs sur licence, atomique (spec #13 R12/R13/R16).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609251200_rpc_rechercher_grimpeurs.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609251200_rpc_rechercher_grimpeurs
--
-- Objet : recherche paginée du roster (écran admin Grimpeurs, spec #3 R26).
--         RPC `interclub.rechercher_grimpeurs(p_recherche, p_limit, p_offset)`
--         qui filtre par nom/prénom (insensible à la casse ET aux accents,
--         multi-termes dans n'importe quel ordre), trie par nom puis prénom,
--         renvoie la page demandée + le nom du club, le nombre d'engagements et
--         le total (fenêtre) pour la pagination côté écran.
--
-- Sécurité : **SECURITY INVOKER** (défaut) — la RLS `grimpeur_*` / `club_*` /
--            `composition_*` reste la frontière (l'admin voit tout le roster).
--
-- Dépendance : extension `unaccent` (schéma `extensions`, standard Supabase).
-- Aucune table/colonne nouvelle. Idempotent (create extension/or replace).
-- Application : MANUELLE (SQL Editor) — local via `supabase db reset`.
-- ===========================================================================

create extension if not exists unaccent with schema extensions;

create or replace function interclub.rechercher_grimpeurs(
  p_recherche text default '',
  p_limit     int  default 50,
  p_offset    int  default 0
)
returns table (
  id              uuid,
  nom             text,
  prenom          text,
  annee_naissance int,
  sexe            text,
  licence         int,
  club_id         uuid,
  club_nom        text,
  nb_engagements  bigint,
  total           bigint
)
language sql
stable
set search_path = interclub, public, extensions
as $$
  with q as (
    select trim(coalesce(p_recherche, '')) as terme
  ),
  filtre as (
    select g.*
    from interclub.grimpeur g, q
    where q.terme = ''
       or (
         -- Chaque mot de la recherche doit correspondre au nom OU au prénom
         -- (comparaison sans accents ni casse) — ordre des mots indifférent.
         select bool_and(
           unaccent(lower(g.nom))    like '%' || w || '%'
           or unaccent(lower(g.prenom)) like '%' || w || '%'
         )
         from unnest(string_to_array(unaccent(lower(q.terme)), ' ')) as w
         where w <> ''
       )
  )
  select
    f.id, f.nom, f.prenom, f.annee_naissance, f.sexe, f.licence, f.club_id,
    c.nom as club_nom,
    (select count(*) from interclub.composition comp where comp.grimpeur_id = f.id)
      as nb_engagements,
    count(*) over() as total
  from filtre f
  left join interclub.club c on c.id = f.club_id
  order by f.nom, f.prenom
  limit  greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function interclub.rechercher_grimpeurs(text, int, int) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251200_rpc_rechercher_grimpeurs',
  'RPC rechercher_grimpeurs(text,int,int) SECURITY INVOKER : recherche paginée du roster par nom/prénom (unaccent + ilike, multi-termes), tri nom/prénom, total fenêtré (spec #3 R26). Extension unaccent activée.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202609251300_rpc_rechercher_grimpeurs_filtre_club.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202609251300_rpc_rechercher_grimpeurs_filtre_club
--
-- Objet : ajout du paramètre optionnel `p_club_id uuid` à la RPC
--         `interclub.rechercher_grimpeurs` pour filtrer le roster par club.
--         Quand `p_club_id` est null (défaut), tous les clubs sont retournés
--         (comportement identique à la version précédente).
--
-- Sécurité : SECURITY INVOKER (inchangé) — RLS reste la frontière.
-- Dépendance : migration 202609251200_rpc_rechercher_grimpeurs.
-- Application : MANUELLE (SQL Editor) — local via `supabase db reset`.
-- ===========================================================================

create or replace function interclub.rechercher_grimpeurs(
  p_recherche text    default '',
  p_limit     int     default 50,
  p_offset    int     default 0,
  p_club_id   uuid    default null
)
returns table (
  id              uuid,
  nom             text,
  prenom          text,
  annee_naissance int,
  sexe            text,
  licence         int,
  club_id         uuid,
  club_nom        text,
  nb_engagements  bigint,
  total           bigint
)
language sql
stable
set search_path = interclub, public, extensions
as $$
  with q as (
    select trim(coalesce(p_recherche, '')) as terme
  ),
  filtre as (
    select g.*
    from interclub.grimpeur g, q
    where
      -- Filtre club optionnel
      (p_club_id is null or g.club_id = p_club_id)
      and (
        q.terme = ''
        or (
          -- Chaque mot doit correspondre au nom OU au prénom
          -- (insensible à la casse et aux accents) — ordre indifférent.
          select bool_and(
            unaccent(lower(g.nom))    like '%' || w || '%'
            or unaccent(lower(g.prenom)) like '%' || w || '%'
          )
          from unnest(string_to_array(unaccent(lower(q.terme)), ' ')) as w
          where w <> ''
        )
      )
  )
  select
    f.id, f.nom, f.prenom, f.annee_naissance, f.sexe, f.licence, f.club_id,
    c.nom as club_nom,
    (select count(*) from interclub.composition comp where comp.grimpeur_id = f.id)
      as nb_engagements,
    count(*) over() as total
  from filtre f
  left join interclub.club c on c.id = f.club_id
  order by f.nom, f.prenom
  limit  greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function interclub.rechercher_grimpeurs(text, int, int, uuid) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609251300_rpc_rechercher_grimpeurs_filtre_club',
  'RPC rechercher_grimpeurs : ajout paramètre p_club_id uuid (filtre optionnel par club, null = tous les clubs).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610021000_controle_resultats.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610021000_controle_resultats
--
-- Objet : COCHE DE CONTRÔLE des résultats contre les fiches papier des juges
--         (spec #16). Ajoute sur `resultat_voie` ET `resultat_bloc` :
--           - controle_le  : horodatage de la coche ; la ligne est contrôlée
--                            ssi `controle_le is not null` (R5/R10) ;
--           - controle_par : admin auteur de la coche (R11), → auth.users.
--
-- Choix de modélisation : la coche est portée par la ligne de résultat
--         (1-pour-1, pas de nouvelle table) ; elle suit le résultat et est
--         CONSERVÉE si l'issue est corrigée ensuite (R14, décision 2026-10-02).
--         `controle_par` référence `auth.users(id)` comme l'auteur de saisie
--         (spec #9 R14) ; `on delete set null` : la suppression d'un compte
--         n'efface pas la coche (auteur devenu inconnu).
--
-- Cohérence : pas d'auteur sans coche ; l'inverse est toléré (compte supprimé).
--
-- RLS / grants : AUCUN changement. L'écriture admin passe par la branche
--         `est_admin()` des policies `resultat_*_update` (migration
--         202609081000) ; le gating ④ clôture est porté par la Server Action
--         (R13). Realtime : tables déjà publiées (migration 202609231000) —
--         rien à ajouter (R12bis).
--
-- Hors score : ces colonnes n'entrent NI dans le score NI dans les
--         classements (spec #7).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `add column if not exists`, `drop constraint if exists`.
-- ===========================================================================

-- resultat_voie
alter table interclub.resultat_voie
  add column if not exists controle_le timestamptz,
  add column if not exists controle_par uuid
    references auth.users (id) on delete set null;

alter table interclub.resultat_voie
  drop constraint if exists resultat_voie_controle_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_controle_check
  check (controle_par is null or controle_le is not null);

-- resultat_bloc
alter table interclub.resultat_bloc
  add column if not exists controle_le timestamptz,
  add column if not exists controle_par uuid
    references auth.users (id) on delete set null;

alter table interclub.resultat_bloc
  drop constraint if exists resultat_bloc_controle_check;
alter table interclub.resultat_bloc
  add constraint resultat_bloc_controle_check
  check (controle_par is null or controle_le is not null);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610021000_controle_resultats',
  'Coche de contrôle des résultats contre les fiches de juges (spec #16) : colonnes controle_le (timestamptz) et controle_par (→ auth.users, on delete set null) sur resultat_voie/resultat_bloc, check pas d''auteur sans coche. Aucun changement RLS/grant/realtime.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610021100_grant_temps_vitesse_service_role.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610021100_grant_temps_vitesse_service_role
--
-- Objet : corriger un oubli de GRANT. La table `interclub.temps_vitesse` (créée
--         par la migration socle 202607221100) n'a JAMAIS reçu de `grant select
--         ... to service_role`, contrairement aux autres tables lues par
--         l'assemblage transverse du classement (`points_vitesse`,
--         `resultat_voie`, `resultat_bloc`, `epreuve`… — toutes accordées).
--
-- Effet : le **classement** (spec #7, `getClassementRencontre`) lit la forme de
--         vitesse saisie par le juge (temps / chute / non-présentation) via le
--         client `service_role` pour le **libellé** de la décomposition (R13).
--         Sans ce grant, PostgREST renvoie « permission denied for table
--         temps_vitesse » : la requête échoue silencieusement et la
--         décomposition affiche « À saisir » au lieu de « 8,100 s » / « Chute »…
--         Les **points** restent justes (lus dans `points_vitesse`, déjà
--         accordée). Touche aussi les écrans qui réutilisent ce loader
--         (classement admin, export PDF spec #15, écran secondaire spec #14).
--         Repéré par l'E2E du cahier 21 (CT-03) le 2026-10-02.
--
-- Note : lecture SEULE. La RLS de `temps_vitesse` reste inchangée ; service_role
--        la contourne par nature, comme pour les autres tables transverses.
--
-- Idempotent : le GRANT est réappliquable sans effet de bord.
-- ===========================================================================

grant select on interclub.temps_vitesse to service_role;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610021100_grant_temps_vitesse_service_role',
  'Grant SELECT sur interclub.temps_vitesse au rôle service_role (oubli de la migration socle 202607221100). Rétablit le libellé de vitesse (temps / chute / non-présentation) de la décomposition du classement (spec #7 R13), qui affichait « À saisir ».',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610031000_drop_rechercher_grimpeurs_3_params.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610031000_drop_rechercher_grimpeurs_3_params
--
-- Objet : supprimer l'ancienne surcharge `interclub.rechercher_grimpeurs(text,
--         int, int)`. La migration 202609251300 a ajouté le paramètre
--         `p_club_id uuid default null` via `create or replace function` : la
--         signature ayant changé, Postgres a créé une **seconde** fonction au
--         lieu de remplacer la première.
--
-- Effet : PostgREST ne sait plus choisir entre les deux (PGRST203 « Could not
--         choose the best candidate function ») dès que l'appel n'envoie pas
--         `p_club_id` : l'écran roster admin (spec #3 R26) plante. La version à
--         4 paramètres couvre l'ancien appel (`p_club_id` null = tous les
--         clubs).
--
-- Idempotent : `drop function if exists`.
-- ===========================================================================

drop function if exists interclub.rechercher_grimpeurs(text, int, int);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610031000_drop_rechercher_grimpeurs_3_params',
  'Suppression de l''ancienne surcharge rechercher_grimpeurs(text, int, int), laissée par 202609251300 (create or replace avec nouvelle signature) : PostgREST renvoyait PGRST203 (ambiguïté de surcharge).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610031100_durcissement_securite.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202610031200_integrite_vitesse_plafond_changement_equipe.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610031200_integrite_vitesse_plafond_changement_equipe
--
-- Objet : lot 4 du plan d'action de la revue du 2026-10-03 (constats M3, M7 ;
--         décisions D-A, D-B). Révisions de specs validées le 2026-10-03 :
--   1. spec #6 R14  — plafond de 6 voies ADO garanti PAR LA BASE ;
--   2. spec #10 R7bis — seul un grimpeur ENGAGÉ reçoit un résultat de vitesse ;
--   3. spec #10 R18 — le RETRAIT d'un grimpeur supprime son résultat de vitesse ;
--   4. spec #3 R41d / spec #10 R18bis — CHANGEMENT D'ÉQUIPE = mise à jour de
--      `composition.equipe_id` (résultats conservés), limité au club
--      d'affectation et à la même rencontre.
--
-- Les fonctions trigger sont SECURITY DEFINER (search_path vidé) : les contrôles
-- doivent voir TOUTES les lignes, indépendamment de la RLS de l'écrivain, et
-- s'appliquent à tous les écrivains, admin compris. Aucune n'est exécutable
-- directement (revoke from public ; un trigger n'exige pas EXECUTE).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, `drop trigger if exists`, grants rejouables.
-- ===========================================================================

-- ===========================================================================
-- 1. Plafond de 6 voies ado (spec #6 R14)
-- ===========================================================================
-- Refuse l'INSERTION d'un résultat de voie qui porterait à plus de 6 le nombre
-- de voies du grimpeur sur l'épreuve de voie d'une rencontre ado. Le trigger
-- BEFORE INSERT se déclenche AVANT la détection de conflit d'un upsert : une
-- CORRECTION (R13, même voie déjà saisie) est donc exclue du comptage.
-- Les insertions concurrentes pour un même grimpeur et une même épreuve sont
-- sérialisées par un verrou consultatif de transaction.

create or replace function interclub.verifier_plafond_voies_ado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_categorie text;
  v_autres    int;
begin
  select vd.epreuve_id, r.categorie
    into v_epreuve, v_categorie
    from interclub.voie_difficulte vd
    join interclub.epreuve e   on e.id = vd.epreuve_id
    join interclub.rencontre r on r.id = e.rencontre_id
   where vd.id = new.voie_difficulte_id;

  if v_categorie is distinct from 'ado' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.grimpeur_id::text || ':' || v_epreuve::text, 0)
  );

  select count(*)
    into v_autres
    from interclub.resultat_voie rv
    join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
   where rv.grimpeur_id = new.grimpeur_id
     and vd.epreuve_id = v_epreuve
     and rv.voie_difficulte_id <> new.voie_difficulte_id;

  if v_autres >= 6 then
    raise exception 'plafond_voies_ado'
      using errcode = '23514',
            detail = 'Un grimpeur ado réalise au plus 6 voies (spec #6 R14).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_plafond_voies_ado() is
  'Trigger BEFORE INSERT (resultat_voie) : refuse une 7e voie par grimpeur et épreuve ado (spec #6 R14) ; correction de la même voie exclue du comptage ; insertions sérialisées par grimpeur et épreuve.';

drop trigger if exists resultat_voie_plafond_ado on interclub.resultat_voie;
create trigger resultat_voie_plafond_ado
  before insert on interclub.resultat_voie
  for each row execute function interclub.verifier_plafond_voies_ado();

-- ===========================================================================
-- 2. Résultat de vitesse réservé aux grimpeurs engagés (spec #10 R7bis)
-- ===========================================================================

create or replace function interclub.verifier_grimpeur_engage_vitesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from interclub.epreuve e
      join interclub.composition c on c.rencontre_id = e.rencontre_id
     where e.id = new.epreuve_id
       and c.grimpeur_id = new.grimpeur_id
  ) then
    raise exception 'grimpeur_non_engage'
      using errcode = '23514',
            detail = 'Seul un grimpeur engagé dans la rencontre reçoit un résultat de vitesse (spec #10 R7bis).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_grimpeur_engage_vitesse() is
  'Trigger BEFORE INSERT/UPDATE (temps_vitesse) : le grimpeur doit être composé dans la rencontre de l''épreuve (spec #10 R7bis).';

drop trigger if exists temps_vitesse_grimpeur_engage on interclub.temps_vitesse;
create trigger temps_vitesse_grimpeur_engage
  before insert or update of epreuve_id, grimpeur_id on interclub.temps_vitesse
  for each row execute function interclub.verifier_grimpeur_engage_vitesse();

-- ===========================================================================
-- 3. Purge du résultat de vitesse au retrait (spec #10 R18)
-- ===========================================================================
-- La suppression d'une composition (retrait, suppression d'équipe ou de
-- rencontre en cascade) supprime le temps_vitesse du grimpeur sur l'épreuve de
-- vitesse de la rencontre. Le trigger existant sur temps_vitesse recalcule
-- alors points_vitesse (spec #7 R20). Un CHANGEMENT D'ÉQUIPE est une mise à
-- jour (§4) : aucune suppression, donc aucune purge (spec #10 R18bis).

create or replace function interclub.purger_vitesse_au_retrait()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from interclub.temps_vitesse tv
   using interclub.epreuve e
   where e.id = tv.epreuve_id
     and e.rencontre_id = old.rencontre_id
     and e.type = 'vitesse'
     and tv.grimpeur_id = old.grimpeur_id;
  return old;
end;
$$;

comment on function interclub.purger_vitesse_au_retrait() is
  'Trigger AFTER DELETE (composition) : supprime le résultat de vitesse du grimpeur retiré pour la rencontre (spec #10 R18).';

drop trigger if exists composition_purger_vitesse on interclub.composition;
create trigger composition_purger_vitesse
  after delete on interclub.composition
  for each row execute function interclub.purger_vitesse_au_retrait();

-- Mise en cohérence des données existantes avec R7bis/R18 : temps de vitesse
-- de grimpeurs qui ne sont plus engagés (retraits antérieurs à cette migration).
delete from interclub.temps_vitesse tv
 using interclub.epreuve e
 where e.id = tv.epreuve_id
   and not exists (
     select 1 from interclub.composition c
      where c.rencontre_id = e.rencontre_id
        and c.grimpeur_id = tv.grimpeur_id
   );

-- ===========================================================================
-- 4. Changement d'équipe (spec #3 R41d, spec #10 R18bis)
-- ===========================================================================
-- Mise à jour de `composition.equipe_id` : même rencontre ET même club
-- (club d'affectation : club de l'équipe actuelle — club d'accueil d'un prêté).
-- La policy `composition_update` (admin ; coach dans son périmètre) s'applique
-- déjà ; seul le droit de colonne manquait.

create or replace function interclub.verifier_changement_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancienne interclub.equipe%rowtype;
  v_nouvelle interclub.equipe%rowtype;
begin
  if new.equipe_id = old.equipe_id then
    return new;
  end if;
  select * into v_ancienne from interclub.equipe where id = old.equipe_id;
  select * into v_nouvelle from interclub.equipe where id = new.equipe_id;
  if v_nouvelle.id is null
     or v_nouvelle.rencontre_id <> v_ancienne.rencontre_id
     or v_nouvelle.club_id <> v_ancienne.club_id then
    raise exception 'changement_equipe_hors_club'
      using errcode = '23514',
            detail = 'Changement d''équipe limité au club d''affectation, dans la même rencontre (spec #3 R41d).';
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_changement_equipe() is
  'Trigger BEFORE UPDATE OF equipe_id (composition) : nouvelle équipe de la même rencontre et du même club que l''actuelle (spec #3 R41d).';

drop trigger if exists composition_changement_equipe on interclub.composition;
create trigger composition_changement_equipe
  before update of equipe_id on interclub.composition
  for each row execute function interclub.verifier_changement_equipe();

grant update (equipe_id) on interclub.composition to authenticated;

-- ===========================================================================
-- 5. Fonctions trigger fermées (cf. 202610031100 : rien d'ouvert à PUBLIC)
-- ===========================================================================

revoke execute on function interclub.verifier_plafond_voies_ado()       from public;
revoke execute on function interclub.verifier_grimpeur_engage_vitesse() from public;
revoke execute on function interclub.purger_vitesse_au_retrait()        from public;
revoke execute on function interclub.verifier_changement_equipe()       from public;

-- ===========================================================================
-- 6. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610031200_integrite_vitesse_plafond_changement_equipe',
  'Lot 4 revue 2026-10-03 : trigger plafond 6 voies ado (spec #6 R14) ; résultat de vitesse réservé aux grimpeurs engagés (spec #10 R7bis) ; purge du résultat de vitesse au retrait (spec #10 R18) + nettoyage des temps orphelins ; changement d''équipe par mise à jour de composition.equipe_id limité au club d''affectation (spec #3 R41d, spec #10 R18bis), grant update(equipe_id).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610031300_jeton_qr_revocation_definitive.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202610031400_lecture_acteur_identifie.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610031400_lecture_acteur_identifie
--
-- Objet : décision D-D de la revue du 2026-10-03 (constat m2), spec #1
--         révisée et validée le 2026-10-03 (Vocabulaire « acteur identifié »,
--         R8, RLS attendue). Les lectures ouvertes « à tout authenticated »
--         sont réservées aux ACTEURS IDENTIFIÉS :
--           - compte permanent MAPPÉ (ligne `compte` : admin ou coach) ;
--           - session QR éphémère (`session_qr`) ouverte sur un jeton ACTIF
--             (coach temporaire ou juge).
--         Une session anonyme ouverte sans scanner de QR, un compte sans rôle
--         ou une session dont le jeton est révoqué ne lisent plus rien.
--
-- Constat : Supabase classe toute session anonyme (`signInAnonymously`) en
--         `authenticated` ; avec la clé anon publique, n'importe qui pouvait
--         ouvrir une telle session et lire clubs, rencontres, épreuves, voies,
--         gabarit et, dès la ③, résultats, temps et points de vitesse.
--
-- Mise en œuvre :
--   1. helper `est_acteur_identifie()` (SECURITY DEFINER : lit `compte`,
--      `session_qr` et `jeton_qr` sans dépendre de leur RLS) ;
--   2. `resultats_visibles(rencontre)` exige en plus un acteur identifié — il
--      fonde déjà les policies des résultats voie/bloc (via
--      `resultat_*_lisible`), de la structure (voies, blocs, paliers), du
--      barème, des temps et des points de vitesse ;
--   3. les policies de lecture `using (true)` (club, rencontre, épreuve, voie de
--      vitesse, gabarit) passent à `using (est_acteur_identifie())`.
--   Inchangées : `compte` (sa propre ligne) et `session_qr` (ses sessions),
--   nécessaires pour s'identifier ; les policies déjà bornées à un périmètre
--   (équipes, grimpeurs, compositions, prêts, jetons, invitations).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, `drop policy if exists` + `create policy`.
-- ===========================================================================

-- 1. Helper : la session courante désigne-t-elle un acteur de la compétition ?
create or replace function interclub.est_acteur_identifie()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from interclub.compte c
            where c.utilisateur_id = auth.uid()
         )
      or exists (
           select 1
             from interclub.session_qr s
             join interclub.jeton_qr j on j.id = s.jeton_qr_id
            where s.utilisateur_id = auth.uid()
              and j.actif
         );
$$;

comment on function interclub.est_acteur_identifie() is
  'Vrai si la session courante est un acteur identifié (spec #1, rév. 2026-10-03) : compte mappé (admin/coach) ou session QR sur un jeton actif. Base des lectures ouvertes aux authentifiés.';

revoke execute on function interclub.est_acteur_identifie() from public;
grant execute on function interclub.est_acteur_identifie() to authenticated;

-- 2. Résultats visibles dès la ③ … pour un acteur identifié (spec #1 R8).
create or replace function interclub.resultats_visibles(p_rencontre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select interclub.est_acteur_identifie()
     and interclub.phase_de_rencontre(p_rencontre)
         in ('competition', 'cloture', 'resultats_publics');
$$;

-- 3. Catalogues : lecture réservée aux acteurs identifiés.
drop policy if exists club_select on interclub.club;
create policy club_select on interclub.club
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists rencontre_select on interclub.rencontre;
create policy rencontre_select on interclub.rencontre
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists epreuve_select on interclub.epreuve;
create policy epreuve_select on interclub.epreuve
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists voie_vitesse_select on interclub.voie_vitesse;
create policy voie_vitesse_select on interclub.voie_vitesse
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_epreuve_select_authenticated on interclub.gabarit_epreuve;
create policy gabarit_epreuve_select_authenticated on interclub.gabarit_epreuve
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_voie_diff_select_authenticated on interclub.gabarit_voie_difficulte;
create policy gabarit_voie_diff_select_authenticated on interclub.gabarit_voie_difficulte
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_bloc_select_authenticated on interclub.gabarit_bloc;
create policy gabarit_bloc_select_authenticated on interclub.gabarit_bloc
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_bloc_palier_select_authenticated on interclub.gabarit_bloc_palier;
create policy gabarit_bloc_palier_select_authenticated on interclub.gabarit_bloc_palier
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_voie_vitesse_select_authenticated on interclub.gabarit_voie_vitesse;
create policy gabarit_voie_vitesse_select_authenticated on interclub.gabarit_voie_vitesse
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_bareme_vitesse_echelon_select_authenticated on interclub.gabarit_bareme_vitesse_echelon;
create policy gabarit_bareme_vitesse_echelon_select_authenticated on interclub.gabarit_bareme_vitesse_echelon
  for select to authenticated using (interclub.est_acteur_identifie());

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610031400_lecture_acteur_identifie',
  'D-D revue 2026-10-03 (spec #1 rév. 2026-10-03) : helper est_acteur_identifie() (compte mappé ou session QR sur jeton actif) ; resultats_visibles() l''exige ; policies de lecture using(true) (club, rencontre, epreuve, voie_vitesse, gabarit_*) réservées aux acteurs identifiés.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610091000_enregistrement_saisie_un_appel.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610091000_enregistrement_saisie_un_appel
--
-- Objet : spec #6 R3/R20 et spec #10 R3/R14 (rév. 2026-10-09, validée le
--         2026-10-09) — chaque saisie coach / juge est UN SEUL appel à une
--         fonction d'enregistrement qui contrôle PUIS écrit, dans la même
--         transaction. Mesure en recette : 5 à 6 allers-retours vers la base
--         par clic (~2 s) ; il en reste 1.
--
-- Principe :
--   - SECURITY INVOKER : la fonction s'exécute avec les droits de l'appelant,
--     la RLS (peut_ecrire_resultat*, peut_ecrire_temps_vitesse) et les
--     triggers existants (cohérence de l'issue, plafond ado, grimpeur engagé,
--     auteur forcé) s'appliquent comme pour une écriture directe ;
--   - contrôles explicites AVANT l'écriture, chacun avec un code d'erreur
--     traduit en message lisible côté application (spec #6 R4, spec #10 R4) :
--     `voie_introuvable` / `bloc_introuvable` (P0002), `hors_competition`
--     (42501), `hors_perimetre` (42501), `issue_non_admise` (22023),
--     `palier_invalide` (22023), `session_juge_absente` (42501) ;
--   - les fonctions coach renvoient, pour le grimpeur, ses résultats de voie
--     et de bloc AVEC leurs barèmes et ses points de vitesse : l'application en
--     déduit le score par le domaine (spec #7), sans calcul dupliqué en base.
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, grants rejouables.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Résultats d'un grimpeur pour une rencontre, avec les barèmes (score).
-- ---------------------------------------------------------------------------
create or replace function interclub.resultats_grimpeur_rencontre(
  p_rencontre uuid,
  p_grimpeur  uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'voies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'voie_difficulte_id',     rv.voie_difficulte_id,
        'issue',                  rv.issue,
        'points',                 vd.points,
        'points_prise_valorisee', vd.points_prise_valorisee,
        'points_zone1',           vd.points_zone1,
        'points_zone2',           vd.points_zone2
      ))
      from interclub.resultat_voie   rv
      join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
      join interclub.epreuve         e  on e.id = vd.epreuve_id
      where e.rencontre_id = p_rencontre
        and rv.grimpeur_id = p_grimpeur
    ), '[]'::jsonb),
    'blocs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bloc_id',       rb.bloc_id,
        'issue',         rb.issue,
        'palier_id',     rb.palier_id,
        'points_palier', bp.points
      ))
      from interclub.resultat_bloc    rb
      join interclub.bloc             b  on b.id = rb.bloc_id
      join interclub.epreuve          e  on e.id = b.epreuve_id
      left join interclub.bloc_palier bp on bp.id = rb.palier_id
      where e.rencontre_id = p_rencontre
        and rb.grimpeur_id = p_grimpeur
    ), '[]'::jsonb),
    'points_vitesse', coalesce((
      select pv.points
      from interclub.points_vitesse pv
      join interclub.epreuve        e on e.id = pv.epreuve_id
      where e.rencontre_id = p_rencontre
        and pv.grimpeur_id = p_grimpeur
    ), 0)
  );
$$;

comment on function interclub.resultats_grimpeur_rencontre(uuid, uuid) is
  'Résultats voie/bloc d''un grimpeur pour une rencontre, avec barèmes et points de vitesse — matière du score calculé par le domaine (spec #6 R20, rév. 2026-10-09). SECURITY INVOKER : RLS de lecture appliquée.';

-- ---------------------------------------------------------------------------
-- 2. Contexte d'une voie / d'un bloc + contrôles communs (coach).
-- ---------------------------------------------------------------------------
create or replace function interclub.controler_saisie_coach(
  p_epreuve   uuid,
  p_rencontre uuid,
  p_phase     text,
  p_grimpeur  uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_phase <> 'competition' then
    raise exception 'hors_competition' using errcode = '42501';
  end if;
  -- Coach permanent du club du grimpeur en ③, ou coach temporaire (session QR)
  -- de ce club sur CETTE rencontre — prêtés inclus via la composition (R2/R36).
  if not interclub.peut_ecrire_resultat(p_epreuve, p_grimpeur) then
    raise exception 'hors_perimetre' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Saisie / correction d'un résultat de voie (spec #6 R8–R14).
-- ---------------------------------------------------------------------------
create or replace function interclub.saisir_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid,
  p_issue    text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
  v_categorie text;
  v_type_voie text;
begin
  select vd.epreuve_id, e.rencontre_id, r.phase::text, r.categorie::text, vd.type_voie::text
    into v_epreuve, v_rencontre, v_phase, v_categorie, v_type_voie
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
  if not found then
    raise exception 'voie_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  -- Issues admises (R10/R12) ; NP est posé automatiquement à la clôture (R18).
  if p_issue is null
     or p_issue not in ('top', 'prise_valorisee', 'zone2', 'zone1', 'echec')
     or (p_issue = 'prise_valorisee' and not (v_categorie = 'enfant' and v_type_voie = 'tete'))
     or (p_issue in ('zone1', 'zone2') and v_categorie <> 'ado') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;

  -- Correction = remplacement (R13). Plafond ado (R14) et auteur : triggers.
  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
  values (p_voie, p_grimpeur, p_issue)
  on conflict (voie_difficulte_id, grimpeur_id) do update set issue = excluded.issue;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Retrait d'un résultat de voie (ado, spec #6 R11/R14).
-- ---------------------------------------------------------------------------
create or replace function interclub.retirer_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
begin
  select vd.epreuve_id, e.rencontre_id, r.phase::text
    into v_epreuve, v_rencontre, v_phase
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
  if not found then
    raise exception 'voie_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  delete from interclub.resultat_voie
  where voie_difficulte_id = p_voie and grimpeur_id = p_grimpeur;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Saisie / correction d'un résultat de bloc (spec #6 R15–R17).
-- ---------------------------------------------------------------------------
create or replace function interclub.saisir_resultat_bloc(
  p_bloc     uuid,
  p_grimpeur uuid,
  p_issue    text,
  p_palier   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
begin
  select b.epreuve_id, e.rencontre_id, r.phase::text
    into v_epreuve, v_rencontre, v_phase
  from interclub.bloc b
  join interclub.epreuve   e on e.id = b.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where b.id = p_bloc;
  if not found then
    raise exception 'bloc_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  -- Palier atteint ou échec (R15/R16) ; NP posé à la clôture (R18).
  if p_issue is null or p_issue not in ('palier', 'echec') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;
  if p_issue = 'palier' and not exists (
    select 1 from interclub.bloc_palier bp where bp.id = p_palier and bp.bloc_id = p_bloc
  ) then
    raise exception 'palier_invalide' using errcode = '22023';
  end if;

  insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id)
  values (p_bloc, p_grimpeur, p_issue, case when p_issue = 'palier' then p_palier end)
  on conflict (bloc_id, grimpeur_id) do update
    set issue = excluded.issue, palier_id = excluded.palier_id;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Saisie / correction d'un résultat de vitesse par le juge (spec #10).
-- ---------------------------------------------------------------------------
create or replace function interclub.saisir_temps_vitesse(
  p_grimpeur uuid,
  p_issue    text,
  p_temps    numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve uuid;
begin
  -- Épreuve de vitesse de la rencontre du juge : session QR juge active, ③
  -- uniquement (R1/R3/R6) — sinon aucune épreuve.
  v_epreuve := (interclub.contexte_juge() ->> 'epreuve_vitesse_id')::uuid;
  if v_epreuve is null then
    raise exception 'session_juge_absente' using errcode = '42501';
  end if;

  -- Forme du résultat (R7–R9) : contraintes de la table ; grimpeur engagé
  -- (R7bis) et auteur : triggers ; périmètre : RLS peut_ecrire_temps_vitesse.
  insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
  values (v_epreuve, p_grimpeur, p_issue, case when p_issue = 'temps' then p_temps end)
  on conflict (epreuve_id, grimpeur_id) do update
    set issue = excluded.issue, temps = excluded.temps;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Droits : fermées à PUBLIC (privilèges par défaut, 202610031100) ;
--    ouvertes aux sessions authentifiées (coach permanent, sessions QR).
-- ---------------------------------------------------------------------------
revoke execute on function interclub.resultats_grimpeur_rencontre(uuid, uuid)        from public;
revoke execute on function interclub.controler_saisie_coach(uuid, uuid, text, uuid)  from public;
revoke execute on function interclub.saisir_resultat_voie(uuid, uuid, text)          from public;
revoke execute on function interclub.retirer_resultat_voie(uuid, uuid)              from public;
revoke execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid)    from public;
revoke execute on function interclub.saisir_temps_vitesse(uuid, text, numeric)       from public;

grant execute on function interclub.resultats_grimpeur_rencontre(uuid, uuid)        to authenticated;
grant execute on function interclub.controler_saisie_coach(uuid, uuid, text, uuid)  to authenticated;
grant execute on function interclub.saisir_resultat_voie(uuid, uuid, text)          to authenticated;
grant execute on function interclub.retirer_resultat_voie(uuid, uuid)              to authenticated;
grant execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid)    to authenticated;
grant execute on function interclub.saisir_temps_vitesse(uuid, text, numeric)       to authenticated;

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610091000_enregistrement_saisie_un_appel',
  'Spec #6 R3/R20, spec #10 R3/R14 (rév. 2026-10-09) : fonctions d''enregistrement en un appel (saisir_resultat_voie, saisir_resultat_bloc, retirer_resultat_voie, saisir_temps_vitesse), SECURITY INVOKER, contrôles codés puis écriture ; resultats_grimpeur_rencontre (résultats + barèmes pour le score).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610091100_heure_saisie.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610091100_heure_saisie
--
-- Objet : spec #17 R6–R11, R19, R20 ; spec #6 R13bis, spec #9 R6 (rév.),
--         spec #10 R11bis (révisions validées le 2026-10-03) — saisie hors
--         ligne, lot 2 :
--   1. colonne `saisi_le` (heure de saisie) sur resultat_voie, resultat_bloc,
--      temps_vitesse ;
--   2. trigger `controler_heure_saisie` : heure future ramenée à now() (R7) ;
--      écriture sans heure de saisie mais changeant la valeur (admin, R8) →
--      now() ; écriture PLUS ANCIENNE que la ligne existante refusée
--      (`saisie_plus_ancienne`, R9), heure égale acceptée (R11) — quel que
--      soit le chemin (fonction ou API) ;
--   3. fonctions d'enregistrement (202610091000) avec l'heure de saisie en
--      paramètre ; retrait conditionné à l'heure (R10) ; refus distincts
--      `session_absente` (R19) et `competition_cloturee` (R20).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `add column if not exists`, `create or replace`, `drop … if
--         exists`, grants rejouables.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Heure de saisie. Les lignes existantes reçoivent l'heure de la migration.
-- ---------------------------------------------------------------------------
alter table interclub.resultat_voie add column if not exists saisi_le timestamptz not null default now();
alter table interclub.resultat_bloc add column if not exists saisi_le timestamptz not null default now();
alter table interclub.temps_vitesse add column if not exists saisi_le timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Trigger : la saisie la plus récente l'emporte (R7–R11).
--    « Valeur » d'un résultat = la ligne hors colonnes techniques (heure,
--    horodatage, auteur, coche de contrôle) : une coche ne change pas l'heure.
-- ---------------------------------------------------------------------------
create or replace function interclub.controler_heure_saisie()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_techniques text[] := array[
    'saisi_le', 'updated_at', 'created_at', 'controle_le', 'controle_par',
    'auteur_utilisateur_id', 'auteur_role'
  ];
begin
  if tg_op = 'INSERT' then
    if new.saisi_le is null or new.saisi_le > now() then
      new.saisi_le := now();                                   -- R7
    end if;
    return new;
  end if;

  if new.saisi_le is distinct from old.saisi_le then
    -- Heure de saisie fournie par l'écrivain.
    if new.saisi_le is null or new.saisi_le > now() then
      new.saisi_le := now();                                   -- R7
    end if;
    if new.saisi_le < old.saisi_le then
      raise exception 'saisie_plus_ancienne' using errcode = 'P0001';   -- R9
    end if;
  elsif (to_jsonb(new) - v_techniques) is distinct from (to_jsonb(old) - v_techniques) then
    -- Valeur modifiée sans heure de saisie (admin, API) : heure du serveur (R8).
    new.saisi_le := now();
  end if;
  return new;                                                  -- égalité : R11
end;
$$;

comment on function interclub.controler_heure_saisie() is
  'Trigger BEFORE INSERT/UPDATE (resultat_voie/resultat_bloc/temps_vitesse) : heure de saisie future ramenée à now() (spec #17 R7) ; valeur modifiée sans heure → now() (R8) ; écriture plus ancienne que la ligne refusée « saisie_plus_ancienne » (R9) ; égalité acceptée (R11).';

drop trigger if exists resultat_voie_heure_saisie on interclub.resultat_voie;
create trigger resultat_voie_heure_saisie
  before insert or update on interclub.resultat_voie
  for each row execute function interclub.controler_heure_saisie();

drop trigger if exists resultat_bloc_heure_saisie on interclub.resultat_bloc;
create trigger resultat_bloc_heure_saisie
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.controler_heure_saisie();

drop trigger if exists temps_vitesse_heure_saisie on interclub.temps_vitesse;
create trigger temps_vitesse_heure_saisie
  before insert or update on interclub.temps_vitesse
  for each row execute function interclub.controler_heure_saisie();

-- ---------------------------------------------------------------------------
-- 3. Contrôles communs coach : session (R19) AVANT toute lecture — une session
--    absente ne peut pas lire la structure — puis phase (R20) et périmètre.
-- ---------------------------------------------------------------------------
create or replace function interclub.exiger_session_coach()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Coach permanent (compte rattaché à un club) ou session QR coach active.
  if interclub.club_courant() is null and interclub.contexte_coach_temporaire() is null then
    raise exception 'session_absente' using errcode = '42501';
  end if;
end;
$$;

create or replace function interclub.controler_saisie_coach(
  p_epreuve   uuid,
  p_rencontre uuid,
  p_phase     text,
  p_grimpeur  uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_phase in ('cloture', 'resultats_publics') then
    raise exception 'competition_cloturee' using errcode = '42501';   -- R20
  end if;
  if p_phase <> 'competition' then
    raise exception 'hors_competition' using errcode = '42501';
  end if;
  -- Coach permanent du club du grimpeur en ③, ou coach temporaire (session QR)
  -- de ce club sur CETTE rencontre — prêtés inclus via la composition (R2/R36).
  if not interclub.peut_ecrire_resultat(p_epreuve, p_grimpeur) then
    raise exception 'hors_perimetre' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fonctions d'enregistrement avec l'heure de saisie (remplacent les
--    signatures sans heure : une seule fonction par nom pour l'API).
-- ---------------------------------------------------------------------------
drop function if exists interclub.saisir_resultat_voie(uuid, uuid, text);
drop function if exists interclub.retirer_resultat_voie(uuid, uuid);
drop function if exists interclub.saisir_resultat_bloc(uuid, uuid, text, uuid);
drop function if exists interclub.saisir_temps_vitesse(uuid, text, numeric);

create or replace function interclub.saisir_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid,
  p_issue    text,
  p_saisi_le timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
  v_categorie text;
  v_type_voie text;
begin
  perform interclub.exiger_session_coach();

  select vd.epreuve_id, e.rencontre_id, r.phase::text, r.categorie::text, vd.type_voie::text
    into v_epreuve, v_rencontre, v_phase, v_categorie, v_type_voie
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
  if not found then
    raise exception 'voie_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  if p_issue is null
     or p_issue not in ('top', 'prise_valorisee', 'zone2', 'zone1', 'echec')
     or (p_issue = 'prise_valorisee' and not (v_categorie = 'enfant' and v_type_voie = 'tete'))
     or (p_issue in ('zone1', 'zone2') and v_categorie <> 'ado') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;

  -- Correction = remplacement (R13) ; heure de saisie : trigger (R7–R11).
  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue, saisi_le)
  values (p_voie, p_grimpeur, p_issue, coalesce(p_saisi_le, now()))
  on conflict (voie_difficulte_id, grimpeur_id) do update
    set issue = excluded.issue, saisi_le = excluded.saisi_le;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

create or replace function interclub.retirer_resultat_voie(
  p_voie     uuid,
  p_grimpeur uuid,
  p_saisi_le timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
  v_heure     timestamptz := least(coalesce(p_saisi_le, now()), now());
begin
  perform interclub.exiger_session_coach();

  select vd.epreuve_id, e.rencontre_id, r.phase::text
    into v_epreuve, v_rencontre, v_phase
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = p_voie;
  if not found then
    raise exception 'voie_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  -- R10 : un retrait ne supprime pas une saisie plus récente que lui.
  if exists (
    select 1 from interclub.resultat_voie
    where voie_difficulte_id = p_voie and grimpeur_id = p_grimpeur and saisi_le > v_heure
  ) then
    raise exception 'saisie_plus_ancienne' using errcode = 'P0001';
  end if;

  delete from interclub.resultat_voie
  where voie_difficulte_id = p_voie and grimpeur_id = p_grimpeur;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

create or replace function interclub.saisir_resultat_bloc(
  p_bloc     uuid,
  p_grimpeur uuid,
  p_issue    text,
  p_palier   uuid,
  p_saisi_le timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve   uuid;
  v_rencontre uuid;
  v_phase     text;
begin
  perform interclub.exiger_session_coach();

  select b.epreuve_id, e.rencontre_id, r.phase::text
    into v_epreuve, v_rencontre, v_phase
  from interclub.bloc b
  join interclub.epreuve   e on e.id = b.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where b.id = p_bloc;
  if not found then
    raise exception 'bloc_introuvable' using errcode = 'P0002';
  end if;

  perform interclub.controler_saisie_coach(v_epreuve, v_rencontre, v_phase, p_grimpeur);

  if p_issue is null or p_issue not in ('palier', 'echec') then
    raise exception 'issue_non_admise' using errcode = '22023';
  end if;
  if p_issue = 'palier' and not exists (
    select 1 from interclub.bloc_palier bp where bp.id = p_palier and bp.bloc_id = p_bloc
  ) then
    raise exception 'palier_invalide' using errcode = '22023';
  end if;

  insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id, saisi_le)
  values (p_bloc, p_grimpeur, p_issue, case when p_issue = 'palier' then p_palier end,
          coalesce(p_saisi_le, now()))
  on conflict (bloc_id, grimpeur_id) do update
    set issue = excluded.issue, palier_id = excluded.palier_id, saisi_le = excluded.saisi_le;

  return interclub.resultats_grimpeur_rencontre(v_rencontre, p_grimpeur);
end;
$$;

create or replace function interclub.saisir_temps_vitesse(
  p_grimpeur uuid,
  p_issue    text,
  p_temps    numeric,
  p_saisi_le timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epreuve uuid;
begin
  -- Session QR juge active, ③ uniquement (R1/R3/R6) — sinon session absente :
  -- la saisie reste en attente côté appareil (spec #17 R19).
  v_epreuve := (interclub.contexte_juge() ->> 'epreuve_vitesse_id')::uuid;
  if v_epreuve is null then
    raise exception 'session_juge_absente' using errcode = '42501';
  end if;

  insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps, saisi_le)
  values (v_epreuve, p_grimpeur, p_issue, case when p_issue = 'temps' then p_temps end,
          coalesce(p_saisi_le, now()))
  on conflict (epreuve_id, grimpeur_id) do update
    set issue = excluded.issue, temps = excluded.temps, saisi_le = excluded.saisi_le;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Droits : fermés à PUBLIC, ouverts aux sessions authentifiées.
-- ---------------------------------------------------------------------------
revoke execute on function interclub.controler_heure_saisie()                                 from public;
revoke execute on function interclub.exiger_session_coach()                                   from public;
revoke execute on function interclub.saisir_resultat_voie(uuid, uuid, text, timestamptz)       from public;
revoke execute on function interclub.retirer_resultat_voie(uuid, uuid, timestamptz)           from public;
revoke execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid, timestamptz) from public;
revoke execute on function interclub.saisir_temps_vitesse(uuid, text, numeric, timestamptz)    from public;

grant execute on function interclub.exiger_session_coach()                                   to authenticated;
grant execute on function interclub.saisir_resultat_voie(uuid, uuid, text, timestamptz)       to authenticated;
grant execute on function interclub.retirer_resultat_voie(uuid, uuid, timestamptz)           to authenticated;
grant execute on function interclub.saisir_resultat_bloc(uuid, uuid, text, uuid, timestamptz) to authenticated;
grant execute on function interclub.saisir_temps_vitesse(uuid, text, numeric, timestamptz)    to authenticated;

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610091100_heure_saisie',
  'Spec #17 R6–R11/R19/R20 (lot 2) : colonne saisi_le (resultat_voie, resultat_bloc, temps_vitesse) + trigger controler_heure_saisie (heure future → now, sans heure → now, plus ancienne refusée « saisie_plus_ancienne ») ; fonctions d''enregistrement avec p_saisi_le, retrait conditionné, refus session_absente / competition_cloturee.',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610091200_realtime_engagement.sql
-- ----------------------------------------------------------------------------
-- Migration : publication Realtime des tables de l'engagement (spec #11 R1/R3,
-- rév. 2026-10-09 — TODO D6).
--
-- L'écran d'engagement du coach (spec #5) se met à jour en direct tant que la
-- composition est modifiable (spec #11 R7) :
--   - pret         → grimpeur prêté au club par l'admin (spec #5 R12/R13) ;
--   - equipe       → équipe créée / renommée / supprimée par l'admin ou un autre
--                    appareil du club ;
--   - composition  → grimpeur affecté / retiré / changé de groupe ou d'équipe.
--
-- Sécurité (spec #11 R5) : Realtime évalue la RLS du rôle ABONNÉ. Les policies
-- SELECT existent déjà (`pret_select` : admin ou coach du club d'accueil ;
-- `equipe_select` : admin ou coach du club ; `composition_select` : admin ou
-- `voit_composition`) et `authenticated` a le GRANT SELECT sur les 3 tables.
-- `anon` n'a ni policy ni grant → rien n'est diffusé à un abonné anonyme. Cette
-- migration N'AJOUTE donc aucune policy ni aucun grant.
--
-- REPLICA IDENTITY FULL : comme pour les tables de résultats (202609231000),
-- évènements DELETE complets pour l'évaluation RLS. Coût WAL négligeable.
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Publication `supabase_realtime` — créée (vide) si absente (rejouabilité).
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- ===========================================================================
-- 2. Ajout des 3 tables de l'engagement à la publication (idempotent).
-- ===========================================================================

do $$
declare
  t text;
  tables text[] := array['pret', 'equipe', 'composition'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'interclub'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table interclub.%I', t
      );
    end if;
  end loop;
end;
$$;

-- ===========================================================================
-- 3. REPLICA IDENTITY FULL — évènements DELETE complets (rejouable).
-- ===========================================================================

alter table interclub.pret         replica identity full;
alter table interclub.equipe       replica identity full;
alter table interclub.composition  replica identity full;

-- ===========================================================================
-- 4. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610091200_realtime_engagement',
  'Publication Realtime de l''engagement (spec #11 rév. 2026-10-09, D6) : ajout de pret/equipe/composition à la publication supabase_realtime + REPLICA IDENTITY FULL. Aucune policy ni grant (RLS de lecture existante ; anon ne reçoit rien).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610091300_invitation_admin.sql
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- archive/202610101000_import_csv_sans_licence.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610101000_import_csv_sans_licence
--
-- Objet : import CSV sans licence, format Marsas (spec #18, validée le
--         2026-10-10 ; spec #3 R21c).
--   1. Colonne DÉRIVÉE `grimpeur.licence_generee` = licence dans la plage
--      réservée [2 000 000 000, 2 147 483 647] (spec #18 R15). Aucune
--      désynchronisation possible : remplacer la licence par un vrai numéro la
--      fait passer à false.
--   2. Fonction `interclub.forme_comparable(text)` — forme canonique d'un nom ou
--      prénom pour le rapprochement (R9) : majuscules, sans accents (unaccent),
--      tirets/apostrophes → espace, espaces réduits. Équivalente au domaine TS
--      `formeComparable` (src/domaine/import-csv-sans-licence.ts).
--   3. RPC `interclub.importer_grimpeurs_csv(uuid, jsonb)` — écriture
--      **atomique** (R16) : rapprochement par clé d'identité parmi les
--      grimpeurs du club cible (R13), création avec licence générée (R14).
--      Verrou transactionnel : deux imports concurrents sont sérialisés (pas de
--      licence en double, pas de double création).
--
-- Sécurité : SECURITY INVOKER — la RLS (`grimpeur_insert`, `grimpeur_select`)
--            reste la frontière ; garde `est_admin()` en défense en profondeur
--            (spec #18 R1). EXECUTE retiré à PUBLIC/anon, accordé à
--            `authenticated` seul.
--
-- Entrée : p_club_id = club cible (R3) ; p_grimpeurs = tableau JSON d'objets
--          { ligne, nom, prenom, sexe, annee_naissance } (normalisés, filtrés
--          par âge et dédoublonnés en amont dans le domaine TS — R16).
-- Sortie : { crees, deja_presents, ambigus: [{ ligne, identite, nb }] }.
--
-- Dépendances : extension `unaccent` (migration 202609251200), `grimpeur.sexe`
--               (202609181000), `grimpeur.licence` (202609251000).
-- Idempotent : add column if not exists / create or replace.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

-- 1. Indicateur dérivé « licence générée » (R15).
alter table interclub.grimpeur
  add column if not exists licence_generee boolean
  generated always as (licence >= 2000000000) stored;

comment on column interclub.grimpeur.licence_generee is
  'Vrai si la licence est dans la plage réservée aux licences générées par l''import CSV sans licence (spec #18 R14–R15, spec #3 R21c).';

-- 2. Forme comparable d'un nom/prénom (R9).
create or replace function interclub.forme_comparable(p_libelle text)
returns text
language sql
stable
set search_path = interclub, public, extensions
as $$
  select btrim(
    regexp_replace(
      translate(upper(extensions.unaccent(coalesce(p_libelle, ''))), '-''’', '   '),
      '\s+', ' ', 'g'
    )
  );
$$;

revoke execute on function interclub.forme_comparable(text) from public, anon;
grant execute on function interclub.forme_comparable(text) to authenticated;

-- 3. Écriture atomique de l'import CSV (R13, R14, R16).
create or replace function interclub.importer_grimpeurs_csv(
  p_club_id   uuid,
  p_grimpeurs jsonb
)
returns jsonb
language plpgsql
set search_path = interclub, public, extensions
as $$
declare
  v_crees         int := 0;
  v_deja_presents int := 0;
  v_ambigus       jsonb := '[]'::jsonb;
  v_rec           jsonb;
  v_nb            int;
  v_prochaine     bigint;
begin
  -- Garde applicative (R1). La RLS refuserait déjà les écritures d'un non-admin.
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = 'P0001';
  end if;

  if not exists (select 1 from interclub.club where id = p_club_id) then
    raise exception 'club_introuvable' using errcode = 'P0001';
  end if;

  -- Sérialise les imports CSV concurrents jusqu'à la fin de la transaction :
  -- le calcul de la prochaine licence et le rapprochement voient un état stable.
  perform pg_advisory_xact_lock(hashtext('interclub.importer_grimpeurs_csv'));

  -- Prochaine licence générée : plus grande licence de la plage + 1 (R14).
  select coalesce(max(licence), 1999999999) + 1
    into v_prochaine
    from interclub.grimpeur
   where licence >= 2000000000;

  for v_rec in
    select elem from jsonb_array_elements(coalesce(p_grimpeurs, '[]'::jsonb)) as t(elem)
  loop
    -- Rapprochement par clé d'identité parmi les grimpeurs du club cible (R13).
    select count(*) into v_nb
      from interclub.grimpeur g
     where g.club_id = p_club_id
       and g.sexe = v_rec->>'sexe'
       and g.annee_naissance = (v_rec->>'annee_naissance')::int
       and interclub.forme_comparable(g.nom)    = interclub.forme_comparable(v_rec->>'nom')
       and interclub.forme_comparable(g.prenom) = interclub.forme_comparable(v_rec->>'prenom');

    if v_nb = 0 then
      if v_prochaine > 2147483647 then
        raise exception 'plage_licences_epuisee' using errcode = 'P0001';
      end if;
      insert into interclub.grimpeur
        (club_id, nom, prenom, annee_naissance, sexe, licence)
      values (
        p_club_id,
        v_rec->>'nom',
        v_rec->>'prenom',
        (v_rec->>'annee_naissance')::int,
        v_rec->>'sexe',
        v_prochaine::int
      );
      v_prochaine := v_prochaine + 1;
      v_crees := v_crees + 1;
    elsif v_nb = 1 then
      v_deja_presents := v_deja_presents + 1;
    else
      v_ambigus := v_ambigus || jsonb_build_object(
        'ligne',    (v_rec->>'ligne')::int,
        'identite', (v_rec->>'nom') || ' ' || (v_rec->>'prenom'),
        'nb',       v_nb
      );
    end if;
  end loop;

  return jsonb_build_object(
    'crees',         v_crees,
    'deja_presents', v_deja_presents,
    'ambigus',       v_ambigus
  );
end;
$$;

revoke execute on function interclub.importer_grimpeurs_csv(uuid, jsonb) from public, anon;
grant execute on function interclub.importer_grimpeurs_csv(uuid, jsonb) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610101000_import_csv_sans_licence',
  'Import CSV sans licence (spec #18, spec #3 R21c) : colonne dérivée grimpeur.licence_generee (licence >= 2e9), fonction forme_comparable(text), RPC importer_grimpeurs_csv(uuid, jsonb) SECURITY INVOKER atomique (rapprochement par identité dans le club cible, licence générée, verrou transactionnel).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610161000_rapport_periodique.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610161000_rapport_periodique
--
-- Objet : rapport périodique (spec #19, validée le 2026-10-16).
--   1. Table `interclub.rapport_periodique` : historique des rapports produits
--      tous les 3 jours par la route `/api/rapport` (R15, R16).
--   2. Accès (R19) : RLS activée, AUCUNE policy ; rien pour anon/authenticated.
--      Seul `service_role` insère (la route, gardée par CRON_SECRET) et lit
--      (diagnostic). L'admin consulte la table dans le Table Editor (postgres).
--   3. Extension pg_cron + tâche nommée `purge-rapport-periodique`, quotidienne
--      à 03:00 UTC : supprime les rapports de plus d'un mois (R20), et rien
--      d'autre (R21).
--
-- Dépendances : extension pg_cron disponible (Supabase : Database → Extensions).
-- Idempotent : create … if not exists ; cron.schedule remplace une tâche de même
--              nom.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

-- 1. Historique des rapports (R15).
create table if not exists interclub.rapport_periodique (
  id       uuid primary key default gen_random_uuid(),
  cree_le  timestamptz not null default now(),
  saison   int not null,
  contenu  jsonb not null
);
create index if not exists idx_rapport_periodique_cree_le
  on interclub.rapport_periodique (cree_le);

comment on table interclub.rapport_periodique is
  'Rapports périodiques (clubs, grimpeurs par tranche d''âge, rencontres de la saison), produits tous les 3 jours par le cron de l''hébergeur ; purgés après un mois (spec #19).';

-- 2. Accès (R19).
alter table interclub.rapport_periodique enable row level security;
revoke all on interclub.rapport_periodique from public, anon, authenticated;
grant select, insert on interclub.rapport_periodique to service_role;

-- 3. Purge quotidienne des rapports de plus d'un mois (R20, R21).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-rapport-periodique',
  '0 3 * * *',
  $$delete from interclub.rapport_periodique where cree_le < now() - interval '1 month'$$
);

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610161000_rapport_periodique',
  'Rapport périodique (spec #19) : table rapport_periodique (RLS sans policy, select/insert service_role), extension pg_cron, tâche purge-rapport-periodique quotidienne 03:00 UTC (rapports de plus d''un mois).',
  'julleroyfr'
)
on conflict (version) do nothing;


-- ----------------------------------------------------------------------------
-- archive/202610161100_repere_voie.sql
-- ----------------------------------------------------------------------------
-- ===========================================================================
-- 202610161100_repere_voie
--
-- Objet : repère d'une voie de difficulté de rencontre (spec #3 R49, validée le
--         2026-10-16) — texte libre (relais, couleur…) qui distingue au mur les
--         voies doublées d'un même niveau. Le libellé affiché (R50) est calculé
--         par l'application ; rien à stocker de plus.
--   1. Colonne `voie_difficulte.repere text` nullable : non vide et ≤ 30
--      caractères quand renseignée (R49a/b).
--   2. Unicité du repère par (épreuve, niveau), insensible à la casse, pour les
--      repères non nuls (R49c) : index unique partiel.
--   Pas de colonne dans le gabarit (R49e). Les droits existants suffisent :
--   écriture admin (`voie_difficulte_all_admin`), grant `update` à
--   `authenticated` (migration 202608281000).
--
-- Idempotent : add column if not exists ; contrainte et index recréés.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord, prod à
--               la bascule sur `main`.
-- ===========================================================================

-- 1. Repère (R49a/b).
alter table interclub.voie_difficulte
  add column if not exists repere text;

alter table interclub.voie_difficulte
  drop constraint if exists voie_difficulte_repere_check;
alter table interclub.voie_difficulte
  add constraint voie_difficulte_repere_check
  check (repere is null or (length(btrim(repere)) > 0 and length(repere) <= 30));

comment on column interclub.voie_difficulte.repere is
  'Repère au mur (relais, couleur…), facultatif — distingue les voies d''un même niveau (spec #3 R49). Libellé affiché calculé par l''application (R50).';

-- 2. Unicité par (épreuve, niveau), insensible à la casse (R49c).
create unique index if not exists uq_voie_difficulte_repere
  on interclub.voie_difficulte (epreuve_id, niveau, lower(repere))
  where repere is not null;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610161100_repere_voie',
  'Repère de voie (spec #3 R49) : colonne voie_difficulte.repere (nullable, non vide, ≤ 30 car.) + index unique partiel (epreuve_id, niveau, lower(repere)).',
  'julleroyfr'
)
on conflict (version) do nothing;

