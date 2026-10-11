-- ===========================================================================
-- 202610031400_lecture_acteur_identifie
--
-- Objet : décision D-D de la revue du 2026-10-03 (constat m2), spec #1
--         révisée et validée le 2026-10-03 (Vocabulaire « acteur identifié »,
--         R8, RLS attendue). Les lectures ouvertes « à tout authenticated »
--         sont réservées aux ACTEURS IDENTIFIÉS :
--           - compte permanent MAPPÉ (ligne `compte` : admin ou coach) ;
--           - session QR éphémère (`session_qr`) ouverte sur un jeton ACTIF
--             (coach temporaire ou juge).
--         Une session anonyme ouverte sans scanner de QR, un compte sans rôle
--         ou une session dont le jeton est révoqué ne lisent plus rien.
--
-- Constat : Supabase classe toute session anonyme (`signInAnonymously`) en
--         `authenticated` ; avec la clé anon publique, n'importe qui pouvait
--         ouvrir une telle session et lire clubs, rencontres, épreuves, voies,
--         gabarit et, dès la ③, résultats, temps et points de vitesse.
--
-- Mise en œuvre :
--   1. helper `est_acteur_identifie()` (SECURITY DEFINER : lit `compte`,
--      `session_qr` et `jeton_qr` sans dépendre de leur RLS) ;
--   2. `resultats_visibles(rencontre)` exige en plus un acteur identifié — il
--      fonde déjà les policies des résultats voie/bloc (via
--      `resultat_*_lisible`), de la structure (voies, blocs, paliers), du
--      barème, des temps et des points de vitesse ;
--   3. les policies de lecture `using (true)` (club, rencontre, épreuve, voie de
--      vitesse, gabarit) passent à `using (est_acteur_identifie())`.
--   Inchangées : `compte` (sa propre ligne) et `session_qr` (ses sessions),
--   nécessaires pour s'identifier ; les policies déjà bornées à un périmètre
--   (équipes, grimpeurs, compositions, prêts, jetons, invitations).
--
-- Application : MANUELLE dans le SQL Editor Supabase — local d'abord, puis
--         recette, puis prod à la bascule sur `main`.
-- Idempotent : `create or replace`, `drop policy if exists` + `create policy`.
-- ===========================================================================

-- 1. Helper : la session courante désigne-t-elle un acteur de la compétition ?
create or replace function interclub.est_acteur_identifie()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from interclub.compte c
            where c.utilisateur_id = auth.uid()
         )
      or exists (
           select 1
             from interclub.session_qr s
             join interclub.jeton_qr j on j.id = s.jeton_qr_id
            where s.utilisateur_id = auth.uid()
              and j.actif
         );
$$;

comment on function interclub.est_acteur_identifie() is
  'Vrai si la session courante est un acteur identifié (spec #1, rév. 2026-10-03) : compte mappé (admin/coach) ou session QR sur un jeton actif. Base des lectures ouvertes aux authentifiés.';

revoke execute on function interclub.est_acteur_identifie() from public;
grant execute on function interclub.est_acteur_identifie() to authenticated;

-- 2. Résultats visibles dès la ③ … pour un acteur identifié (spec #1 R8).
create or replace function interclub.resultats_visibles(p_rencontre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select interclub.est_acteur_identifie()
     and interclub.phase_de_rencontre(p_rencontre)
         in ('competition', 'cloture', 'resultats_publics');
$$;

-- 3. Catalogues : lecture réservée aux acteurs identifiés.
drop policy if exists club_select on interclub.club;
create policy club_select on interclub.club
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists rencontre_select on interclub.rencontre;
create policy rencontre_select on interclub.rencontre
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists epreuve_select on interclub.epreuve;
create policy epreuve_select on interclub.epreuve
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists voie_vitesse_select on interclub.voie_vitesse;
create policy voie_vitesse_select on interclub.voie_vitesse
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_epreuve_select_authenticated on interclub.gabarit_epreuve;
create policy gabarit_epreuve_select_authenticated on interclub.gabarit_epreuve
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_voie_diff_select_authenticated on interclub.gabarit_voie_difficulte;
create policy gabarit_voie_diff_select_authenticated on interclub.gabarit_voie_difficulte
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_bloc_select_authenticated on interclub.gabarit_bloc;
create policy gabarit_bloc_select_authenticated on interclub.gabarit_bloc
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_bloc_palier_select_authenticated on interclub.gabarit_bloc_palier;
create policy gabarit_bloc_palier_select_authenticated on interclub.gabarit_bloc_palier
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_voie_vitesse_select_authenticated on interclub.gabarit_voie_vitesse;
create policy gabarit_voie_vitesse_select_authenticated on interclub.gabarit_voie_vitesse
  for select to authenticated using (interclub.est_acteur_identifie());

drop policy if exists gabarit_bareme_vitesse_echelon_select_authenticated on interclub.gabarit_bareme_vitesse_echelon;
create policy gabarit_bareme_vitesse_echelon_select_authenticated on interclub.gabarit_bareme_vitesse_echelon
  for select to authenticated using (interclub.est_acteur_identifie());

-- Suivi de version
insert into interclub.version (version, description, applique_par)
values (
  '202610031400_lecture_acteur_identifie',
  'D-D revue 2026-10-03 (spec #1 rév. 2026-10-03) : helper est_acteur_identifie() (compte mappé ou session QR sur jeton actif) ; resultats_visibles() l''exige ; policies de lecture using(true) (club, rencontre, epreuve, voie_vitesse, gabarit_*) réservées aux acteurs identifiés.',
  'julleroyfr'
)
on conflict (version) do nothing;
