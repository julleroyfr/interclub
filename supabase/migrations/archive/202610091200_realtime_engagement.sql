-- Migration : publication Realtime des tables de l'engagement (spec #11 R1/R3,
-- rév. 2026-10-09 — TODO D6).
--
-- L'écran d'engagement du coach (spec #5) se met à jour en direct tant que la
-- composition est modifiable (spec #11 R7) :
--   - pret         → grimpeur prêté au club par l'admin (spec #5 R12/R13) ;
--   - equipe       → équipe créée / renommée / supprimée par l'admin ou un autre
--                    appareil du club ;
--   - composition  → grimpeur affecté / retiré / changé de groupe ou d'équipe.
--
-- Sécurité (spec #11 R5) : Realtime évalue la RLS du rôle ABONNÉ. Les policies
-- SELECT existent déjà (`pret_select` : admin ou coach du club d'accueil ;
-- `equipe_select` : admin ou coach du club ; `composition_select` : admin ou
-- `voit_composition`) et `authenticated` a le GRANT SELECT sur les 3 tables.
-- `anon` n'a ni policy ni grant → rien n'est diffusé à un abonné anonyme. Cette
-- migration N'AJOUTE donc aucune policy ni aucun grant.
--
-- REPLICA IDENTITY FULL : comme pour les tables de résultats (202609231000),
-- évènements DELETE complets pour l'évaluation RLS. Coût WAL négligeable.
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Publication `supabase_realtime` — créée (vide) si absente (rejouabilité).
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- ===========================================================================
-- 2. Ajout des 3 tables de l'engagement à la publication (idempotent).
-- ===========================================================================

do $$
declare
  t text;
  tables text[] := array['pret', 'equipe', 'composition'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'interclub'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table interclub.%I', t
      );
    end if;
  end loop;
end;
$$;

-- ===========================================================================
-- 3. REPLICA IDENTITY FULL — évènements DELETE complets (rejouable).
-- ===========================================================================

alter table interclub.pret         replica identity full;
alter table interclub.equipe       replica identity full;
alter table interclub.composition  replica identity full;

-- ===========================================================================
-- 4. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610091200_realtime_engagement',
  'Publication Realtime de l''engagement (spec #11 rév. 2026-10-09, D6) : ajout de pret/equipe/composition à la publication supabase_realtime + REPLICA IDENTITY FULL. Aucune policy ni grant (RLS de lecture existante ; anon ne reçoit rien).',
  'julleroyfr'
)
on conflict (version) do nothing;
