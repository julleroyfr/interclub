-- ===========================================================================
-- 202609011500_session_qr_coach_temp_prepa
--
-- Objet : rendre le coach temporaire opérationnel le jour J (spec #5 R16,
--         spec #2 R12, rév. 2026-09-01). Deux évolutions des surfaces
--         SECURITY DEFINER des sessions QR :
--
--   1. `ouvrir_session_qr` — validité de la fenêtre désormais NATURE-DÉPENDANTE
--      (spec #2 R12) : un jeton « coach temporaire » ouvre une session en
--      phase `preparation` OU `competition` (le jour J) ; un jeton « juge »
--      reste borné à `competition`. Auparavant l'ouverture exigeait
--      `competition` pour toute nature, ce qui empêchait le coach temporaire
--      de préparer l'engagement en `preparation`.
--
--   2. `contexte_coach_temporaire()` — NOUVELLE RPC de lecture : renvoie le
--      périmètre (club + rencontre) de la session temporaire active de
--      l'utilisateur courant, pour que la couche applicative (Next) puisse
--      autoriser l'espace coach et l'édition. Nécessaire car l'anonyme ne peut
--      PAS lire `jeton_qr` directement (policy `jeton_qr` = admin ou coach
--      permanent du club via `club_courant()`, NULL pour un anonyme).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Idempotent : `create or replace` + `grant` réappliquables.
-- Réf. : docs/specs/02-authentification-et-sessions-qr.md R12,
--         docs/specs/05-espace-coach.md R16, ADR 0001.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. ouvrir_session_qr — fenêtre nature-dépendante (spec #2 R12).
--    Remplace la version 202607231000 (exigeait `competition` pour toute nature).
-- ---------------------------------------------------------------------------
create or replace function interclub.ouvrir_session_qr(p_valeur uuid)
returns jsonb
language plpgsql
security definer
set search_path = interclub, public
as $$
declare
  v_jeton     interclub.jeton_qr%rowtype;
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

  -- R12 : hors de la fenêtre du jeton → aucune session. La fenêtre dépend de la
  -- NATURE : coach temporaire = préparation OU compétition (le jour J) ; juge =
  -- compétition uniquement.
  select * into v_rencontre
    from interclub.rencontre
   where id = v_jeton.rencontre_id;

  if v_jeton.nature = 'coach_temporaire' then
    if v_rencontre.phase not in ('preparation', 'competition') then
      raise exception 'hors_fenetre' using errcode = 'P0003';
    end if;
  else
    -- Juge (et toute autre nature future non prévue) : compétition seule.
    if v_rencontre.phase <> 'competition' then
      raise exception 'hors_fenetre' using errcode = 'P0003';
    end if;
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

grant execute on function interclub.ouvrir_session_qr(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. contexte_coach_temporaire — périmètre de la session temporaire active de
--    l'utilisateur courant, pour la garde applicative (spec #5 R16).
--    SECURITY DEFINER : contourne la RLS `jeton_qr` (inaccessible à l'anonyme).
--    Ne renvoie une ligne que si la session est « du jour » (préparation OU
--    compétition) et le jeton actif — révoquée/close ⇒ NULL (fail-closed).
--    À la scan multiple, on retient la session la plus récente.
-- ---------------------------------------------------------------------------
create or replace function interclub.contexte_coach_temporaire()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'club_id',      j.club_id,
    'rencontre_id', j.rencontre_id,
    'phase',        r.phase
  )
  from interclub.session_qr s
  join interclub.jeton_qr   j on j.id = s.jeton_qr_id
  join interclub.rencontre  r on r.id = j.rencontre_id
  where s.utilisateur_id = auth.uid()
    and j.actif
    and j.nature = 'coach_temporaire'
    and r.phase in ('preparation', 'competition')
  order by s.created_at desc
  limit 1;
$$;

grant execute on function interclub.contexte_coach_temporaire() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609011500_session_qr_coach_temp_prepa',
  'ouvrir_session_qr : fenêtre nature-dépendante (coach temp = préparation/compétition, juge = compétition ; spec #2 R12) ; nouvelle RPC contexte_coach_temporaire() (club+rencontre de la session temporaire active) pour la garde applicative (spec #5 R16).',
  'julleroyfr'
)
on conflict (version) do nothing;
