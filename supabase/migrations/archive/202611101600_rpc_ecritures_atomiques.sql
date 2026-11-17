-- ===========================================================================
-- 202611101600_rpc_ecritures_atomiques
--
-- Objet : écritures en plusieurs étapes faites en UN appel et UNE transaction
--         (lot 7 du plan « appels Supabase », constats A1–A5 et P15 de
--         l'analyse du 2026-10-09 ; décision D-P2 : une fonction SQL par
--         opération). Auparavant, chaque action enchaînait 2 ou 3 écritures
--         depuis TypeScript : un échec à mi-parcours laissait un état partiel.
--           A1  barème de vitesse d'une rencontre : points fixes, puis
--               suppression et réinsertion des échelons — un échec après la
--               suppression laissait l'épreuve SANS échelons ;
--           A2  idem pour le barème du gabarit ;
--           A3  régénération d'un jeton QR : révocation puis insertion — un
--               échec de l'insertion laissait le périmètre sans jeton actif ;
--               le jeton était en plus relu (P15) ;
--           A4  régénération de l'invitation coach d'un club : idem ;
--           A5  génération de l'invitation administrateur : désactivation de
--               l'active puis insertion : idem.
--
--         Les cinq fonctions sont SECURITY INVOKER : elles écrivent sous
--         l'identité de l'appelant, la RLS reste la frontière (admin ; coach
--         pour les jetons de coach temporaire de son club). Les opérations
--         réservées à l'admin vérifient en plus `est_admin()` en tête, pour un
--         refus net. Les gardes de phase de la structure (trigger
--         `*_structure_modifiable`, 202611101500) s'appliquent au barème
--         d'une rencontre.
--
--   mettre_a_jour_bareme_vitesse(p_epreuve, p_points_chute,
--       p_points_non_presentation, p_echelons) — spec #3 R46–R48, R55e :
--       refusé si une saisie de vitesse existe (`bareme_saisies_existantes`).
--   mettre_a_jour_bareme_vitesse_gabarit(p_gabarit_epreuve, …) — spec #3
--       R46–R48, R31.
--       `p_echelons` : tableau JSON d'objets {rang_min, rang_max, points,
--       decrement}, déjà validé par le domaine (R48) ; `ordre` = position.
--   regenerer_jeton(p_jeton) → id du nouveau jeton — spec #2 R23.
--   regenerer_invitation_coach(p_invitation) → id — spec #2 R29.
--   generer_invitation_admin() → id — spec #2 R37.
--
-- Erreurs (message = code) : `non_admin` (42501), `epreuve_introuvable`,
--       `jeton_introuvable`, `invitation_introuvable` (P0002),
--       `bareme_saisies_existantes` (P0001).
--
-- EXECUTE à `authenticated` seul. Aucune table ni policy modifiée. Additive.
-- Comportement métier inchangé.
-- Réversibilité : supabase/retours-arriere/202611101600_rpc_ecritures_atomiques_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A1 — Barème de vitesse d'une rencontre
-- ---------------------------------------------------------------------------

create or replace function interclub.mettre_a_jour_bareme_vitesse(
  p_epreuve                 uuid,
  p_points_chute            int,
  p_points_non_presentation int,
  p_echelons                jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not interclub.est_admin() then
    raise exception 'non_admin' using errcode = '42501';
  end if;

  -- R55e : les points de vitesse matérialisés ne seraient pas recalculés.
  if exists (select 1 from interclub.points_vitesse where epreuve_id = p_epreuve) then
    raise exception 'bareme_saisies_existantes' using errcode = 'P0001';
  end if;

  update interclub.epreuve
     set points_chute = p_points_chute,
         points_non_presentation = p_points_non_presentation
   where id = p_epreuve and type = 'vitesse';
  if not found then
    raise exception 'epreuve_introuvable' using errcode = 'P0002';
  end if;

  -- Remplacement du jeu d'échelons (R47).
  delete from interclub.bareme_vitesse_echelon where epreuve_id = p_epreuve;
  insert into interclub.bareme_vitesse_echelon
    (epreuve_id, rang_min, rang_max, points, decrement, ordre)
  select p_epreuve,
         (e.valeur->>'rang_min')::int,
         (e.valeur->>'rang_max')::int,
         (e.valeur->>'points')::int,
         (e.valeur->>'decrement')::int,
         e.position::int
    from jsonb_array_elements(p_echelons) with ordinality as e(valeur, position);
end;
$$;

-- ---------------------------------------------------------------------------
-- A2 — Barème de vitesse du gabarit
-- ---------------------------------------------------------------------------

create or replace function interclub.mettre_a_jour_bareme_vitesse_gabarit(
  p_gabarit_epreuve         uuid,
  p_points_chute            int,
  p_points_non_presentation int,
  p_echelons                jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not interclub.est_admin() then
    raise exception 'non_admin' using errcode = '42501';
  end if;

  update interclub.gabarit_epreuve
     set points_chute = p_points_chute,
         points_non_presentation = p_points_non_presentation
   where id = p_gabarit_epreuve and type = 'vitesse';
  if not found then
    raise exception 'epreuve_introuvable' using errcode = 'P0002';
  end if;

  delete from interclub.gabarit_bareme_vitesse_echelon where gabarit_epreuve_id = p_gabarit_epreuve;
  insert into interclub.gabarit_bareme_vitesse_echelon
    (gabarit_epreuve_id, rang_min, rang_max, points, decrement, ordre)
  select p_gabarit_epreuve,
         (e.valeur->>'rang_min')::int,
         (e.valeur->>'rang_max')::int,
         (e.valeur->>'points')::int,
         (e.valeur->>'decrement')::int,
         e.position::int
    from jsonb_array_elements(p_echelons) with ordinality as e(valeur, position);
end;
$$;

-- ---------------------------------------------------------------------------
-- A3 — Régénération d'un jeton QR (R23) : révocation puis jeton de même
-- périmètre. Révoquer d'abord libère l'index « un actif par périmètre ».
-- ---------------------------------------------------------------------------

create or replace function interclub.regenerer_jeton(p_jeton uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ancien  interclub.jeton_qr;
  v_nouveau uuid;
begin
  -- RLS : seul un jeton que l'appelant peut révoquer est touché.
  update interclub.jeton_qr
     set actif = false
   where id = p_jeton
  returning * into v_ancien;
  if not found then
    raise exception 'jeton_introuvable' using errcode = 'P0002';
  end if;

  insert into interclub.jeton_qr (rencontre_id, nature, club_id, voie_vitesse_id, equipe_id)
  values (v_ancien.rencontre_id, v_ancien.nature, v_ancien.club_id,
          v_ancien.voie_vitesse_id, v_ancien.equipe_id)
  returning id into v_nouveau;
  return v_nouveau;
end;
$$;

-- ---------------------------------------------------------------------------
-- A4 — Régénération de l'invitation coach d'un club (R29)
-- ---------------------------------------------------------------------------

create or replace function interclub.regenerer_invitation_coach(p_invitation uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_club    uuid;
  v_nouveau uuid;
begin
  if not interclub.est_admin() then
    raise exception 'non_admin' using errcode = '42501';
  end if;

  update interclub.invitation_coach
     set actif = false
   where id = p_invitation
  returning club_id into v_club;
  if not found then
    raise exception 'invitation_introuvable' using errcode = 'P0002';
  end if;

  insert into interclub.invitation_coach (club_id)
  values (v_club)
  returning id into v_nouveau;
  return v_nouveau;
end;
$$;

-- ---------------------------------------------------------------------------
-- A5 — Génération de l'invitation administrateur (R37 : une seule valable)
-- ---------------------------------------------------------------------------

create or replace function interclub.generer_invitation_admin()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nouveau uuid;
begin
  if not interclub.est_admin() then
    raise exception 'non_admin' using errcode = '42501';
  end if;

  update interclub.invitation_admin set actif = false where actif;
  insert into interclub.invitation_admin default values
  returning id into v_nouveau;
  return v_nouveau;
end;
$$;

revoke execute on function interclub.mettre_a_jour_bareme_vitesse(uuid, int, int, jsonb) from public, anon;
revoke execute on function interclub.mettre_a_jour_bareme_vitesse_gabarit(uuid, int, int, jsonb) from public, anon;
revoke execute on function interclub.regenerer_jeton(uuid) from public, anon;
revoke execute on function interclub.regenerer_invitation_coach(uuid) from public, anon;
revoke execute on function interclub.generer_invitation_admin() from public, anon;
grant execute on function interclub.mettre_a_jour_bareme_vitesse(uuid, int, int, jsonb) to authenticated;
grant execute on function interclub.mettre_a_jour_bareme_vitesse_gabarit(uuid, int, int, jsonb) to authenticated;
grant execute on function interclub.regenerer_jeton(uuid) to authenticated;
grant execute on function interclub.regenerer_invitation_coach(uuid) to authenticated;
grant execute on function interclub.generer_invitation_admin() to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101600_rpc_ecritures_atomiques',
  'RPC d''écritures atomiques (lot 7, constats A1–A5/P15) : mettre_a_jour_bareme_vitesse (rencontre, R55e) et _gabarit, regenerer_jeton, regenerer_invitation_coach, generer_invitation_admin — SECURITY INVOKER (RLS conservée), garde admin, une transaction ; EXECUTE à authenticated seul. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
