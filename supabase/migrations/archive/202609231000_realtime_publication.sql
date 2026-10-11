-- Migration : publication Realtime des tables de résultats (spec #11 R1–R3).
--
-- Active Supabase Realtime *Postgres Changes* sur les tables sources du live des
-- écrans AUTHENTIFIÉS (coach #6, admin #9, classement #7, juge #10) :
--   - resultat_voie / resultat_bloc  → saisie coach/admin + classement ;
--   - points_vitesse (table dérivée)  → classement (bouge à chaque temps) ;
--   - temps_vitesse                   → saisie coach/admin (score voie+bloc+vitesse)
--                                       + synchronisation entre écrans juge.
--
-- Sécurité (spec #11 R5, spec #8 préservée) : Realtime évalue la RLS du rôle
-- ABONNÉ. Les policies SELECT « authentifié dès ③ » existent déjà (migrations
-- 202607251000 / 202609081000 / 202609221400 / 202609221600) et `authenticated`
-- a le GRANT SELECT sur les 4 tables. `anon` n'a NI policy NI grant de lecture sur
-- ces tables → un abonnement anonyme ne reçoit RIEN : AUCUNE ouverture `anon`
-- n'est nécessaire ni faite ici (le live public reste hors périmètre — Broadcast
-- serveur ultérieur). Cette migration N'AJOUTE donc aucune policy ni aucun grant.
--
-- REPLICA IDENTITY FULL : sans elle, un évènement DELETE ne porte que la clé
-- primaire, ce qui peut empêcher Realtime d'évaluer la RLS et de diffuser un DELETE
-- légitime (spec #11, « Contraintes de données »). Coût WAL négligeable (petites
-- tables, écritures humaines).
--
-- Application manuelle (recette/prod à la main). Validée en local (Docker).

-- ===========================================================================
-- 1. Publication `supabase_realtime` — présente par défaut sur Supabase ;
--    créée (vide) si absente, pour rejouabilité en local/pur Postgres.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- ===========================================================================
-- 2. Ajout des 4 tables sources à la publication (idempotent).
-- ===========================================================================

do $$
declare
  t text;
  tables text[] := array[
    'resultat_voie',
    'resultat_bloc',
    'points_vitesse',
    'temps_vitesse'
  ];
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
-- 3. REPLICA IDENTITY FULL — évènements DELETE complets pour l'évaluation RLS.
--    (Rejouable : positionner l'identité de réplication est idempotent.)
-- ===========================================================================

alter table interclub.resultat_voie   replica identity full;
alter table interclub.resultat_bloc   replica identity full;
alter table interclub.points_vitesse  replica identity full;
alter table interclub.temps_vitesse   replica identity full;

-- ===========================================================================
-- 4. Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609231000_realtime_publication',
  'Publication Realtime (spec #11) : ajout de resultat_voie/resultat_bloc/points_vitesse/temps_vitesse à la publication supabase_realtime + REPLICA IDENTITY FULL (DELETE complets). Aucune policy ni grant (RLS ③ existante ; anon reçoit rien → spec #8 préservée).',
  'julleroyfr'
);
