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
-- RLS : RETRAIT d'un grimpeur PRÊTÉ par le coach d'accueil (spec #5 R36)
-- ---------------------------------------------------------------------------
-- Même racine que ci-dessus : `composition_delete` s'appuyait sur
-- `peut_ecrire_composition`, qui exige `grimpeur.club_id = equipe.club_id`. Le
-- coach d'accueil ne pouvait donc PAS retirer un prêté (R36) — le DELETE passait
-- côté HTTP mais la RLS supprimait 0 ligne. L'INSERT reste, lui, sur
-- `peut_ecrire_composition` (le rattachement cross-club demeure admin, R35).
--
-- Correctif : le retrait dépend de l'ÉQUIPE D'ACCUEIL (peut_ecrire_equipe, qui
-- porte le gating de phase), pas du club du grimpeur → couvre le retrait d'un
-- membre propre ET d'un prêté, en phase d'édition seulement (gel R16/R17 préservé).
-- ===========================================================================

create or replace function interclub.peut_retirer_composition(p_equipe uuid)
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

drop policy if exists "composition_delete" on interclub.composition;
create policy "composition_delete" on interclub.composition for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_retirer_composition(equipe_id));

-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609020900_rls_grimpeur_prete_lisible',
  'Grimpeur prêté lisible/gérable par le coach d''accueil : grimpeur_select élargi (voit_grimpeur_via_engagement, R13) + composition_delete sur peut_retirer_composition (équipe d''accueil, gating de phase, R36). INSERT cross-club inchangé (admin, R35). Spec #5.',
  'julleroyfr'
)
on conflict (version) do nothing;
