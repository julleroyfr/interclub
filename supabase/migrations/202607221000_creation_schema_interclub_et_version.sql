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
