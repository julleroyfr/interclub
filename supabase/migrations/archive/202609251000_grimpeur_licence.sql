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
