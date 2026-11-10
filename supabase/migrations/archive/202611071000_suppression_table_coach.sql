-- ===========================================================================
-- 202611071000_suppression_table_coach
--
-- Objet : suppression de la table `interclub.coach`, vestige du modèle socle
--         (202607221100). Elle n'a jamais été alimentée ni lue : le coach
--         permanent est porté par `interclub.compte` (role = 'coach', club_id
--         obligatoire, spec #2), le coach temporaire par `interclub.jeton_qr`
--         (nature = 'coach_temporaire'). Aucune clé étrangère, policy, grant ni
--         publication realtime ne la référence. Le rattachement d'un coach à
--         exactement un club (spec #1 R16) reste garanti par
--         `chk_compte_role_club`. Aucune spec modifiée.
--   1. Garde-fou : refus si la table contient des lignes (rien n'est perdu
--      sans le savoir).
--   2. `drop table` (index et trigger `trg_coach_updated_at` suivent).
--
-- Réversibilité : retour arrière (table vide recréée à l'identique) :
-- supabase/retours-arriere/202611071000_suppression_table_coach_retour_arriere.sql.
-- Idempotent (garde sur `to_regclass`, `drop table if exists`). Application
-- MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

-- 1. Garde-fou : la table doit être vide.
--    Requête dynamique : la table peut déjà avoir disparu (rejeu).
do $$
declare
  v_non_vide boolean;
begin
  if to_regclass('interclub.coach') is not null then
    execute 'select exists (select 1 from interclub.coach)' into v_non_vide;
    if v_non_vide then
      raise exception 'interclub.coach contient des lignes : suppression annulée';
    end if;
  end if;
end;
$$;

-- 2. Suppression.
drop table if exists interclub.coach;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611071000_suppression_table_coach',
  'Suppression de la table interclub.coach (vestige du modèle socle, jamais utilisée : coach permanent = compte, coach temporaire = jeton_qr). Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
