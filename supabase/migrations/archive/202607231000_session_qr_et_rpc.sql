-- Migration : 202607231000_session_qr_et_rpc
-- Description : table `interclub.session_qr` (lie un utilisateur anonyme au
--               jeton scanné) + RLS + RPC `ouvrir_session_qr` (SECURITY
--               DEFINER) — ADR 0001, spec #2 R6–R14, R22–R25.
-- Dépendance : requiert 202607221200 (jeton_qr) et 202607221100 (rencontre).
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Prérequis Supabase Dashboard : activer « Anonymous sign-ins »
--   (Authentication → Providers → Anonymous).
-- Réf. : docs/decisions/0001-authentification-sessions-ephemeres-qr.md
--         docs/specs/02-authentification-et-sessions-qr.md R6–R14

-- ---------------------------------------------------------------------------
-- 1. session_qr — lie un utilisateur anonyme au jeton qu'il a scanné (ADR 0001 §4).
--    Pas de `updated_at` : la ligne est créée à l'ouverture et ne change pas.
-- ---------------------------------------------------------------------------
create table if not exists interclub.session_qr (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  jeton_qr_id    uuid not null references interclub.jeton_qr (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create index if not exists idx_session_qr_utilisateur_id on interclub.session_qr (utilisateur_id);
create index if not exists idx_session_qr_jeton_qr_id    on interclub.session_qr (jeton_qr_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — fail-closed. L'utilisateur voit uniquement sa propre ligne.
--    Aucun insert/update/delete direct (ouverture par la RPC uniquement).
-- ---------------------------------------------------------------------------
alter table interclub.session_qr enable row level security;

drop policy if exists "session_qr_select_own" on interclub.session_qr;
create policy "session_qr_select_own" on interclub.session_qr
  for select
  using (utilisateur_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Grants lecture — anon et authenticated peuvent lire leur propre ligne
--    (la policy filtre déjà ; le grant est la pré-condition).
-- ---------------------------------------------------------------------------
grant select on interclub.session_qr to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC ouvrir_session_qr — seule surface SECURITY DEFINER (ADR 0001 §2).
--    Valide le secret, la phase ②, puis insère la session et renvoie le
--    rôle + périmètre. `set search_path` restreint la surface d'attaque.
-- ---------------------------------------------------------------------------
create or replace function interclub.ouvrir_session_qr(p_valeur uuid)
returns jsonb
language plpgsql
security definer
set search_path = interclub, public
as $$
declare
  v_jeton    interclub.jeton_qr%rowtype;
  v_rencontre interclub.rencontre%rowtype;
begin
  -- Retrouver le jeton par son secret (valeur unique non devinable).
  select * into v_jeton
    from interclub.jeton_qr
   where valeur = p_valeur;

  if not found then
    raise exception 'jeton_inconnu' using errcode = 'P0001';
  end if;

  -- R22 : jeton révoqué → aucune session.
  if not v_jeton.actif then
    raise exception 'jeton_revoque' using errcode = 'P0002';
  end if;

  -- R12 : hors phase ② (competition) → aucune session.
  select * into v_rencontre
    from interclub.rencontre
   where id = v_jeton.rencontre_id;

  if v_rencontre.phase <> 'competition' then
    raise exception 'hors_phase_competition' using errcode = 'P0003';
  end if;

  -- Ouvrir la session : lier cet utilisateur anonyme au jeton.
  insert into interclub.session_qr (utilisateur_id, jeton_qr_id)
  values (auth.uid(), v_jeton.id);

  -- Retourner rôle + périmètre (snake_case pour correspondre à la convention SQL).
  return jsonb_build_object(
    'nature',           v_jeton.nature,
    'club_id',          v_jeton.club_id,
    'voie_vitesse_id',  v_jeton.voie_vitesse_id,
    'rencontre_id',     v_jeton.rencontre_id
  );
end;
$$;

-- L'anon exécute AVANT signInAnonymously (race possible) ; authenticated = après.
grant execute on function interclub.ouvrir_session_qr(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202607231000_session_qr_et_rpc',
  'session_qr (utilisateur_id → jeton_qr_id) + RLS select own + RPC ouvrir_session_qr SECURITY DEFINER (ADR 0001).',
  'julleroyfr'
)
on conflict (version) do nothing;
