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
