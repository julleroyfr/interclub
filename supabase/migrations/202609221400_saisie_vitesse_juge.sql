-- ===========================================================================
-- 202609221400_saisie_vitesse_juge
--
-- Objet : rendre la SAISIE DE LA VITESSE par le juge opérationnelle (spec #10,
--         validée le 2026-09-22). Trois évolutions :
--
--   1. `temps_vitesse` porte désormais les TROIS FORMES du résultat de vitesse
--      (spec #1 R31, spec #10 R7) : un temps chronométré (en SECONDES, R8), une
--      CHUTE, ou une NON-PRÉSENTATION. Aujourd'hui la table ne stocke qu'un
--      `temps not null` : on ajoute `issue`, on rend `temps` nullable et on
--      garantit la cohérence forme ↔ durée (R9). Traçabilité de l'auteur
--      (juge|admin) alignée sur spec #9 (audit seul).
--
--   2. `temps_vitesse_select` — LECTURE élargie aux authentifiés DÈS LA ③ (même
--      régime que les résultats voie/bloc, spec #6 R6 / spec #1 R8, spec #10
--      R15) : la policy actuelle ne l'ouvrait qu'au coach du club du grimpeur
--      (`voit_resultat`). L'écriture (juge affecté, ③) reste inchangée.
--
--   3. `contexte_juge()` — NOUVELLE RPC de lecture (SECURITY DEFINER, analogue à
--      `contexte_coach_temporaire`, migration 202609011500) : renvoie le
--      périmètre (rencontre + épreuve de vitesse + couloir) de la session JUGE
--      active de l'utilisateur courant, pour la garde applicative de l'espace
--      `/juge` (spec #10 R1/R2). Nécessaire car l'anonyme ne peut PAS lire
--      `jeton_qr` directement.
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord
--               (`supabase db reset`), puis recette, puis prod à la bascule.
-- Idempotent : `add column if not exists`, `drop constraint if exists`,
--               `create or replace`, `drop policy if exists`.
-- Réf. : docs/specs/10-saisie-vitesse-juge.md (Modèle de données),
--         docs/conventions/03-base-de-donnees-supabase.md §5.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. temps_vitesse — trois formes de résultat (R7/R8/R9) + auteur (spec #9).
-- ---------------------------------------------------------------------------

-- 1a. Forme du résultat (issue) — d'abord nullable pour rétro-remplir l'existant.
alter table interclub.temps_vitesse
  add column if not exists issue text;

-- 1b. Rétro-remplissage : toute ligne existante porte un temps ⇒ forme « temps ».
update interclub.temps_vitesse
   set issue = 'temps'
 where issue is null;

-- 1c. `temps` devient nullable (null pour chute / non-présentation, R9). L'ancien
--     CHECK inline `temps > 0` reste valide : sur NULL il s'évalue à NULL (passe),
--     ce qui équivaut à `temps is null or temps > 0` (R8).
alter table interclub.temps_vitesse
  alter column temps drop not null;

-- 1d. Contraintes de forme et de cohérence (R7/R9).
alter table interclub.temps_vitesse
  drop constraint if exists temps_vitesse_issue_check;
alter table interclub.temps_vitesse
  add constraint temps_vitesse_issue_check
  check (issue in ('temps', 'chute', 'non_presentation'));

alter table interclub.temps_vitesse
  drop constraint if exists temps_vitesse_forme_coherente_check;
alter table interclub.temps_vitesse
  add constraint temps_vitesse_forme_coherente_check
  check ((issue = 'temps') = (temps is not null));

-- 1e. `issue` obligatoire une fois l'existant rétro-rempli (1b).
alter table interclub.temps_vitesse
  alter column issue set not null;

-- 1f. Traçabilité de l'auteur (spec #9 R14) — audit seul, hors score/classement.
--     Référence `auth.users` (couvre le juge, session ANONYME sans `compte`).
alter table interclub.temps_vitesse
  add column if not exists auteur_utilisateur_id uuid
    references auth.users (id) on delete set null,
  add column if not exists auteur_role text;

alter table interclub.temps_vitesse
  drop constraint if exists temps_vitesse_auteur_role_check;
alter table interclub.temps_vitesse
  add constraint temps_vitesse_auteur_role_check
  check (auteur_role is null or auteur_role in ('juge', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Lecture au fil de l'eau (R15) — authentifiés dès la ③, tous clubs, comme
--    les résultats voie/bloc (`resultats_visibles`). L'écriture reste bornée au
--    juge affecté en ③ (`peut_ecrire_temps_vitesse`, inchangée).
-- ---------------------------------------------------------------------------
drop policy if exists "temps_vitesse_select" on interclub.temps_vitesse;
create policy "temps_vitesse_select" on interclub.temps_vitesse for select
  to authenticated
  using (
    interclub.est_admin()
    or interclub.peut_ecrire_temps_vitesse(epreuve_id)
    or interclub.voit_resultat(epreuve_id, grimpeur_id)
    or exists (
      select 1 from interclub.epreuve ep
      where ep.id = epreuve_id
        and interclub.resultats_visibles(ep.rencontre_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. contexte_juge — périmètre de la session JUGE active de l'utilisateur
--    courant (spec #10 R1/R2). SECURITY DEFINER : contourne la RLS `jeton_qr`
--    (inaccessible à l'anonyme). Ne renvoie une ligne que si la session est
--    « du jour » (③ compétition) et le jeton actif — sinon NULL (fail-closed).
--    Renvoie l'ÉPREUVE DE VITESSE de la rencontre (périmètre d'écriture, R30)
--    et le couloir du jeton (info d'organisation). À scans multiples, on
--    retient la session la plus récente.
-- ---------------------------------------------------------------------------
create or replace function interclub.contexte_juge()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rencontre_id',       j.rencontre_id,
    'epreuve_vitesse_id', ev.id,
    'voie_vitesse_id',    j.voie_vitesse_id,
    'couloir_numero',     vv.numero,
    'date_rencontre',     r.date_rencontre,
    'club_porteur_nom',   cp.nom,
    'phase',              r.phase
  )
  from interclub.session_qr s
  join interclub.jeton_qr   j  on j.id = s.jeton_qr_id
  join interclub.rencontre  r  on r.id = j.rencontre_id
  join interclub.club       cp on cp.id = r.club_porteur_id
  left join interclub.epreuve ev
         on ev.rencontre_id = r.id and ev.type = 'vitesse'
  left join interclub.voie_vitesse vv on vv.id = j.voie_vitesse_id
  where s.utilisateur_id = auth.uid()
    and j.actif
    and j.nature = 'juge'
    and r.phase = 'competition'
  order by s.created_at desc
  limit 1;
$$;

grant execute on function interclub.contexte_juge() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. liste_grimpeurs_vitesse — roster des compétiteurs engagés + leur résultat
--    de vitesse, pour l'écran juge (spec #10 R2/R12/R13). SECURITY DEFINER : le
--    juge est ANONYME et n'a AUCUN accès direct à grimpeur/equipe/composition
--    (RLS réservée admin/coach) ; cette fonction contourne cette RLS mais
--    RESTREINT au juge de la rencontre (ou admin) — sinon renvoie 0 ligne
--    (fail-closed). Renvoie une ligne par grimpeur engagé (unicité
--    `composition(rencontre, grimpeur)`), avec le club de l'équipe où il concourt
--    et son résultat courant (issue/temps, null si « à saisir »).
-- ---------------------------------------------------------------------------
create or replace function interclub.liste_grimpeurs_vitesse(p_epreuve uuid)
returns table (
  grimpeur_id uuid,
  nom         text,
  prenom      text,
  sexe        text,
  club_nom    text,
  issue       text,
  temps       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.nom, g.prenom, g.sexe, cl.nom,
    tv.issue, tv.temps
  from interclub.epreuve ep
  join interclub.equipe      e  on e.rencontre_id = ep.rencontre_id
  join interclub.composition c  on c.equipe_id = e.id
  join interclub.grimpeur    g  on g.id = c.grimpeur_id
  join interclub.club        cl on cl.id = e.club_id
  left join interclub.temps_vitesse tv
         on tv.epreuve_id = ep.id and tv.grimpeur_id = g.id
  where ep.id = p_epreuve
    and ep.type = 'vitesse'
    and (interclub.est_admin() or interclub.est_juge_de_rencontre(ep.rencontre_id));
$$;

grant execute on function interclub.liste_grimpeurs_vitesse(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Suivi de version (idempotent).
-- ---------------------------------------------------------------------------
insert into interclub.version (version, description, applique_par)
values (
  '202609221400_saisie_vitesse_juge',
  'Saisie de la vitesse (spec #10) : temps_vitesse porte les 3 formes du résultat (colonne issue temps|chute|non_presentation, temps nullable + checks de cohérence forme↔durée, R7/R8/R9) + auteur (juge|admin, spec #9) ; temps_vitesse_select élargi aux authentifiés dès la ③ (resultats_visibles, R15) ; RPC contexte_juge() SECURITY DEFINER (rencontre + épreuve vitesse + couloir de la session juge active) pour la garde applicative de /juge (R1/R2) ; RPC liste_grimpeurs_vitesse(epreuve) SECURITY DEFINER (roster engagés + résultat, restreint juge de la rencontre/admin) — le juge anonyme n''a pas d''accès RLS direct à grimpeur/equipe/composition (R2/R12).',
  'julleroyfr'
)
on conflict (version) do nothing;
