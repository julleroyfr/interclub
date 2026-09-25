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
