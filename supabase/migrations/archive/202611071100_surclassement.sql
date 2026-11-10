-- ===========================================================================
-- 202611071100_surclassement
--
-- Objet : surclassement d'un grimpeur enfant en ado (spec #21, validée le
--         2026-11-07 ; spec #1 R34/R35 révisées).
--   1. Table `surclassement` : un accord par grimpeur et par saison, avec sa
--      date de révocation (historique conservé, R11/R19). Au plus un
--      surclassement ACTIF (non révoqué) par grimpeur et par saison (R4).
--   2. RLS : écriture réservée à l'admin (R1) ; lecture par l'admin et par
--      quiconque voit le grimpeur (coach de son club, coach d'accueil d'un
--      prêt…, policy `grimpeur_select`). Seule la colonne `revoque_le` est
--      modifiable, et seulement par la RPC de révocation (admin).
--   3. RPC `revoquer_surclassement` (SECURITY INVOKER, garde `est_admin()`) :
--      en UNE transaction (R14), fin du surclassement + retrait du grimpeur des
--      équipes et prêts des rencontres ado de la saison en ① pré-compétition ou
--      ② préparation (R12) ; rien n'est touché dès la ③ compétition (R13).
--      Renvoie le nombre de rencontres quittées (R15).
--
-- L'âge de bascule n'est connu que de l'application (variable AGE_BASCULE,
-- spec #1 R34bis) : l'accord (R3) est contrôlé par l'application, et la RPC
-- reçoit `p_retirer` = faux quand le grimpeur reste éligible ado par son âge.
--
-- Réversibilité : supabase/retours-arriere/202611071100_surclassement_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

-- 1. Table ------------------------------------------------------------------

create table if not exists interclub.surclassement (
  id           uuid primary key default gen_random_uuid(),
  grimpeur_id  uuid not null references interclub.grimpeur (id) on delete cascade,
  -- Année de début de saison (spec #1 R37).
  saison       int not null check (saison between 2000 and 2100),
  accorde_le   timestamptz not null default now(),
  revoque_le   timestamptz,
  constraint chk_surclassement_revocation check (revoque_le is null or revoque_le >= accorde_le)
);
create index if not exists idx_surclassement_grimpeur_id on interclub.surclassement (grimpeur_id);
-- Au plus un surclassement actif par grimpeur et par saison (R4).
create unique index if not exists uq_surclassement_actif
  on interclub.surclassement (grimpeur_id, saison) where revoque_le is null;

comment on table interclub.surclassement is
  'Surclassement enfant → ado d''un grimpeur pour une saison (spec #21). Actif tant que revoque_le est nul.';

-- 2. Droits et RLS ----------------------------------------------------------

alter table interclub.surclassement enable row level security;
revoke all on interclub.surclassement from public, anon;
grant select, insert on interclub.surclassement to authenticated;
grant update (revoque_le) on interclub.surclassement to authenticated;
-- Lectures transverses des écrans admin (grimpeurs éligibles, ADR 0002/0003).
grant select on interclub.surclassement to service_role;

-- Lecture : admin, ou tout acteur qui voit le grimpeur (RLS de `grimpeur`).
drop policy if exists "surclassement_select" on interclub.surclassement;
create policy "surclassement_select" on interclub.surclassement for select
  to authenticated
  using (
    interclub.est_admin()
    or exists (select 1 from interclub.grimpeur g where g.id = grimpeur_id)
  );

drop policy if exists "surclassement_insert" on interclub.surclassement;
create policy "surclassement_insert" on interclub.surclassement for insert
  to authenticated with check (interclub.est_admin() and revoque_le is null);

drop policy if exists "surclassement_update" on interclub.surclassement;
create policy "surclassement_update" on interclub.surclassement for update
  to authenticated using (interclub.est_admin()) with check (interclub.est_admin());

-- 3. Révocation atomique ----------------------------------------------------

create or replace function interclub.revoquer_surclassement(
  p_grimpeur uuid,
  p_saison   int,
  p_retirer  boolean default true
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id          uuid;
  v_rencontres  int := 0;
begin
  if not interclub.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  -- Surclassement actif, verrouillé : deux révocations simultanées s'excluent.
  select s.id into v_id
  from interclub.surclassement s
  where s.grimpeur_id = p_grimpeur and s.saison = p_saison and s.revoque_le is null
  for update;
  if v_id is null then
    raise exception 'surclassement_introuvable' using errcode = 'P0002';
  end if;

  update interclub.surclassement set revoque_le = now() where id = v_id;

  if p_retirer then
    -- Rencontres ado de la saison encore en ① / ② (R12) ; la saison d'une
    -- rencontre se déduit de sa date (1er septembre, spec #1 R37).
    with cibles as (
      select r.id
      from interclub.rencontre r
      where r.categorie = 'ado'
        and r.phase in ('pre_competition', 'preparation')
        and (extract(year from r.date_rencontre)::int
             - case when extract(month from r.date_rencontre) < 9 then 1 else 0 end) = p_saison
    ),
    compos as (
      delete from interclub.composition c
      using cibles
      where c.rencontre_id = cibles.id and c.grimpeur_id = p_grimpeur
      returning c.rencontre_id
    ),
    prets as (
      delete from interclub.pret p
      using cibles
      where p.rencontre_id = cibles.id and p.grimpeur_id = p_grimpeur
      returning p.rencontre_id
    )
    select count(distinct x.rencontre_id) into v_rencontres
    from (select rencontre_id from compos union all select rencontre_id from prets) x;
  end if;

  return v_rencontres;
end;
$$;

comment on function interclub.revoquer_surclassement(uuid, int, boolean) is
  'Révoque le surclassement actif (spec #21 R11) et retire le grimpeur des rencontres ado de la saison en ①/② (R12–R14). Renvoie le nombre de rencontres quittées.';

revoke execute on function interclub.revoquer_surclassement(uuid, int, boolean) from public, anon;
grant execute on function interclub.revoquer_surclassement(uuid, int, boolean) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611071100_surclassement',
  'Surclassement enfant → ado (spec #21) : table surclassement (historique, un actif par grimpeur et saison), RLS admin en écriture, lecture à qui voit le grimpeur, RPC revoquer_surclassement (retrait atomique des rencontres ado en ①/②). Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
