-- Migration : 202609081000_saisie_resultats_voie_bloc
-- Description : modèle réel de la SAISIE DES RÉSULTATS (spec #6). Remplace le
--               placeholder `interclub.resultat` (valeur text, jamais utilisé) par
--               deux tables dédiées :
--                 - resultat_voie (issue par voie de difficulté × grimpeur, R8–R14) ;
--                 - resultat_bloc (palier atteint par bloc × grimpeur, R15–R17).
--               + helpers d'écriture voie/bloc (réutilisent peut_ecrire_resultat,
--               T6 : permanent OU temporaire en phase ③ compétition, via
--               composition → couvre le grimpeur prêté, R36) ;
--               + LECTURE des résultats et de la structure (voies/blocs/paliers)
--               ouverte à TOUT compte authentifié, tous clubs confondus, DÈS la
--               phase ③ (R6/R8, rév. spec #1 2026-09-08). La phase ⑤ ne change pas
--               la visibilité : elle officialise (fige) — hors de cette migration.
-- Hors périmètre de cette migration (itérations dédiées) :
--   - Accès `anon` (visiteur NON authentifié) : le DROIT de lecture publique dès
--     la ③ est acté (spec #1 R8), mais la surface publique concrète (route + grants
--     `anon`) relève d'une itération dédiée. Ici : lecture `authenticated` seule.
--   - NP automatique à la clôture (R18) : matérialisé côté application dans
--     l'action `changerPhaseRencontre` (③→④) via le domaine `manquantsCloture` +
--     `voiesDuGroupeDepart` (pas de duplication de l'échelle des niveaux en SQL).
--     La colonne `issue` accepte déjà 'np' pour ces insertions (admin).
-- Sources : docs/specs/06-saisie-des-resultats.md ; spec #1 R8 (rév. 2026-09-08) ;
--           spec #3 R38/R39 (points/paliers) ; T6 (202607251000, helpers).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Réf. conventions : docs/conventions/03-base-de-donnees-supabase.md §2bis, §3, §5.

-- ===========================================================================
-- 1. Retrait du placeholder `resultat` (non utilisé par le code applicatif).
--    CASCADE retire ses policies (resultat_*) et dépendances. `temps_vitesse`
--    (vitesse, juge) est CONSERVÉE : hors périmètre spec #6.
-- ===========================================================================
drop table if exists interclub.resultat cascade;

-- ===========================================================================
-- 2. Tables de résultats voie / bloc.
-- ===========================================================================

-- resultat_voie : une issue par (voie de difficulté, grimpeur) — R8/R13.
--   Meilleure tentative, pas de cumul. Cohérence issue ↔ catégorie/type de voie
--   (R10/R12) garantie par trigger (nécessite des jointures : hors d'un CHECK).
create table if not exists interclub.resultat_voie (
  id                 uuid primary key default gen_random_uuid(),
  voie_difficulte_id uuid not null
                       references interclub.voie_difficulte (id) on delete cascade,
  grimpeur_id        uuid not null
                       references interclub.grimpeur (id) on delete cascade,
  issue              text not null
                       check (issue in ('top', 'prise_valorisee', 'zone1', 'zone2', 'echec', 'np')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (voie_difficulte_id, grimpeur_id)          -- R13 : une réalisation par voie
);
create index if not exists idx_resultat_voie_voie
  on interclub.resultat_voie (voie_difficulte_id);
create index if not exists idx_resultat_voie_grimpeur
  on interclub.resultat_voie (grimpeur_id);

-- resultat_bloc : une issue par (bloc, grimpeur) — R15/R17.
--   `palier_id` = meilleur palier atteint (R16), requis SSI issue = 'palier'.
--   Appartenance du palier au bloc garantie par trigger (jointure).
create table if not exists interclub.resultat_bloc (
  id           uuid primary key default gen_random_uuid(),
  bloc_id      uuid not null references interclub.bloc (id) on delete cascade,
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  issue        text not null check (issue in ('palier', 'echec', 'np')),
  palier_id    uuid references interclub.bloc_palier (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (bloc_id, grimpeur_id),                    -- R17 : un résultat par bloc
  check ((issue = 'palier') = (palier_id is not null))  -- R16 : palier ⇔ palier_id
);
create index if not exists idx_resultat_bloc_bloc
  on interclub.resultat_bloc (bloc_id);
create index if not exists idx_resultat_bloc_grimpeur
  on interclub.resultat_bloc (grimpeur_id);

-- ===========================================================================
-- 3. Triggers : updated_at + validations métier (R10/R12/R16).
-- ===========================================================================

drop trigger if exists trg_resultat_voie_updated_at on interclub.resultat_voie;
create trigger trg_resultat_voie_updated_at
  before update on interclub.resultat_voie
  for each row execute function interclub.set_updated_at();

drop trigger if exists trg_resultat_bloc_updated_at on interclub.resultat_bloc;
create trigger trg_resultat_bloc_updated_at
  before update on interclub.resultat_bloc
  for each row execute function interclub.set_updated_at();

-- Cohérence issue ↔ catégorie / type de voie (R10/R12) :
--   - 'prise_valorisee' : voies TÊTE ENFANT uniquement ;
--   - 'zone1' / 'zone2' : catégorie ADO uniquement.
--   ('top', 'echec', 'np' : admises partout.)
create or replace function interclub.valider_resultat_voie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorie text;
  v_type_voie text;
begin
  select r.categorie, vd.type_voie
    into v_categorie, v_type_voie
  from interclub.voie_difficulte vd
  join interclub.epreuve   e on e.id = vd.epreuve_id
  join interclub.rencontre r on r.id = e.rencontre_id
  where vd.id = new.voie_difficulte_id;

  if new.issue = 'prise_valorisee'
     and not (v_categorie = 'enfant' and v_type_voie = 'tete') then
    raise exception
      'Issue « prise_valorisee » réservée aux voies tête enfant (R10).';
  end if;

  if new.issue in ('zone1', 'zone2') and v_categorie <> 'ado' then
    raise exception
      'Issues « zone1 »/« zone2 » réservées à la catégorie ado (R12).';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_resultat_voie_valider on interclub.resultat_voie;
create trigger trg_resultat_voie_valider
  before insert or update on interclub.resultat_voie
  for each row execute function interclub.valider_resultat_voie();

-- Appartenance du palier au bloc (R16) : le palier référencé doit être un palier
-- de CE bloc.
create or replace function interclub.valider_resultat_bloc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.palier_id is not null
     and not exists (
       select 1 from interclub.bloc_palier bp
       where bp.id = new.palier_id and bp.bloc_id = new.bloc_id
     ) then
    raise exception 'Le palier choisi doit appartenir au bloc (R16).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resultat_bloc_valider on interclub.resultat_bloc;
create trigger trg_resultat_bloc_valider
  before insert or update on interclub.resultat_bloc
  for each row execute function interclub.valider_resultat_bloc();

-- ===========================================================================
-- 4. Helpers de périmètre (SECURITY DEFINER) — écriture et lecture.
--    Réutilisent peut_ecrire_resultat(epreuve, grimpeur) (T6 : permanent en ③
--    compétition OU coach temporaire, via composition — couvre le prêté R36).
-- ===========================================================================

-- Résultats consultables : la rencontre a atteint la ③ compétition (ou au-delà).
-- Avant la ③, aucun résultat n'existe ; la ⑤ ne change que le caractère officiel.
create or replace function interclub.resultats_visibles(p_rencontre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select interclub.phase_de_rencontre(p_rencontre)
         in ('competition', 'cloture', 'resultats_publics');
$$;

-- Écriture d'un résultat de voie : droit de saisie sur l'épreuve de la voie.
create or replace function interclub.peut_ecrire_resultat_voie(p_voie uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.voie_difficulte vd
    where vd.id = p_voie
      and interclub.peut_ecrire_resultat(vd.epreuve_id, p_grimpeur)
  );
$$;

-- Lecture d'un résultat de voie : rencontre de la voie en phase ③+ (public
-- authentifié, tous clubs — R6/R8).
create or replace function interclub.resultat_voie_lisible(p_voie uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.voie_difficulte vd
    join interclub.epreuve e on e.id = vd.epreuve_id
    where vd.id = p_voie
      and interclub.resultats_visibles(e.rencontre_id)
  );
$$;

-- Écriture d'un résultat de bloc.
create or replace function interclub.peut_ecrire_resultat_bloc(p_bloc uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from interclub.bloc b
    where b.id = p_bloc
      and interclub.peut_ecrire_resultat(b.epreuve_id, p_grimpeur)
  );
$$;

-- Lecture d'un résultat de bloc : rencontre du bloc en phase ③+.
create or replace function interclub.resultat_bloc_lisible(p_bloc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.bloc b
    join interclub.epreuve e on e.id = b.epreuve_id
    where b.id = p_bloc
      and interclub.resultats_visibles(e.rencontre_id)
  );
$$;

-- ===========================================================================
-- 5. Grants (authenticated) — la RLS reste la frontière. `anon` : différé
--    (itération surface publique). `service_role` conserve ses accès admin.
-- ===========================================================================
grant select, insert, update, delete on interclub.resultat_voie to authenticated;
grant select, insert, update, delete on interclub.resultat_bloc to authenticated;
grant select on interclub.resultat_voie to service_role;
grant select on interclub.resultat_bloc to service_role;

grant execute on function interclub.resultats_visibles(uuid)                 to authenticated;
grant execute on function interclub.peut_ecrire_resultat_voie(uuid, uuid)    to authenticated;
grant execute on function interclub.resultat_voie_lisible(uuid)              to authenticated;
grant execute on function interclub.peut_ecrire_resultat_bloc(uuid, uuid)    to authenticated;
grant execute on function interclub.resultat_bloc_lisible(uuid)              to authenticated;

-- ===========================================================================
-- 6. RLS — résultats voie/bloc. Une policy par opération (rejouable).
--    Lecture : admin OU rencontre en ③+ (tout authentifié, tous clubs — R6/R8).
--    Écriture : admin OU coach habilité (permanent ③ / temporaire ③) — R5/R7.
-- ===========================================================================
alter table interclub.resultat_voie enable row level security;
alter table interclub.resultat_bloc enable row level security;

drop policy if exists "resultat_voie_select" on interclub.resultat_voie;
create policy "resultat_voie_select" on interclub.resultat_voie for select
  to authenticated
  using (interclub.est_admin() or interclub.resultat_voie_lisible(voie_difficulte_id));

drop policy if exists "resultat_voie_insert" on interclub.resultat_voie;
create policy "resultat_voie_insert" on interclub.resultat_voie for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_voie_update" on interclub.resultat_voie;
create policy "resultat_voie_update" on interclub.resultat_voie for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_voie_delete" on interclub.resultat_voie;
create policy "resultat_voie_delete" on interclub.resultat_voie for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_bloc_select" on interclub.resultat_bloc;
create policy "resultat_bloc_select" on interclub.resultat_bloc for select
  to authenticated
  using (interclub.est_admin() or interclub.resultat_bloc_lisible(bloc_id));

drop policy if exists "resultat_bloc_insert" on interclub.resultat_bloc;
create policy "resultat_bloc_insert" on interclub.resultat_bloc for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

drop policy if exists "resultat_bloc_update" on interclub.resultat_bloc;
create policy "resultat_bloc_update" on interclub.resultat_bloc for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

drop policy if exists "resultat_bloc_delete" on interclub.resultat_bloc;
create policy "resultat_bloc_delete" on interclub.resultat_bloc for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

-- ===========================================================================
-- 7. Lecture de la STRUCTURE ouverte dès la ③ (pour afficher les résultats).
--    Auparavant (202607291000 / 202607311000) : lecture réservée à
--    `resultats_publics` ou admin. On l'élargit à toute rencontre en ③+ afin que
--    tout compte authentifié voie les voies/blocs/paliers pendant la compétition
--    (R6/R8). Écriture inchangée (admin, spec #3).
-- ===========================================================================
drop policy if exists voie_difficulte_select_authenticated on interclub.voie_difficulte;
create policy voie_difficulte_select_authenticated
  on interclub.voie_difficulte for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1 from interclub.epreuve e
      where e.id = voie_difficulte.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

drop policy if exists bloc_select_authenticated on interclub.bloc;
create policy bloc_select_authenticated
  on interclub.bloc for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1 from interclub.epreuve e
      where e.id = bloc.epreuve_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

drop policy if exists bloc_palier_select_authenticated on interclub.bloc_palier;
create policy bloc_palier_select_authenticated
  on interclub.bloc_palier for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (
      select 1
      from interclub.bloc b
      join interclub.epreuve e on e.id = b.epreuve_id
      where b.id = bloc_palier.bloc_id
        and interclub.resultats_visibles(e.rencontre_id)
    )
  );

-- ===========================================================================
-- 8. Suivi de version (idempotent).
-- ===========================================================================
insert into interclub.version (version, description, applique_par)
values (
  '202609081000_saisie_resultats_voie_bloc',
  'Saisie des résultats (spec #6) : tables resultat_voie (issue par voie×grimpeur, R8–R14) et resultat_bloc (palier par bloc×grimpeur, R15–R17) remplaçant le placeholder resultat ; triggers de cohérence issue↔catégorie (R10/R12) et palier↔bloc (R16) ; helpers peut_ecrire_resultat_voie/_bloc (réutilisent peut_ecrire_resultat, ③ compétition) et resultat_*_lisible ; lecture des résultats et de la structure (voie_difficulte/bloc/bloc_palier) ouverte à tout authentifié dès la ③ (R6/R8, rév. spec #1 2026-09-08). anon (surface publique) et NP clôture (action) hors migration.',
  'julleroyfr'
)
on conflict (version) do nothing;
