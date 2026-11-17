-- ===========================================================================
-- 202611101300_rpc_changer_phase_rencontre
--
-- Objet : changement de phase d'une rencontre en UN appel et UNE transaction
--         (lot 5 du plan « appels Supabase » : constats P7, J3, B2 de
--         l'analyse du 2026-11-10). Auparavant, `changerPhaseRencontre` lisait
--         la phase, la changeait sans condition, puis `cloture.ts` relisait la
--         structure, les compositions et les résultats (jusqu'à 9 vagues) :
--           - lectures non paginées : au-delà de 1000 résultats de voie, des
--             niveaux saisis passaient pour « non saisis » et recevaient un NP ;
--           - `resultat_bloc` lu pour toutes les rencontres des grimpeurs ;
--           - deux admins pouvaient passer la même transition ;
--           - un NP en échec laissait la phase changée.
--
--         `interclub.changer_phase_rencontre(p_rencontre, p_phase)` fait, dans
--         la transaction de l'appel :
--           1. la garde admin (spec #3 R12) ;
--           2. le verrou de la rencontre, puis la transition adjacente (spec #3
--              R17, retour ③ → ① hors jour J) ;
--           3. la garde du jour J (spec #1 R5) : ② et ③ seulement le jour de la
--              rencontre (`current_date`, comme la date du serveur applicatif) ;
--           4. la mise à jour conditionnée à la phase lue ;
--           5. au passage en ④, le NP automatique (spec #6 R18) : blocs de
--              l'épreuve de bloc active (spec #20 R40) pour chaque engagé ;
--              voies du groupe de départ pour l'enfant (voie représentative du
--              niveau : plus petit `ordre`) ; rien pour les voies ado et
--              adulte. Idempotent : un niveau ou un bloc déjà saisi ne reçoit
--              rien, un résultat existant n'est jamais modifié.
--         Un échec annule tout : la phase ne change pas sans ses NP.
--
-- Erreurs (message = code, lu par l'action) : `non_admin` (42501),
--         `phase_invalide` (22023), `rencontre_introuvable` (P0002),
--         `transition_refusee` et `hors_jour_j` (P0001, détail = phase en base).
--
-- Sécurité : SECURITY DEFINER (les NP s'écrivent hors RLS, garde admin en
--         tête) ; EXECUTE à `authenticated` seul.
-- Comportement métier inchangé (specs #1 R5, #3 R17, #6 R18, #20 R40).
-- Aucune table ni policy modifiée. Additive.
-- Réversibilité : supabase/retours-arriere/202611101300_rpc_changer_phase_rencontre_retour_arriere.sql.
-- Idempotent. Application MANUELLE dans le SQL Editor (recette puis prod).
-- ===========================================================================

create or replace function interclub.changer_phase_rencontre(p_rencontre uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Cycle des phases (spec #3 R17) et échelle des niveaux enfant (spec #5 R20).
  v_phases    constant text[] := array['pre_competition', 'preparation', 'competition',
                                       'cloture', 'resultats_publics'];
  v_echelle   constant text[] := array['M1', 'M2', 'M3', 'M4', 'T1', 'T2', 'T3', 'T4',
                                       'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
  v_courante  text;
  v_date      date;
  v_categorie text;
  v_i         int;
  v_j         int;
  v_precedent text;
begin
  if not interclub.est_admin() then
    raise exception 'non_admin' using errcode = '42501';
  end if;

  v_j := array_position(v_phases, p_phase);
  if v_j is null then
    raise exception 'phase_invalide' using errcode = '22023';
  end if;

  -- Verrou : un second appel concurrent attend, puis lit la phase à jour.
  select phase, date_rencontre, categorie
    into v_courante, v_date, v_categorie
  from interclub.rencontre
  where id = p_rencontre
  for update;
  if not found then
    raise exception 'rencontre_introuvable' using errcode = 'P0002';
  end if;

  -- Transition adjacente (R17). Hors jour J, le retour depuis ③ va en ①
  -- (② est elle-même bornée au jour J, spec #1 R5).
  v_i := array_position(v_phases, v_courante);
  v_precedent := case
    when v_courante = 'competition' and v_date <> current_date then 'pre_competition'
    when v_i > 1 then v_phases[v_i - 1]
  end;
  if not (v_j = v_i + 1 or coalesce(p_phase = v_precedent, false)) then
    raise exception 'transition_refusee' using errcode = 'P0001', detail = v_courante;
  end if;

  -- Garde du jour J (spec #1 R5) : entrée en ② ou ③ le jour de la rencontre.
  if p_phase in ('preparation', 'competition') and v_date <> current_date then
    raise exception 'hors_jour_j' using errcode = 'P0001', detail = v_courante;
  end if;

  update interclub.rencontre
     set phase = p_phase
   where id = p_rencontre
     and phase = v_courante;
  if not found then
    raise exception 'transition_refusee' using errcode = 'P0001', detail = v_courante;
  end if;

  if p_phase <> 'cloture' then
    return;
  end if;

  -- NP de bloc (R18) : chaque bloc de l'épreuve active, pour chaque engagé.
  insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue)
  select b.id, c.grimpeur_id, 'np'
  from interclub.composition c
  join interclub.epreuve e on e.rencontre_id = c.rencontre_id and e.type = 'bloc' and e.active
  join interclub.bloc b on b.epreuve_id = e.id
  where c.rencontre_id = p_rencontre
    and not exists (
      select 1 from interclub.resultat_bloc r
      where r.bloc_id = b.id and r.grimpeur_id = c.grimpeur_id
    )
  on conflict (bloc_id, grimpeur_id) do nothing;

  -- NP de voie (R18), enfant seulement : les 3 niveaux du groupe de départ
  -- (un groupe absent ou hors échelle ne donne rien), sur la voie
  -- représentative, si aucun résultat n'est saisi sur une voie du niveau.
  if v_categorie <> 'enfant' then
    return;
  end if;

  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
  select rep.id, a.grimpeur_id, 'np'
  from (
    select c.grimpeur_id, v_echelle[g.i + k] as niveau
    from interclub.composition c
    cross join lateral (select array_position(v_echelle, c.groupe_depart) as i) g
    cross join generate_series(0, 2) k
    where c.rencontre_id = p_rencontre
      and g.i is not null
      and g.i + 2 <= array_length(v_echelle, 1)
  ) a
  cross join lateral (
    select vd.id
    from interclub.voie_difficulte vd
    join interclub.epreuve e on e.id = vd.epreuve_id
    where e.rencontre_id = p_rencontre and e.type = 'voie' and vd.niveau = a.niveau
    order by vd.ordre
    limit 1
  ) rep
  where not exists (
    select 1
    from interclub.resultat_voie r
    join interclub.voie_difficulte vd on vd.id = r.voie_difficulte_id
    join interclub.epreuve e on e.id = vd.epreuve_id
    where r.grimpeur_id = a.grimpeur_id
      and e.rencontre_id = p_rencontre and e.type = 'voie'
      and vd.niveau = a.niveau
  )
  on conflict (voie_difficulte_id, grimpeur_id) do nothing;
end;
$$;

revoke execute on function interclub.changer_phase_rencontre(uuid, text) from public, anon;
grant execute on function interclub.changer_phase_rencontre(uuid, text) to authenticated;

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611101300_rpc_changer_phase_rencontre',
  'RPC changer_phase_rencontre (lot 5, constats P7/J3/B2) : garde admin, transition adjacente (spec #3 R17), jour J (spec #1 R5), mise à jour conditionnée à la phase lue et NP automatique de clôture (spec #6 R18) dans une seule transaction ; EXECUTE à authenticated seul. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
