-- Migration : 202607221300_rls_compte_et_role_courant
-- Description : première tranche d'auth (T5a). Fonctions de lecture du rôle
--               courant (SECURITY DEFINER, sans récursion RLS), grants
--               fondateurs sur le schéma `interclub` et la table `compte`, et
--               policies RLS de `compte` (une par opération, selon la matrice
--               rôles × actions de la spec #1 et le mapping de la spec #2).
-- Sources : docs/specs/02-authentification-et-sessions-qr.md (R1–R5),
--           docs/specs/01-roles-et-autorisations.md (R4, R10).
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ---------------------------------------------------------------------------
-- 1. Fonctions de rôle — SECURITY DEFINER pour lire `compte` en CONTOURNANT la
--    RLS (sinon une policy de `compte` qui interroge `compte` boucle). `stable`
--    car le résultat est constant dans une même requête. `search_path` vidé et
--    objets pleinement qualifiés (bonne pratique sécurité des fonctions definer).
-- ---------------------------------------------------------------------------
create or replace function interclub.role_courant()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Rôle applicatif du compte connecté, ou NULL si pas de mapping (R5 fail-closed).
  select role from interclub.compte where utilisateur_id = auth.uid();
$$;

comment on function interclub.role_courant() is
  'Rôle applicatif (admin/coach) du compte connecté, NULL si pas de mapping (spec #2 R5). SECURITY DEFINER : évite la récursion RLS sur compte.';

create or replace function interclub.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.compte
    where utilisateur_id = auth.uid() and role = 'admin'
  );
$$;

comment on function interclub.est_admin() is
  'Vrai si le compte connecté a le rôle admin (spec #1 R10). SECURITY DEFINER : évite la récursion RLS sur compte.';

-- ---------------------------------------------------------------------------
-- 2. Grants fondateurs — sans privilège de table, une policy RLS reste
--    inopérante (permission denied). Les migrations socle/auth n'ont fait
--    qu'activer la RLS ; on accorde ici l'accès de base au rôle `authenticated`.
--    (Les grants des autres tables métier viendront avec leurs policies en T6.)
-- ---------------------------------------------------------------------------
grant usage on schema interclub to anon, authenticated;
grant select, insert, update, delete on interclub.compte to authenticated;
grant execute on function interclub.role_courant() to authenticated;
grant execute on function interclub.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policies RLS de `compte` — une par opération (RLS déjà activée en
--    202607221200). Rejouable : on droppe avant de recréer.
--    Lecture : chacun voit SA ligne ; l'admin voit tout (R4, R10).
--    Écritures : réservées à l'admin — administration du mapping (spec #2 R4).
-- ---------------------------------------------------------------------------
drop policy if exists "lecture de son compte ou admin" on interclub.compte;
create policy "lecture de son compte ou admin"
  on interclub.compte for select
  to authenticated
  using (utilisateur_id = auth.uid() or interclub.est_admin());

drop policy if exists "admin crée un mapping" on interclub.compte;
create policy "admin crée un mapping"
  on interclub.compte for insert
  to authenticated
  with check (interclub.est_admin());

drop policy if exists "admin modifie un mapping" on interclub.compte;
create policy "admin modifie un mapping"
  on interclub.compte for update
  to authenticated
  using (interclub.est_admin())
  with check (interclub.est_admin());

drop policy if exists "admin supprime un mapping" on interclub.compte;
create policy "admin supprime un mapping"
  on interclub.compte for delete
  to authenticated
  using (interclub.est_admin());

-- ---------------------------------------------------------------------------
-- 4. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607221300_rls_compte_et_role_courant',
  'Fonctions role_courant()/est_admin() (SECURITY DEFINER) + grants schéma/compte + policies RLS de compte (lecture sa ligne/admin ; écritures admin).',
  'julleroyfr'
)
on conflict (version) do nothing;
