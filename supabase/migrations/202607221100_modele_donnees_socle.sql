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
