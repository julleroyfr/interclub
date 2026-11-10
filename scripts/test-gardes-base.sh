#!/usr/bin/env bash
#
# Tests des gardes en base (lot 11 du plan « appels Supabase » : constats E1–E5 ;
# migration 202611101500). Chaque garde refuse l'appel forgé (POST direct à
# PostgREST, sous l'identité d'un admin ou d'un coach) que seul TypeScript
# arrêtait jusqu'ici.
#
#   - GB-01 (E1) : coche de contrôle en ④ seulement (spec #16 R13) ; la coche
#             d'un coach reste neutralisée.
#   - GB-02 (E2) : saisie admin en ③ ou ④ seulement (spec #9 R5).
#   - GB-03 (E3) : structure en ① ou ② (spec #3 R51), repère jusqu'en ③
#             (R49d), phase lue par le vrai parent, suppression en cascade
#             d'une rencontre permise, rang (ordre, numéro) calculé.
#   - GB-04 (E4) : effectif enfant/ado ≤ 8 (spec #5 R15) ; prêt hors club et
#             hors engagés (spec #1 R14, R35).
#   - GB-05 (E5) : licence générée non posée en modification (spec #3 R21c).
#   - GB-06 : chemin serveur sans JWT (seed) non contraint.
#   - GB-07 : deux ajouts simultanés reçoivent deux rangs distincts.
#   - GB-08 : rejeu idempotent de la migration (archivée, retour arrière supprimé).
#
# GB-01 à GB-06 tournent dans une transaction annulée ; GB-07 écrit puis purge
# sa rencontre d'essai. La base locale est rendue dans son état.
#
# Pré-requis : `supabase start` (seed 01 chargé : clubs A et B, admin, coach).
# Usage      : bash scripts/test-gardes-base.sh   (ou : npm run test:gardes-base)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"
PASS=0
FAIL=0
ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
verifie() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 — obtenu « $2 », attendu « $3 »"; fi; }

ADMIN=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
COACH=cccccccc-cccc-cccc-cccc-cccccccccccc
CLUB_A=11111111-1111-1111-1111-111111111111
CLUB_B=22222222-2222-2222-2222-222222222222

# Identifiants du jeu d'essai : rencontres ①, ③, ④, ⑤ (suffixe 1, 3, 4, 5).
R=b0b0b0b0-0000-0000-0000-00000000000   # rencontre  R1 … R5
V=b0b0b0b0-0000-0000-0001-00000000000   # épreuve de voie, puis voie (V…1x)
B=b0b0b0b0-0000-0000-0002-00000000000   # épreuve de bloc, puis bloc (B…1x)
G=b0b0b0b0-0000-0000-0004-0000000000    # grimpeurs g01 … g12

SQL=$(cat <<EOSQL
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as \$fn\$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
\$fn\$;

-- Exécute p_sql sous l'identité p_uid (rôle authenticated), comme un appel
-- PostgREST forgé : « ok:<lignes> », « 42501 » (refus RLS) ou le message
-- d'erreur. L'échec annule les écritures de l'appel (sous-transaction).
create or replace function pg_temp.essai(p_uid uuid, p_sql text)
returns text language plpgsql as \$fn\$
declare
  v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  get diagnostics v_n = row_count;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return 'ok:' || v_n;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return case when sqlstate = '42501' then '42501' else sqlerrm end;
end;
\$fn\$;

-- ---- Jeu d'essai (posé sans JWT, en ①, puis phases fixées) ---------------
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
select ('${R}' || n)::uuid, current_date, '$CLUB_A', 'enfant', 'pre_competition'
  from generate_series(1, 5) n where n <> 2;
insert into interclub.epreuve (id, rencontre_id, type)
select ('${V}' || n)::uuid, ('${R}' || n)::uuid, 'voie' from generate_series(1, 5) n where n <> 2
union all
select ('${B}' || n)::uuid, ('${R}' || n)::uuid, 'bloc' from generate_series(1, 5) n where n <> 2;
insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, ordre, points)
select ('b0b0b0b0-0000-0000-0001-0000000000' || n || '1')::uuid, ('${V}' || n)::uuid,
       'M1', 'moulinette', '4c', 1, 1
  from generate_series(1, 5) n where n <> 2;
insert into interclub.bloc (id, epreuve_id, code, ordre)
select ('b0b0b0b0-0000-0000-0002-0000000000' || n || '1')::uuid, ('${B}' || n)::uuid, 'B1', 1
  from generate_series(1, 5) n where n <> 2;
insert into interclub.bloc_palier (bloc_id, libelle, points, ordre)
select ('b0b0b0b0-0000-0000-0002-0000000000' || n || '1')::uuid, 'Top', 10, 1
  from generate_series(1, 5) n where n <> 2;
insert into interclub.voie_vitesse (rencontre_id, numero, libelle)
select ('${R}' || n)::uuid, 1, 'Voie 1' from generate_series(1, 5) n where n <> 2;

insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select ('${G}' || lpad(n::text, 2, '0'))::uuid,
       case when n = 11 then '$CLUB_B'::uuid else '$CLUB_A'::uuid end,
       'Garde', 'g' || n, 2016, 'F',
       case when n = 12 then 2000000900 else 971000 + n end
  from generate_series(1, 12) n;

-- R1 : équipe E1a pleine (g01–g08), équipe E1b (g09).
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('b0b0b0b0-0000-0000-0003-0000000001a0', '${R}1', '$CLUB_A', 'Garde E1a'),
  ('b0b0b0b0-0000-0000-0003-0000000001b0', '${R}1', '$CLUB_A', 'Garde E1b'),
  ('b0b0b0b0-0000-0000-0003-000000000030', '${R}3', '$CLUB_A', 'Garde E3'),
  ('b0b0b0b0-0000-0000-0003-000000000040', '${R}4', '$CLUB_A', 'Garde E4'),
  ('b0b0b0b0-0000-0000-0003-000000000050', '${R}5', '$CLUB_A', 'Garde E5');
insert into interclub.composition (equipe_id, grimpeur_id)
select 'b0b0b0b0-0000-0000-0003-0000000001a0'::uuid, ('${G}' || lpad(n::text, 2, '0'))::uuid
  from generate_series(1, 8) n
union all
select 'b0b0b0b0-0000-0000-0003-0000000001b0'::uuid, '${G}09'::uuid
union all
select ('b0b0b0b0-0000-0000-0003-0000000000' || n || '0')::uuid, '${G}01'
  from generate_series(3, 5) n;

-- Un résultat de voie et de bloc de g01 dans R3, R4, R5.
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
select ('b0b0b0b0-0000-0000-0001-0000000000' || n || '1')::uuid, '${G}01', 'top'
  from generate_series(3, 5) n;
insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue)
select ('b0b0b0b0-0000-0000-0002-0000000000' || n || '1')::uuid, '${G}01', 'echec'
  from generate_series(3, 5) n;

update interclub.rencontre set phase = 'competition'       where id = '${R}3';
update interclub.rencontre set phase = 'cloture'           where id = '${R}4';
update interclub.rencontre set phase = 'resultats_publics' where id = '${R}5';

-- ---- GB-01 (E1) : coche de contrôle en ④ ----------------------------------
select pg_temp.verif('GB-01a admin coche une voie en ③ : refusé', 'controle_hors_cloture',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_voie set controle_le = now(), controle_par = '$ADMIN'
    where voie_difficulte_id = 'b0b0b0b0-0000-0000-0001-000000000031'\$q\$));
select pg_temp.verif('GB-01b admin coche un bloc en ③ : refusé', 'controle_hors_cloture',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_bloc set controle_le = now(), controle_par = '$ADMIN'
    where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000031'\$q\$));
select pg_temp.verif('GB-01c admin coche en ④ : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_voie set controle_le = now(), controle_par = '$ADMIN'
    where voie_difficulte_id = 'b0b0b0b0-0000-0000-0001-000000000041'\$q\$));
select pg_temp.verif('GB-01d admin décoche en ④ : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_voie set controle_le = null, controle_par = null
    where voie_difficulte_id = 'b0b0b0b0-0000-0000-0001-000000000041'\$q\$));
select pg_temp.verif('GB-01e admin insère un résultat déjà coché en ③ : refusé', 'controle_hors_cloture',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, controle_le, controle_par)
    values ('b0b0b0b0-0000-0000-0002-000000000031', '${G}02', 'echec', now(), '$ADMIN')\$q\$));
select pg_temp.verif('GB-01f admin corrige l''issue en ③ (coche inchangée) : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_voie set issue = 'np'
    where voie_difficulte_id = 'b0b0b0b0-0000-0000-0001-000000000031'\$q\$));
select pg_temp.verif('GB-01g coach coche en ③ : écriture passée', 'ok:1',
  pg_temp.essai('$COACH', \$q\$update interclub.resultat_bloc set controle_le = now()
    where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000031' and grimpeur_id = '${G}01'\$q\$));
select pg_temp.verif('GB-01g coche du coach neutralisée', '∅',
  (select coalesce(controle_le::text, '∅') from interclub.resultat_bloc
    where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000031' and grimpeur_id = '${G}01'));

-- ---- GB-02 (E2) : saisie admin en ③ ou ④ ----------------------------------
select pg_temp.verif('GB-02a admin saisit en ① : refusé', '42501',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
    values ('b0b0b0b0-0000-0000-0001-000000000011', '${G}01', 'top')\$q\$));
select pg_temp.verif('GB-02b admin saisit en ③ : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
    values ('b0b0b0b0-0000-0000-0001-000000000031', '${G}02', 'top')\$q\$));
select pg_temp.verif('GB-02c admin corrige en ④ : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_bloc set issue = 'np'
    where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000041'\$q\$));
select pg_temp.verif('GB-02d admin saisit en ⑤ : refusé', '42501',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue)
    values ('b0b0b0b0-0000-0000-0002-000000000051', '${G}02', 'echec')\$q\$));
select pg_temp.verif('GB-02e admin corrige en ⑤ : aucune ligne', 'ok:0',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_voie set issue = 'np'
    where voie_difficulte_id = 'b0b0b0b0-0000-0000-0001-000000000051'\$q\$));
select pg_temp.verif('GB-02f admin retire en ⑤ : aucune ligne', 'ok:0',
  pg_temp.essai('$ADMIN', \$q\$delete from interclub.resultat_voie
    where voie_difficulte_id = 'b0b0b0b0-0000-0000-0001-000000000051'\$q\$));
select pg_temp.verif('GB-02g admin décoche en ⑤ : aucune ligne', 'ok:0',
  pg_temp.essai('$ADMIN', \$q\$update interclub.resultat_bloc set controle_le = null, controle_par = null
    where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000051'\$q\$));

-- ---- GB-03 (E3) : structure en ① ou ② ------------------------------------
select pg_temp.verif('GB-03a ajout de bloc en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.bloc (epreuve_id, code) values ('${B}3', 'B2')\$q\$));
select pg_temp.verif('GB-03b ajout de bloc en ① sans ordre : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.bloc (epreuve_id, code) values ('${B}1', 'B2')\$q\$));
select pg_temp.verif('GB-03b ordre calculé (max + 1)', '2',
  (select ordre::text from interclub.bloc where epreuve_id = '${B}1' and code = 'B2'));
select pg_temp.verif('GB-03c ajout de voie en ① sans ordre : ordre calculé', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.voie_difficulte (epreuve_id, niveau, type_voie, cotation, points)
    values ('${V}1', 'M2', 'moulinette', '5a', 2)\$q\$));
select pg_temp.verif('GB-03c rang', '2',
  (select ordre::text from interclub.voie_difficulte where epreuve_id = '${V}1' and niveau = 'M2'));
select pg_temp.verif('GB-03d ajout de palier en ① sans ordre : ordre calculé', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.bloc_palier (bloc_id, libelle, points)
    values ('b0b0b0b0-0000-0000-0002-000000000011', 'Zone', 5)\$q\$));
select pg_temp.verif('GB-03d rang', '2',
  (select ordre::text from interclub.bloc_palier
              where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000011' and libelle = 'Zone'));
select pg_temp.verif('GB-03e voie de vitesse en ① sans numéro : numéro calculé', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.voie_vitesse (rencontre_id, libelle) values ('${R}1', 'Voie 2')\$q\$));
select pg_temp.verif('GB-03e rang', '2',
  (select numero::text from interclub.voie_vitesse where rencontre_id = '${R}1' and libelle = 'Voie 2'));
select pg_temp.verif('GB-03f ordre fourni : conservé', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.bloc (epreuve_id, code, ordre) values ('${B}1', 'B9', 9)\$q\$));
select pg_temp.verif('GB-03f rang', '9',
  (select ordre::text from interclub.bloc where epreuve_id = '${B}1' and code = 'B9'));
select pg_temp.verif('GB-03g repère en ③ : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.voie_difficulte set repere = 'Jaune'
    where id = 'b0b0b0b0-0000-0000-0001-000000000031'\$q\$));
select pg_temp.verif('GB-03h repère en ④ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.voie_difficulte set repere = 'Jaune'
    where id = 'b0b0b0b0-0000-0000-0001-000000000041'\$q\$));
select pg_temp.verif('GB-03i cotation en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.voie_difficulte set cotation = '6a'
    where id = 'b0b0b0b0-0000-0000-0001-000000000031'\$q\$));
select pg_temp.verif('GB-03j modification d''épreuve en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.epreuve set updated_at = now() where id = '${B}3'\$q\$));
select pg_temp.verif('GB-03k suppression d''épreuve en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$delete from interclub.epreuve where id = '${B}3'\$q\$));
select pg_temp.verif('GB-03l suppression de voie en ④ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$delete from interclub.voie_difficulte where id = 'b0b0b0b0-0000-0000-0001-000000000041'\$q\$));
select pg_temp.verif('GB-03m palier en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.bloc_palier set points = 99
    where bloc_id = 'b0b0b0b0-0000-0000-0002-000000000031'\$q\$));
select pg_temp.verif('GB-03n voie de vitesse en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.voie_vitesse set libelle = 'X' where rencontre_id = '${R}3'\$q\$));
select pg_temp.verif('GB-03o barème de vitesse en ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.bareme_vitesse_echelon
      (epreuve_id, rang_min, rang_max, points, decrement, ordre)
    values ('${V}3', 1, null, 10, 1, 1)\$q\$));
select pg_temp.verif('GB-03p voie de ① déplacée vers une épreuve de ③ : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.voie_difficulte set epreuve_id = '${V}3'
    where id = 'b0b0b0b0-0000-0000-0001-000000000011'\$q\$));
select pg_temp.verif('GB-03q ajout dans une épreuve de ③ avec une rencontre de ① en paramètre : refusé', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.voie_difficulte (epreuve_id, niveau, type_voie, cotation, points)
    values ('${V}3', 'M2', 'moulinette', '5a', 2)\$q\$));
select pg_temp.verif('GB-03r suppression d''une rencontre en ⑤ (cascade) : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$delete from interclub.rencontre where id = '${R}5'\$q\$));
create temp table _gab as
  select g.id, coalesce(max(b.ordre), 0) as avant
    from interclub.gabarit_epreuve g left join interclub.gabarit_bloc b on b.gabarit_epreuve_id = g.id
   where g.categorie = 'enfant' and g.type = 'bloc' group by g.id;
select pg_temp.verif('GB-03s gabarit : ajout sans ordre', 'ok:1',
  (select pg_temp.essai('$ADMIN', format(
     'insert into interclub.gabarit_bloc (gabarit_epreuve_id, code) values (%L, %L)', id, 'GARDE')) from _gab));
select pg_temp.verif('GB-03s gabarit : ordre calculé (max + 1)', '1',
  (select (b.ordre - g.avant)::text from _gab g
     join interclub.gabarit_bloc b on b.gabarit_epreuve_id = g.id where b.code = 'GARDE'));

-- ---- GB-04 (E4) : effectif et prêts ---------------------------------------
select pg_temp.verif('GB-04a admin : 9ᵉ grimpeur d''une équipe enfant refusé', 'effectif_equipe',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.composition (equipe_id, grimpeur_id)
    values ('b0b0b0b0-0000-0000-0003-0000000001a0', '${G}10')\$q\$));
select pg_temp.verif('GB-04b coach : 9ᵉ grimpeur refusé', 'effectif_equipe',
  pg_temp.essai('$COACH', \$q\$insert into interclub.composition (equipe_id, grimpeur_id)
    values ('b0b0b0b0-0000-0000-0003-0000000001a0', '${G}10')\$q\$));
select pg_temp.verif('GB-04c changement vers une équipe pleine : refusé', 'effectif_equipe',
  pg_temp.essai('$ADMIN', \$q\$update interclub.composition set equipe_id = 'b0b0b0b0-0000-0000-0003-0000000001a0'
    where grimpeur_id = '${G}09' and rencontre_id = '${R}1'\$q\$));
select pg_temp.verif('GB-04d ajout sous le plafond : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.composition (equipe_id, grimpeur_id)
    values ('b0b0b0b0-0000-0000-0003-0000000001b0', '${G}10')\$q\$));
select pg_temp.verif('GB-04e prêt au club du grimpeur : refusé', 'pret_meme_club',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id)
    values ('${R}1', '${G}11', '$CLUB_B')\$q\$));
select pg_temp.verif('GB-04f prêt d''un grimpeur déjà engagé : refusé', 'pret_deja_engage',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id)
    values ('${R}1', '${G}01', '$CLUB_B')\$q\$));
select pg_temp.verif('GB-04g prêt valide : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id)
    values ('${R}1', '${G}11', '$CLUB_A')\$q\$));
select pg_temp.verif('GB-04h prêt déplacé vers son propre club : refusé', 'pret_meme_club',
  pg_temp.essai('$ADMIN', \$q\$update interclub.pret set club_accueil_id = '$CLUB_B'
    where rencontre_id = '${R}1' and grimpeur_id = '${G}11'\$q\$));

-- ---- GB-05 (E5) : licence générée -----------------------------------------
select pg_temp.verif('GB-05a licence de la plage réservée posée : refusé', 'licence_generee_reservee',
  pg_temp.essai('$ADMIN', \$q\$update interclub.grimpeur set licence = 2000000901 where id = '${G}01'\$q\$));
select pg_temp.verif('GB-05b licence générée conservée : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.grimpeur set nom = 'Garde bis', licence = 2000000900
    where id = '${G}12'\$q\$));
select pg_temp.verif('GB-05c licence générée remplacée par un vrai numéro : permis', 'ok:1',
  pg_temp.essai('$ADMIN', \$q\$update interclub.grimpeur set licence = 971099 where id = '${G}12'\$q\$));

-- ---- GB-06 : chemin serveur sans JWT non contraint ------------------------
do \$d\$ begin
  insert into interclub.bloc (epreuve_id, code) values ('${B}3', 'SEED');
exception when others then null;
end \$d\$;
select pg_temp.verif('GB-06 sans JWT : bloc ajouté en ③, ordre calculé', '2',
  (select ordre::text from interclub.bloc where epreuve_id = '${B}3' and code = 'SEED'));

select (case when ok then 'OK' else 'KO' end) || '|' || id || '|' || attendu || '|' || obtenu
  from pg_temp._res order by id;
rollback;
EOSQL
)

echo "== Gardes en base (E1–E5) =="
SORTIE=$(printf '%s\n' "$SQL" | docker exec -i "$CONTENEUR" psql -U postgres -tA -q 2>&1)
if ! printf '%s\n' "$SORTIE" | grep -qE '^(OK|KO)\|'; then
  echo "$SORTIE" >&2
  echo "Exécution SQL en échec." >&2
  exit 2
fi
while IFS='|' read -r etat id attendu obtenu; do
  case "$etat" in
    OK) ok "$id" ;;
    KO) ko "$id — obtenu « $obtenu », attendu « $attendu »" ;;
  esac
done <<< "$(printf '%s\n' "$SORTIE" | grep -E '^(OK|KO)\|')"

echo "== GB-07 Deux ajouts simultanés =="
sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }
RENC=b0b0b0b0-0000-0000-0000-0000000000c0
EPR=b0b0b0b0-0000-0000-0002-0000000000c0
purger() { sql "delete from interclub.rencontre where id = '$RENC';" >/dev/null; }
purger
sql "insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
     values ('$RENC', current_date, '$CLUB_A', 'enfant', 'pre_competition');
     insert into interclub.epreuve (id, rencontre_id, type) values ('$EPR', '$RENC', 'bloc');" >/dev/null
# Chaque session ajoute un bloc sans ordre puis garde sa transaction ouverte
# 2 s : la seconde, lancée pendant ce délai, doit attendre puis prendre le rang
# suivant.
ajouter() {
  printf '%s\n' "begin;
select set_config('request.jwt.claims', '{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}', true);
set local role authenticated;
insert into interclub.bloc (epreuve_id, code) values ('$EPR', '$1');
select pg_sleep(2);
commit;" | docker exec -i "$CONTENEUR" psql -U postgres -tA -q 2>&1
}
T=$(mktemp -d)
ajouter C1 > "$T/a.txt" &
sleep 0.5
ajouter C2 > "$T/b.txt" &
wait
verifie "deux ajouts passent" "$(grep -l "ERROR" "$T/a.txt" "$T/b.txt" | wc -l | tr -d ' ')" "0"
verifie "rangs distincts 1 et 2" "$(sql "select string_agg(ordre::text, ',' order by ordre) from interclub.bloc where epreuve_id = '$EPR';")" "1,2"
purger
rm -rf "$T"

echo "== GB-08 Migration rejouée (idempotence) =="
VERSION="202611101500_gardes_en_base"
MIGRATION="supabase/migrations/archive/$VERSION.sql"
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
etat() {
  sql "select (select count(*) from pg_trigger where not tgisinternal and tgname ~ '(_verifier_controle|_structure_modifiable|_rang|^composition_effectif$|^pret_verifier$|^grimpeur_licence_generee$)')
              || '/' || (select count(*) from pg_policies where schemaname = 'interclub'
                          and tablename in ('resultat_voie', 'resultat_bloc') and coalesce(qual, with_check) ~ 'phase_de_')
              || '/' || (select count(*) from interclub.version where version = '$VERSION');"
}
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "rejeu de la migration"; else ko "rejeu de la migration en erreur"; fi
verifie "19 triggers, 6 policies, version enregistrée" "$(etat)" "19/6/1"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
