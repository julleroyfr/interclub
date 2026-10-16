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
