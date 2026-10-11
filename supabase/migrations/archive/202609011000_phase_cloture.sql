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
