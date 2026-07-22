-- Migration : 202607221400_grants_service_role_mapping
-- Description : accorde au rôle `service_role` l'accès en LECTURE dont le backend
--               admin a besoin pour l'écran de mapping de rôle (T5b) : lister les
--               comptes mappés et le catalogue des clubs. Le schéma `interclub`
--               est custom : contrairement à `public`, `service_role` n'y a AUCUN
--               privilège par défaut. `service_role` contourne la RLS mais reste
--               soumis aux GRANTs de table — d'où ces grants explicites.
-- Contexte : cf. docs/decisions/0002-liste-des-comptes-via-cle-service.md (ADR 0002).
--            L'ÉCRITURE du mapping reste faite par `authenticated` via la RLS
--            (policies « admin crée/modifie un mapping », spec #2 R4) : on n'ouvre
--            donc à `service_role` que le SELECT, pas les écritures.
-- Application : MANUELLE dans le SQL Editor Supabase — recette d'abord.
--               Prod reportée à la bascule sur `main`. Rejouable (idempotent).
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §5.

-- Usage du schéma (sans lui, aucune lecture possible pour ce rôle).
grant usage on schema interclub to service_role;

-- Lectures nécessaires à l'écran de mapping (loaders `chargerContexteMapping`).
-- `club` n'est pas encore ouvert en RLS `authenticated` (T6) : le backend admin
-- le lit via `service_role` (ADR 0002). `compte` : lecture de tous les mappings.
grant select on interclub.club   to service_role;
grant select on interclub.compte to service_role;

-- ---------------------------------------------------------------------------
-- Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607221400_grants_service_role_mapping',
  'Grants de lecture service_role sur interclub (usage schéma + select club/compte) pour l''écran admin de mapping (T5b, ADR 0002).',
  'julleroyfr'
)
on conflict (version) do nothing;
