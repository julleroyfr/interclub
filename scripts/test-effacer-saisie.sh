#!/usr/bin/env bash
#
# Tests de l'effacement d'une saisie (spec #6 R13ter, spec #17 R10, spec #9 R8 ;
# migration 202611171400 — fonction `retirer_resultat_bloc`).
#
#   - EF-01 : coach, efface un résultat de bloc : la ligne disparaît.
#   - EF-02 : coach, efface un bloc sans résultat : sans effet.
#   - EF-03 : effacement plus ancien que le résultat : refusé, résultat intact.
#   - EF-04 : coach d'un autre club : refusé.
#   - EF-05 : coach, efface une voie ENFANT (retirer_resultat_voie) : permis.
#   - EF-06 : coach hors ③ (④ clôture) : refusé.
#   - EF-07 : admin en ④ : efface un bloc et une voie (écriture directe).
#   - EF-08 : droits (anon refusé, authenticated permis).
#   - EF-09 : rejeu idempotent de la migration.
#
# EF-01 à EF-08 tournent dans une transaction annulée : la base locale est
# rendue dans son état.
#
# Pré-requis : `supabase start` (seed 01 : clubs A et B, admin, coachs).
# Usage      : bash scripts/test-effacer-saisie.sh   (ou : npm run test:effacer-saisie)

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
COACH_B=dddddddd-dddd-dddd-dddd-dddddddddddd
P=e0e0e0e0-0000-0000

SQL=$(cat <<EOSQL
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as \$fn\$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
\$fn\$;

-- Appel sous l'identité p_uid : 'ok' ou le message d'erreur.
create or replace function pg_temp.appel(p_uid uuid, p_sql text)
returns text language plpgsql as \$fn\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end;
\$fn\$;

create or replace function pg_temp.bloc_de(p_grimpeur uuid)
returns text language sql as \$fn\$
  select coalesce(string_agg(b.code || ':' || r.issue, ',' order by b.ordre), '')
    from interclub.resultat_bloc r join interclub.bloc b on b.id = r.bloc_id
   where r.grimpeur_id = p_grimpeur and b.epreuve_id = '$P-0000-0000000000e2';
\$fn\$;

create or replace function pg_temp.voies_de(p_grimpeur uuid)
returns text language sql as \$fn\$
  select coalesce(string_agg(v.niveau || ':' || r.issue, ',' order by v.ordre), '')
    from interclub.resultat_voie r join interclub.voie_difficulte v on v.id = r.voie_difficulte_id
   where r.grimpeur_id = p_grimpeur and v.epreuve_id = '$P-0000-0000000000e1';
\$fn\$;

-- ---- Jeu d'essai --------------------------------------------------------
-- E : enfant, jour J, ③ ; voies T2, T3, T4 ; blocs B1, B2 (palier « 1er essai »).
-- gA : club A, groupe T2. gB : club B, groupe T2.
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
  ('$P-0000-0000000000e0', current_date, '11111111-1111-1111-1111-111111111111', 'enfant', 'pre_competition');
insert into interclub.epreuve (id, rencontre_id, type, active) values
  ('$P-0000-0000000000e1', '$P-0000-0000000000e0', 'voie', true),
  ('$P-0000-0000000000e2', '$P-0000-0000000000e0', 'bloc', true);
insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_prise_valorisee) values
  ('$P-0001-000000000002', '$P-0000-0000000000e1', 'T2', 'tete', '5a', 1, 7, 4),
  ('$P-0001-000000000003', '$P-0000-0000000000e1', 'T3', 'tete', '5b', 2, 8, 4),
  ('$P-0001-000000000004', '$P-0000-0000000000e1', 'T4', 'tete', '5c', 3, 9, 5);
insert into interclub.bloc (id, epreuve_id, code, ordre) values
  ('$P-0002-000000000001', '$P-0000-0000000000e2', 'B1', 1),
  ('$P-0002-000000000002', '$P-0000-0000000000e2', 'B2', 2);
insert into interclub.bloc_palier (id, bloc_id, libelle, points, ordre) values
  ('$P-0005-000000000001', '$P-0002-000000000001', '1er essai', 10, 1),
  ('$P-0005-000000000002', '$P-0002-000000000002', '1er essai', 10, 1);
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('$P-0003-0000000000a0', '$P-0000-0000000000e0', '11111111-1111-1111-1111-111111111111', 'Essai effacer A'),
  ('$P-0003-0000000000b0', '$P-0000-0000000000e0', '22222222-2222-2222-2222-222222222222', 'Essai effacer B');
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence) values
  ('$P-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'Effacer', 'gA', 2016, 'F', 950001),
  ('$P-0004-000000000002', '22222222-2222-2222-2222-222222222222', 'Effacer', 'gB', 2016, 'F', 950002);
insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart) values
  ('$P-0003-0000000000a0', '$P-0004-000000000001', 'T2'),
  ('$P-0003-0000000000b0', '$P-0004-000000000002', 'T2');
update interclub.rencontre set phase = 'competition' where id = '$P-0000-0000000000e0';

-- Résultats existants (saisis maintenant).
insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
  ('$P-0002-000000000001', '$P-0004-000000000001', 'palier', '$P-0005-000000000001'),
  ('$P-0002-000000000001', '$P-0004-000000000002', 'echec', null);
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
  ('$P-0001-000000000003', '$P-0004-000000000001', 'top');

-- ---- EF-01 / EF-02 / EF-03 : effacer un bloc --------------------------------
select pg_temp.verif('EF-03 effacement plus ancien refusé', 'saisie_plus_ancienne',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_bloc('$P-0002-000000000001', '$P-0004-000000000001', now() - interval '1 hour')\$q\$));
select pg_temp.verif('EF-03 résultat intact', 'B1:palier', pg_temp.bloc_de('$P-0004-000000000001'));
select pg_temp.verif('EF-01 coach efface B1', 'ok',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_bloc('$P-0002-000000000001', '$P-0004-000000000001')\$q\$));
select pg_temp.verif('EF-01 B1 revenu à « à saisir »', '', pg_temp.bloc_de('$P-0004-000000000001'));
select pg_temp.verif('EF-02 effacer B2 sans résultat : sans effet', 'ok',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_bloc('$P-0002-000000000002', '$P-0004-000000000001')\$q\$));

-- ---- EF-04 : autre club ------------------------------------------------------
select pg_temp.verif('EF-04 coach A sur grimpeur du club B : refusé', 'hors_perimetre',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_bloc('$P-0002-000000000001', '$P-0004-000000000002')\$q\$));
select pg_temp.verif('EF-04 résultat du club B intact', 'B1:echec', pg_temp.bloc_de('$P-0004-000000000002'));

-- ---- EF-05 : voie enfant -----------------------------------------------------
select pg_temp.verif('EF-05 coach efface la voie enfant T3', 'ok',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_voie('$P-0001-000000000003', '$P-0004-000000000001')\$q\$));
select pg_temp.verif('EF-05 T3 revenue à « à saisir »', '', pg_temp.voies_de('$P-0004-000000000001'));

-- ---- EF-06 / EF-07 : clôture ------------------------------------------------
insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id) values
  ('$P-0002-000000000002', '$P-0004-000000000001', 'palier', '$P-0005-000000000002');
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values
  ('$P-0001-000000000004', '$P-0004-000000000001', 'echec');
update interclub.rencontre set phase = 'cloture' where id = '$P-0000-0000000000e0';
select pg_temp.verif('EF-06 coach en ④ : effacement de bloc refusé', 'competition_cloturee',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_bloc('$P-0002-000000000002', '$P-0004-000000000001')\$q\$));
select pg_temp.verif('EF-06 coach en ④ : effacement de voie refusé', 'competition_cloturee',
  pg_temp.appel('$COACH', \$q\$select interclub.retirer_resultat_voie('$P-0001-000000000004', '$P-0004-000000000001')\$q\$));
select pg_temp.verif('EF-07 admin en ④ efface B2', 'ok',
  pg_temp.appel('$ADMIN', \$q\$delete from interclub.resultat_bloc where bloc_id = '$P-0002-000000000002' and grimpeur_id = '$P-0004-000000000001'\$q\$));
select pg_temp.verif('EF-07 admin en ④ efface T4', 'ok',
  pg_temp.appel('$ADMIN', \$q\$delete from interclub.resultat_voie where voie_difficulte_id = '$P-0001-000000000004' and grimpeur_id = '$P-0004-000000000001'\$q\$));
select pg_temp.verif('EF-07 lignes effacées', '/',
  pg_temp.bloc_de('$P-0004-000000000001') || '/' || pg_temp.voies_de('$P-0004-000000000001'));

-- ---- EF-08 : droits ---------------------------------------------------------
select pg_temp.verif('EF-08 droits anon / authenticated', 'false/true',
  (select case when f is null then 'fonction absente' else
     has_function_privilege('anon', f, 'execute')::text || '/' ||
     has_function_privilege('authenticated', f, 'execute')::text end
     from (select to_regprocedure('interclub.retirer_resultat_bloc(uuid, uuid, timestamptz)') f) p));

select (case when ok then 'OK' else 'KO' end) || '|' || id || '|' || attendu || '|' || obtenu
  from pg_temp._res order by id;
rollback;
EOSQL
)

echo "== Effacer une saisie (spec #6 R13ter, spec #17 R10, spec #9 R8) =="
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

echo "== EF-09 Migration rejouée (idempotence) =="
sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }
VERSION="202611171400_retirer_resultat_bloc"
MIGRATION="supabase/migrations/$VERSION.sql"
[ -f "$MIGRATION" ] || MIGRATION="supabase/migrations/archive/$VERSION.sql"
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
etat() {
  sql "select (to_regprocedure('interclub.retirer_resultat_bloc(uuid, uuid, timestamptz)') is not null)::text
              || '/' || (select count(*) from interclub.version where version = '$VERSION');"
}
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "rejeu de la migration"; else ko "rejeu de la migration en erreur"; fi
verifie "fonction présente, version enregistrée" "$(etat)" "true/1"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
