#!/usr/bin/env bash
#
# Tests de la RPC `changer_phase_rencontre` (lot 5 du plan « appels Supabase » :
# constats P7, J3, B2 ; migration 202611101300). Un seul appel, une seule
# transaction : garde admin, transition adjacente (spec #3 R17), garde du jour J
# (spec #1 R5), NP automatique à la clôture (spec #6 R18), transition
# conditionnée à la phase courante.
#
#   - CL-01 : non admin (coach) refusé, phase inchangée.
#   - CL-02 : transition non adjacente refusée (③ → ⑤, ① → ③).
#   - CL-03 : jour J — ② refusée hors jour J ; ③ → ① permis hors jour J,
#             ③ → ② refusé hors jour J.
#   - CL-04 : ③ → ④ enfant : NP sur les niveaux du groupe de départ non saisis
#             (voie représentative), NP sur les blocs non saisis ; aucun NP sans
#             groupe ; résultats saisis intacts ; une autre rencontre intacte.
#   - CL-05 : seconde clôture (deux admins) refusée, aucune écriture.
#   - CL-06 : relance ④ → ③ → ④ idempotente.
#   - CL-07 : ado sans NP de voie ; adulte, épreuve de bloc désactivée sans NP.
#   - CL-08 : NP en échec → phase inchangée (une seule transaction).
#   - CL-09 : droits (anon refusé, authenticated permis).
#   - CL-10 : deux clôtures simultanées : une seule passe.
#   - CL-11 : rejeu de la migration, retour arrière puis réapplication.
#
# CL-01 à CL-09 tournent dans une transaction annulée ; CL-10 écrit puis purge
# sa rencontre d'essai. La base locale est rendue dans son état.
#
# Pré-requis : `supabase start` (seed 01 chargé : clubs A et B, admin, coach).
# Usage      : bash scripts/test-cloture.sh   (ou : npm run test:cloture)

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

SQL=$(cat <<EOSQL
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as \$fn\$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
\$fn\$;

-- Appel de la RPC sous l'identité p_uid (rôle authenticated) : 'ok' ou le
-- message d'erreur. L'échec annule les écritures de l'appel (sous-transaction).
create or replace function pg_temp.phase(p_uid uuid, p_rencontre uuid, p_phase text)
returns text language plpgsql as \$fn\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform interclub.changer_phase_rencontre(p_rencontre, p_phase);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end;
\$fn\$;

create or replace function pg_temp.phase_de(p_rencontre uuid)
returns text language sql as \$fn\$
  select phase from interclub.rencontre where id = p_rencontre;
\$fn\$;

-- ---- Jeu d'essai --------------------------------------------------------
-- E : enfant jour J, en ③, voies M1, M2, M2bis (seconde voie M2), M3, M4, T1 ;
--     blocs B1, B2. Grimpeurs :
--       g1 (M1) : M1 top, M2bis top, B1 échec → NP attendus : M3, B2 ;
--       g2 (sans groupe)                      → NP attendus : B1, B2 ;
--       g3 (M3) : rien                        → NP : M3, M4, T1, B1, B2.
-- X : autre rencontre enfant (③) où g1 a un bloc saisi (g2 non) : intacte.
-- A : ado ③ (g4 sans résultat) ; D : adulte ③, bloc désactivé (g5).
-- F : enfant ① hors jour J (demain).
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
  ('c1c1c1c1-0000-0000-0000-0000000000e0', current_date,     '11111111-1111-1111-1111-111111111111', 'enfant', 'pre_competition'),
  ('c1c1c1c1-0000-0000-0000-0000000000a0', current_date,     '11111111-1111-1111-1111-111111111111', 'enfant', 'pre_competition'),
  ('c1c1c1c1-0000-0000-0000-0000000000b0', current_date,     '11111111-1111-1111-1111-111111111111', 'ado',    'pre_competition'),
  ('c1c1c1c1-0000-0000-0000-0000000000d0', current_date,     '11111111-1111-1111-1111-111111111111', 'adulte', 'pre_competition'),
  ('c1c1c1c1-0000-0000-0000-0000000000f0', current_date + 1, '11111111-1111-1111-1111-111111111111', 'enfant', 'pre_competition');
insert into interclub.epreuve (id, rencontre_id, type, active) values
  ('c1c1c1c1-0000-0000-0000-0000000000e1', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'voie', true),
  ('c1c1c1c1-0000-0000-0000-0000000000e2', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'bloc', true),
  ('c1c1c1c1-0000-0000-0000-0000000000a2', 'c1c1c1c1-0000-0000-0000-0000000000a0', 'bloc', true),
  ('c1c1c1c1-0000-0000-0000-0000000000b1', 'c1c1c1c1-0000-0000-0000-0000000000b0', 'voie', true),
  ('c1c1c1c1-0000-0000-0000-0000000000b2', 'c1c1c1c1-0000-0000-0000-0000000000b0', 'bloc', true),
  ('c1c1c1c1-0000-0000-0000-0000000000d2', 'c1c1c1c1-0000-0000-0000-0000000000d0', 'bloc', false);
insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, ordre, points) values
  ('c1c1c1c1-0000-0000-0001-000000000001', 'c1c1c1c1-0000-0000-0000-0000000000e1', 'M1', 'moulinette', '4c', 1, 1),
  ('c1c1c1c1-0000-0000-0001-000000000002', 'c1c1c1c1-0000-0000-0000-0000000000e1', 'M2', 'moulinette', '5a', 2, 2),
  ('c1c1c1c1-0000-0000-0001-000000000022', 'c1c1c1c1-0000-0000-0000-0000000000e1', 'M2', 'moulinette', '5a', 7, 2),
  ('c1c1c1c1-0000-0000-0001-000000000003', 'c1c1c1c1-0000-0000-0000-0000000000e1', 'M3', 'moulinette', '5b', 3, 3),
  ('c1c1c1c1-0000-0000-0001-000000000004', 'c1c1c1c1-0000-0000-0000-0000000000e1', 'M4', 'moulinette', '5c', 4, 4),
  ('c1c1c1c1-0000-0000-0001-000000000005', 'c1c1c1c1-0000-0000-0000-0000000000e1', 'T1', 'tete',       '4c', 5, 5),
  ('c1c1c1c1-0000-0000-0001-0000000000b1', 'c1c1c1c1-0000-0000-0000-0000000000b1', 'T1', 'tete',       '5a', 1, 5);
insert into interclub.bloc (id, epreuve_id, code, ordre) values
  ('c1c1c1c1-0000-0000-0002-000000000001', 'c1c1c1c1-0000-0000-0000-0000000000e2', 'B1', 1),
  ('c1c1c1c1-0000-0000-0002-000000000002', 'c1c1c1c1-0000-0000-0000-0000000000e2', 'B2', 2),
  ('c1c1c1c1-0000-0000-0002-0000000000a1', 'c1c1c1c1-0000-0000-0000-0000000000a2', 'B1', 1),
  ('c1c1c1c1-0000-0000-0002-0000000000b1', 'c1c1c1c1-0000-0000-0000-0000000000b2', 'B1', 1),
  ('c1c1c1c1-0000-0000-0002-0000000000d1', 'c1c1c1c1-0000-0000-0000-0000000000d2', 'B1', 1);
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('c1c1c1c1-0000-0000-0003-0000000000e0', 'c1c1c1c1-0000-0000-0000-0000000000e0', '11111111-1111-1111-1111-111111111111', 'Essai clôture'),
  ('c1c1c1c1-0000-0000-0003-0000000000a0', 'c1c1c1c1-0000-0000-0000-0000000000a0', '11111111-1111-1111-1111-111111111111', 'Essai autre'),
  ('c1c1c1c1-0000-0000-0003-0000000000b0', 'c1c1c1c1-0000-0000-0000-0000000000b0', '11111111-1111-1111-1111-111111111111', 'Essai ado'),
  ('c1c1c1c1-0000-0000-0003-0000000000d0', 'c1c1c1c1-0000-0000-0000-0000000000d0', null, 'Essai adulte');
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select ('c1c1c1c1-0000-0000-0004-00000000000' || n)::uuid,
       '11111111-1111-1111-1111-111111111111', 'Cloture', code, annee, 'F', 970000 + n
  from (values ('g1', 2016, 1), ('g2', 2016, 2), ('g3', 2016, 3), ('g4', 2012, 4), ('g5', 2000, 5))
       as t(code, annee, n);
insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart) values
  ('c1c1c1c1-0000-0000-0003-0000000000e0', 'c1c1c1c1-0000-0000-0004-000000000001', 'M1'),
  ('c1c1c1c1-0000-0000-0003-0000000000e0', 'c1c1c1c1-0000-0000-0004-000000000002', null),
  ('c1c1c1c1-0000-0000-0003-0000000000e0', 'c1c1c1c1-0000-0000-0004-000000000003', 'M3'),
  ('c1c1c1c1-0000-0000-0003-0000000000a0', 'c1c1c1c1-0000-0000-0004-000000000001', 'M1'),
  ('c1c1c1c1-0000-0000-0003-0000000000a0', 'c1c1c1c1-0000-0000-0004-000000000002', null),
  ('c1c1c1c1-0000-0000-0003-0000000000b0', 'c1c1c1c1-0000-0000-0004-000000000004', null),
  ('c1c1c1c1-0000-0000-0003-0000000000d0', 'c1c1c1c1-0000-0000-0004-000000000005', null);
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
  ('c1c1c1c1-0000-0000-0001-000000000001', 'c1c1c1c1-0000-0000-0004-000000000001', 'top'),
  ('c1c1c1c1-0000-0000-0001-000000000022', 'c1c1c1c1-0000-0000-0004-000000000001', 'top');
insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue) values
  ('c1c1c1c1-0000-0000-0002-000000000001', 'c1c1c1c1-0000-0000-0004-000000000001', 'echec'),
  ('c1c1c1c1-0000-0000-0002-0000000000a1', 'c1c1c1c1-0000-0000-0004-000000000001', 'echec');

-- Structure et engagements posés en ①, puis passage direct en ③ (pré-condition).
update interclub.rencontre set phase = 'competition'
 where id::text like 'c1c1c1c1-%' and id <> 'c1c1c1c1-0000-0000-0000-0000000000f0';

-- ---- CL-01 : non admin refusé ------------------------------------------
select pg_temp.verif('CL-01 coach : refusé', 'non_admin',
  pg_temp.phase('$COACH', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'cloture'));
select pg_temp.verif('CL-01 coach : phase inchangée', 'competition',
  pg_temp.phase_de('c1c1c1c1-0000-0000-0000-0000000000e0'));
select pg_temp.verif('CL-01 rencontre inconnue', 'rencontre_introuvable',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000ff', 'cloture'));
select pg_temp.verif('CL-01 phase inconnue', 'phase_invalide',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'demain'));

-- ---- CL-02 : transitions non adjacentes ---------------------------------
select pg_temp.verif('CL-02 ③ → ⑤ refusé', 'transition_refusee',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'resultats_publics'));
select pg_temp.verif('CL-02 ① → ③ refusé', 'transition_refusee',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000f0', 'competition'));
select pg_temp.verif('CL-02 ③ inchangée', 'competition',
  pg_temp.phase_de('c1c1c1c1-0000-0000-0000-0000000000e0'));

-- ---- CL-03 : garde du jour J --------------------------------------------
select pg_temp.verif('CL-03 ① → ② hors jour J refusé', 'hors_jour_j',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000f0', 'preparation'));
update interclub.rencontre set phase = 'competition' where id = 'c1c1c1c1-0000-0000-0000-0000000000f0';
select pg_temp.verif('CL-03 ③ → ② hors jour J refusé', 'transition_refusee',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000f0', 'preparation'));
select pg_temp.verif('CL-03 ③ → ① hors jour J permis', 'ok',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000f0', 'pre_competition'));
select pg_temp.verif('CL-03 ③ → ① : phase', 'pre_competition',
  pg_temp.phase_de('c1c1c1c1-0000-0000-0000-0000000000f0'));

-- ---- CL-04 : clôture enfant ---------------------------------------------
select pg_temp.verif('CL-04 ③ → ④', 'ok',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'cloture'));
select pg_temp.verif('CL-04 phase', 'cloture', pg_temp.phase_de('c1c1c1c1-0000-0000-0000-0000000000e0'));
select pg_temp.verif('CL-04 g1 : NP de voie sur M3 seulement', 'M3',
  (select string_agg(v.niveau, ',' order by v.ordre) from interclub.resultat_voie r
     join interclub.voie_difficulte v on v.id = r.voie_difficulte_id
    where r.issue = 'np' and r.grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000001'));
select pg_temp.verif('CL-04 g3 : NP sur M3, M4, T1', 'M3,M4,T1',
  (select string_agg(v.niveau, ',' order by v.ordre) from interclub.resultat_voie r
     join interclub.voie_difficulte v on v.id = r.voie_difficulte_id
    where r.issue = 'np' and r.grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000003'));
select pg_temp.verif('CL-04 NP posé sur la voie représentative (plus petit ordre)', '0',
  (select count(*)::text from interclub.resultat_voie
    where voie_difficulte_id = 'c1c1c1c1-0000-0000-0001-000000000022' and issue = 'np'));
select pg_temp.verif('CL-04 g2 sans groupe : aucun NP de voie', '0',
  (select count(*)::text from interclub.resultat_voie
    where grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000002'));
select pg_temp.verif('CL-04 NP de bloc : g1 B2 ; g2 B1, B2 ; g3 B1, B2', 'g1:B2 g2:B1 g2:B2 g3:B1 g3:B2',
  (select string_agg(g.prenom || ':' || b.code, ' ' order by g.prenom, b.ordre)
     from interclub.resultat_bloc r
     join interclub.bloc b on b.id = r.bloc_id
     join interclub.grimpeur g on g.id = r.grimpeur_id
    where r.issue = 'np' and b.epreuve_id = 'c1c1c1c1-0000-0000-0000-0000000000e2'));
select pg_temp.verif('CL-04 résultats saisis intacts', 'echec,top,top',
  (select string_agg(issue, ',' order by issue) from (
     select issue from interclub.resultat_voie where grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000001' and issue <> 'np'
     union all
     select issue from interclub.resultat_bloc where bloc_id = 'c1c1c1c1-0000-0000-0002-000000000001'
       and grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000001') s));
select pg_temp.verif('CL-04 autre rencontre intacte (phase, NP)', 'competition/0',
  pg_temp.phase_de('c1c1c1c1-0000-0000-0000-0000000000a0') || '/' ||
  (select count(*) from interclub.resultat_bloc r join interclub.bloc b on b.id = r.bloc_id
    where b.epreuve_id = 'c1c1c1c1-0000-0000-0000-0000000000a2' and r.issue = 'np'));

-- ---- CL-05 : seconde clôture refusée ------------------------------------
create temp table _compte as
  select (select count(*) from interclub.resultat_voie) + (select count(*) from interclub.resultat_bloc) as n;
select pg_temp.verif('CL-05 seconde clôture refusée', 'transition_refusee',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'cloture'));
select pg_temp.verif('CL-05 aucune écriture', (select n::text from _compte),
  ((select count(*) from interclub.resultat_voie) + (select count(*) from interclub.resultat_bloc))::text);

-- ---- CL-06 : relance idempotente ----------------------------------------
select pg_temp.verif('CL-06 ④ → ③', 'ok',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'competition'));
select pg_temp.verif('CL-06 ③ → ④ à nouveau', 'ok',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000e0', 'cloture'));
select pg_temp.verif('CL-06 aucun résultat ajouté', (select n::text from _compte),
  ((select count(*) from interclub.resultat_voie) + (select count(*) from interclub.resultat_bloc))::text);

-- ---- CL-07 : ado et adulte ----------------------------------------------
select pg_temp.verif('CL-07 ado ③ → ④', 'ok',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000b0', 'cloture'));
select pg_temp.verif('CL-07 ado : aucun NP de voie, NP sur B1', '0/1',
  (select count(*) from interclub.resultat_voie where grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000004')
  || '/' ||
  (select count(*) from interclub.resultat_bloc where grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000004' and issue = 'np'));
select pg_temp.verif('CL-07 adulte ③ → ④', 'ok',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000d0', 'cloture'));
select pg_temp.verif('CL-07 adulte, bloc désactivé : aucun NP', '0',
  (select count(*)::text from interclub.resultat_bloc where grimpeur_id = 'c1c1c1c1-0000-0000-0004-000000000005'));

-- ---- CL-08 : NP en échec → phase inchangée -------------------------------
create function public._cl_echec() returns trigger language plpgsql as \$fn\$
begin
  raise exception 'echec_force';
end;
\$fn\$;
create trigger _cl_echec before insert on interclub.resultat_bloc
  for each row execute function public._cl_echec();
select pg_temp.verif('CL-08 clôture en échec', 'echec_force',
  pg_temp.phase('$ADMIN', 'c1c1c1c1-0000-0000-0000-0000000000a0', 'cloture'));
select pg_temp.verif('CL-08 phase inchangée', 'competition',
  pg_temp.phase_de('c1c1c1c1-0000-0000-0000-0000000000a0'));
drop trigger _cl_echec on interclub.resultat_bloc;

-- ---- CL-09 : droits -----------------------------------------------------
select pg_temp.verif('CL-09 droits anon / authenticated', 'false/true',
  (select case when f is null then 'fonction absente' else
     has_function_privilege('anon', f, 'execute')::text || '/' ||
     has_function_privilege('authenticated', f, 'execute')::text end
     from (select to_regprocedure('interclub.changer_phase_rencontre(uuid, text)') f) p));

select (case when ok then 'OK' else 'KO' end) || '|' || id || '|' || attendu || '|' || obtenu
  from pg_temp._res order by id;
rollback;
EOSQL
)

echo "== changer_phase_rencontre (R17, R5, R18) =="
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

echo "== CL-10 Deux clôtures simultanées =="
sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }
RENC=c1c1c1c1-0000-0000-0000-0000000000c0
purger() { sql "delete from interclub.rencontre where id = '$RENC';" >/dev/null; }
purger
sql "insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
     values ('$RENC', current_date, '11111111-1111-1111-1111-111111111111', 'enfant', 'competition');" >/dev/null
# Chaque session appelle la RPC puis garde sa transaction ouverte 2 s : la
# seconde, lancée pendant ce délai, doit attendre puis voir la phase ④.
cloturer() {
  printf '%s\n' "begin;
select set_config('request.jwt.claims', '{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}', true);
set local role authenticated;
select interclub.changer_phase_rencontre('$RENC', 'cloture');
select pg_sleep(2);
commit;" | docker exec -i "$CONTENEUR" psql -U postgres -tA -q 2>&1
}
T=$(mktemp -d)
cloturer > "$T/a.txt" &
sleep 0.5
cloturer > "$T/b.txt" &
wait
REUSSIES=$(grep -L "ERROR" "$T/a.txt" "$T/b.txt" | wc -l | tr -d ' ')
REFUSEES=$(grep -l "transition_refusee" "$T/a.txt" "$T/b.txt" | wc -l | tr -d ' ')
verifie "une seule clôture passe, l'autre est refusée" "$REUSSIES/$REFUSEES" "1/1"
verifie "phase finale" "$(sql "select phase from interclub.rencontre where id = '$RENC';")" "cloture"
purger
rm -rf "$T"

echo "== CL-11 Migration rejouée, retour arrière, réapplication =="
VERSION="202611101300_rpc_changer_phase_rencontre"
MIGRATION="supabase/migrations/$VERSION.sql"
RETOUR="supabase/retours-arriere/${VERSION}_retour_arriere.sql"
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
etat() {
  sql "select (to_regprocedure('interclub.changer_phase_rencontre(uuid, text)') is not null)::text
              || '/' || (select count(*) from interclub.version where version = '$VERSION');"
}
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "rejeu de la migration"; else ko "rejeu de la migration en erreur"; fi
verifie "fonction présente, version enregistrée" "$(etat)" "true/1"
if [ -f "$RETOUR" ] && appliquer "$RETOUR"; then ok "retour arrière"; else ko "retour arrière en erreur"; fi
verifie "fonction et version retirées" "$(etat)" "false/0"
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "réapplication"; else ko "réapplication en erreur"; fi
verifie "fonction présente après réapplication" "$(etat)" "true/1"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
