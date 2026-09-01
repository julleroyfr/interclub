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
