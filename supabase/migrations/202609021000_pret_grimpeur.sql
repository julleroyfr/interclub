-- ===========================================================================
-- Prêt de grimpeur : relation PERSISTANTE distincte de l'affectation en équipe
-- (spec #1 R35/R36, spec #5 R12/R13, rév. 2026-09-02)
-- ---------------------------------------------------------------------------
-- Le prêt exprime « ce grimpeur (d'un autre club) est mis à disposition du club
-- d'accueil pour cette rencontre ». Créé/révoqué par l'ADMIN seul (R35). Tant
-- qu'il est actif, le coach d'accueil gère le grimpeur comme les siens : il
-- l'affecte / le retire / le déplace entre ses équipes (R36) — le retrait ne met
-- PAS fin au prêt. On garde AUSSI le chemin direct admin (insertion en équipe
-- d'un cross-club sans prêt) : les deux coexistent.
-- ===========================================================================

create table if not exists interclub.pret (
  rencontre_id    uuid not null references interclub.rencontre(id) on delete cascade,
  grimpeur_id     uuid not null references interclub.grimpeur(id)  on delete cascade,
  club_accueil_id uuid not null references interclub.club(id),
  -- Un grimpeur est prêté à au plus un club par rencontre.
  primary key (rencontre_id, grimpeur_id)
);

alter table interclub.pret enable row level security;
grant select, insert, update, delete on interclub.pret to authenticated;
-- Lecture des catalogues par les écrans admin via service_role (ADR 0002/0003) :
-- l'écran de gestion des prêts liste prêts et grimpeurs (tous clubs).
grant select on interclub.pret to service_role;
grant select on interclub.grimpeur to service_role;

-- RLS pret : lecture admin + coach du club d'accueil (pour peupler son roster) ;
-- écriture réservée à l'admin (R35).
drop policy if exists "pret_select" on interclub.pret;
create policy "pret_select" on interclub.pret for select
  to authenticated
  using (interclub.est_admin() or interclub.est_coach_de_club(club_accueil_id));

drop policy if exists "pret_insert" on interclub.pret;
create policy "pret_insert" on interclub.pret for insert
  to authenticated with check (interclub.est_admin());

drop policy if exists "pret_update" on interclub.pret;
create policy "pret_update" on interclub.pret for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

drop policy if exists "pret_delete" on interclub.pret;
create policy "pret_delete" on interclub.pret for delete
  to authenticated using (interclub.est_admin());

-- --- Lecture d'un grimpeur PRÊTÉ à un club que je coache (roster, avant même -
--     toute composition). Complète voit_grimpeur_via_engagement (202609020900).
create or replace function interclub.voit_grimpeur_via_pret(p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.pret p
    where p.grimpeur_id = p_grimpeur
      and interclub.est_coach_de_club(p.club_accueil_id)
  );
$$;

drop policy if exists "grimpeur_select" on interclub.grimpeur;
create policy "grimpeur_select" on interclub.grimpeur for select
  to authenticated
  using (
    interclub.est_admin()
    or interclub.est_coach_de_club(club_id)
    or interclub.voit_grimpeur_via_engagement(id)
    or interclub.voit_grimpeur_via_pret(id)
  );

-- --- Le coach peut ENGAGER un grimpeur prêté à son club dans une équipe qu'il --
--     peut éditer (R36 + gating de phase). L'INSERT reste refusé pour un
--     cross-club SANS prêt (R13) ; le chemin admin direct passe par est_admin().
create or replace function interclub.peut_engager_prete(p_equipe uuid, p_grimpeur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from interclub.equipe e
    join interclub.pret   p
      on p.rencontre_id = e.rencontre_id
     and p.grimpeur_id  = p_grimpeur
     and p.club_accueil_id = e.club_id
    where e.id = p_equipe
      and interclub.peut_ecrire_equipe(e.club_id, e.rencontre_id)
  );
$$;

drop policy if exists "composition_insert" on interclub.composition;
create policy "composition_insert" on interclub.composition for insert
  to authenticated
  with check (
    interclub.est_admin()
    or interclub.peut_ecrire_composition(equipe_id, grimpeur_id)
    or interclub.peut_engager_prete(equipe_id, grimpeur_id)
  );

-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609021000_pret_grimpeur',
  'Table pret (rencontre, grimpeur, club_accueil) = prêt persistant, écriture admin (R35) + lecture coach d''accueil. grimpeur_select élargi (voit_grimpeur_via_pret : roster). composition_insert élargi (peut_engager_prete : le coach affecte un prêté à son équipe, R36). Grants service_role select sur pret+grimpeur (écran admin de prêts, ADR 0002/0003). Chemin admin direct conservé. Spec #1 R35/R36, spec #5 R12/R13.',
  'julleroyfr'
)
on conflict (version) do nothing;
