#!/usr/bin/env bash
#
# Tests des RPC d'écritures atomiques (lot 7 du plan « appels Supabase » :
# constats A1–A5, P15 ; migration 202611101600). Chaque opération en plusieurs
# étapes se fait en un appel et une transaction : un échec à mi-parcours ne
# laisse rien.
#
#   - EA-01 (A1) : barème de vitesse d'une rencontre — succès (points fixes,
#             échelons remplacés, ordre = position), refus non admin, épreuve
#             non vitesse, saisie de vitesse existante (spec #3 R55e), phase ③
#             (garde de structure), atomicité.
#   - EA-02 (A2) : barème du gabarit — succès, refus non admin, atomicité.
#   - EA-03 (A3) : régénération d'un jeton — admin et coach de son club
#             (périmètre conservé, ancien révoqué) ; jeton d'un autre club
#             introuvable ; atomicité.
#   - EA-04 (A4) : régénération de l'invitation coach — succès, refus coach,
#             atomicité.
#   - EA-05 (A5) : invitation administrateur — une seule active après deux
#             générations, refus coach, atomicité.
#   - EA-06 : droits (anon refusé, authenticated permis).
#   - EA-07 : rejeu de la migration, retour arrière puis réapplication.
#
# EA-01 à EA-06 tournent dans une transaction annulée. La base locale est
# rendue dans son état.
#
# Pré-requis : `supabase start` (seed 01 chargé : clubs A et B, admin, coach).
# Usage      : bash scripts/test-ecritures-atomiques.sh   (ou : npm run test:ecritures-atomiques)

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
R1=e7e7e7e7-0000-0000-0000-000000000001   # rencontre ①
R3=e7e7e7e7-0000-0000-0000-000000000003   # rencontre ③
EV1=e7e7e7e7-0000-0000-0001-000000000001  # épreuve de vitesse de R1
EB1=e7e7e7e7-0000-0000-0001-000000000002  # épreuve de bloc de R1
EV3=e7e7e7e7-0000-0000-0001-000000000003  # épreuve de vitesse de R3
JA=e7e7e7e7-0000-0000-0002-00000000000a   # jeton coach temporaire, club A
JB=e7e7e7e7-0000-0000-0002-00000000000b   # jeton coach temporaire, club B
INV=e7e7e7e7-0000-0000-0003-000000000001  # invitation coach, club A
# Épreuve de vitesse du gabarit enfant (seed ; identifiant tiré au sort au reset).
GAB=$(docker exec "$CONTENEUR" psql -U postgres -tA -c \
  "select id from interclub.gabarit_epreuve where categorie = 'enfant' and type = 'vitesse';")

ECHELONS='[{"rang_min":1,"rang_max":3,"points":50,"decrement":5},{"rang_min":4,"rang_max":null,"points":30,"decrement":1}]'
ECHELONS_KO='[{"rang_min":1,"rang_max":3,"points":50,"decrement":5},{"rang_min":4,"rang_max":null,"points":-1,"decrement":1}]'

SQL=$(cat <<EOSQL
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as \$fn\$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
\$fn\$;

-- Exécute p_sql sous l'identité p_uid (rôle authenticated) : « ok » ou le
-- message d'erreur. L'échec annule les écritures de l'appel (sous-transaction).
create or replace function pg_temp.essai(p_uid uuid, p_sql text)
returns text language plpgsql as \$fn\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return 'ok';
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return sqlerrm;
end;
\$fn\$;

create or replace function pg_temp.bareme(p_epreuve uuid)
returns text language sql as \$fn\$
  select coalesce(e.points_chute::text, '∅') || '/' || coalesce(e.points_non_presentation::text, '∅') || '|'
      || coalesce((select string_agg(b.ordre || ':' || b.rang_min || '-' || coalesce(b.rang_max::text, '∞')
                                     || '=' || b.points || '-' || b.decrement, ' ' order by b.ordre)
                     from interclub.bareme_vitesse_echelon b where b.epreuve_id = p_epreuve), '')
    from interclub.epreuve e where e.id = p_epreuve;
\$fn\$;

create or replace function pg_temp.bareme_gabarit(p_epreuve uuid)
returns text language sql as \$fn\$
  select coalesce(e.points_chute::text, '∅') || '/' || coalesce(e.points_non_presentation::text, '∅') || '|'
      || coalesce((select string_agg(b.ordre || ':' || b.rang_min || '-' || coalesce(b.rang_max::text, '∞')
                                     || '=' || b.points || '-' || b.decrement, ' ' order by b.ordre)
                     from interclub.gabarit_bareme_vitesse_echelon b where b.gabarit_epreuve_id = p_epreuve), '')
    from interclub.gabarit_epreuve e where e.id = p_epreuve;
\$fn\$;

-- Insertion forcée en échec sur une table (atomicité).
create function public._ea_echec() returns trigger language plpgsql as \$fn\$
begin
  raise exception 'echec_force';
end;
\$fn\$;

-- ---- Jeu d'essai (posé sans JWT) -----------------------------------------
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
  ('$R1', current_date, '$CLUB_A', 'enfant', 'pre_competition'),
  ('$R3', current_date, '$CLUB_A', 'enfant', 'pre_competition');
insert into interclub.epreuve (id, rencontre_id, type, points_chute, points_non_presentation) values
  ('$EV1', '$R1', 'vitesse', 2, 1),
  ('$EB1', '$R1', 'bloc', null, null),
  ('$EV3', '$R3', 'vitesse', 2, 1);
insert into interclub.bareme_vitesse_echelon (epreuve_id, rang_min, rang_max, points, decrement, ordre) values
  ('$EV1', 1, null, 10, 1, 1),
  ('$EV3', 1, null, 10, 1, 1);
update interclub.rencontre set phase = 'competition' where id = '$R3';

update interclub.jeton_qr set actif = false where rencontre_id in ('$R1', '$R3');
insert into interclub.jeton_qr (id, rencontre_id, nature, club_id) values
  ('$JA', '$R1', 'coach_temporaire', '$CLUB_A'),
  ('$JB', '$R1', 'coach_temporaire', '$CLUB_B');

update interclub.invitation_coach set actif = false where club_id = '$CLUB_A';
insert into interclub.invitation_coach (id, club_id) values ('$INV', '$CLUB_A');

-- ---- EA-01 (A1) : barème de vitesse d'une rencontre ------------------------
select pg_temp.verif('EA-01a coach : refusé', 'non_admin',
  pg_temp.essai('$COACH', \$q\$select interclub.mettre_a_jour_bareme_vitesse('$EV1', 3, 4, '$ECHELONS')\$q\$));
select pg_temp.verif('EA-01b admin : barème remplacé', 'ok',
  pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse('$EV1', 3, 4, '$ECHELONS')\$q\$));
select pg_temp.verif('EA-01b points fixes et échelons (ordre = position)', '3/4|1:1-3=50-5 2:4-∞=30-1',
  pg_temp.bareme('$EV1'));
select pg_temp.verif('EA-01c atomicité : échelon invalide refusé', 'refusé',
  (select case when pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse('$EV1', 9, 9, '$ECHELONS_KO')\$q\$) = 'ok'
               then 'accepté' else 'refusé' end));
select pg_temp.verif('EA-01c barème intact', '3/4|1:1-3=50-5 2:4-∞=30-1', pg_temp.bareme('$EV1'));
select pg_temp.verif('EA-01d épreuve qui n''est pas de vitesse : refusé', 'epreuve_introuvable',
  pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse('$EB1', 3, 4, '$ECHELONS')\$q\$));
select pg_temp.verif('EA-01e rencontre en ③ : refusé (garde de structure)', 'structure_figee',
  pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse('$EV3', 3, 4, '$ECHELONS')\$q\$));
select pg_temp.verif('EA-01e barème de ③ intact', '2/1|1:1-∞=10-1', pg_temp.bareme('$EV3'));
insert into interclub.points_vitesse (epreuve_id, grimpeur_id, rang, points)
select '$EV1', id, 1, 50 from interclub.grimpeur order by id limit 1;
select pg_temp.verif('EA-01f saisie de vitesse existante : refusé (R55e)', 'bareme_saisies_existantes',
  pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse('$EV1', 3, 4, '$ECHELONS')\$q\$));

-- ---- EA-02 (A2) : barème du gabarit ----------------------------------------
create temp table _gab as select pg_temp.bareme_gabarit('$GAB') as avant;
select pg_temp.verif('EA-02a coach : refusé', 'non_admin',
  pg_temp.essai('$COACH', \$q\$select interclub.mettre_a_jour_bareme_vitesse_gabarit('$GAB', 3, 4, '$ECHELONS')\$q\$));
select pg_temp.verif('EA-02b atomicité : échelon invalide refusé', 'refusé',
  (select case when pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse_gabarit('$GAB', 9, 9, '$ECHELONS_KO')\$q\$) = 'ok'
               then 'accepté' else 'refusé' end));
select pg_temp.verif('EA-02b barème du gabarit intact', (select avant from _gab), pg_temp.bareme_gabarit('$GAB'));
select pg_temp.verif('EA-02c admin : barème remplacé', 'ok',
  pg_temp.essai('$ADMIN', \$q\$select interclub.mettre_a_jour_bareme_vitesse_gabarit('$GAB', 3, 4, '$ECHELONS')\$q\$));
select pg_temp.verif('EA-02c points fixes et échelons', '3/4|1:1-3=50-5 2:4-∞=30-1',
  pg_temp.bareme_gabarit('$GAB'));

-- ---- EA-03 (A3) : régénération d'un jeton ----------------------------------
select pg_temp.verif('EA-03a coach, jeton de son club : régénéré', 'ok',
  pg_temp.essai('$COACH', \$q\$select interclub.regenerer_jeton('$JA')\$q\$));
select pg_temp.verif('EA-03a ancien révoqué, un seul actif, même périmètre', 'false|1|coach_temporaire',
  (select actif::text from interclub.jeton_qr where id = '$JA') || '|' ||
  (select count(*) || '|' || min(nature) from interclub.jeton_qr
    where rencontre_id = '$R1' and club_id = '$CLUB_A' and actif));
select pg_temp.verif('EA-03b coach, jeton d''un autre club : introuvable', 'jeton_introuvable',
  pg_temp.essai('$COACH', \$q\$select interclub.regenerer_jeton('$JB')\$q\$));
select pg_temp.verif('EA-03b jeton de l''autre club intact', 'true', (select actif::text from interclub.jeton_qr where id = '$JB'));
create trigger _ea_echec before insert on interclub.jeton_qr for each row execute function public._ea_echec();
select pg_temp.verif('EA-03c atomicité : création en échec', 'echec_force',
  pg_temp.essai('$ADMIN', \$q\$select interclub.regenerer_jeton('$JB')\$q\$));
drop trigger _ea_echec on interclub.jeton_qr;
select pg_temp.verif('EA-03c ancien jeton toujours actif', 'true', (select actif::text from interclub.jeton_qr where id = '$JB'));
select pg_temp.verif('EA-03d admin : régénéré', 'ok',
  pg_temp.essai('$ADMIN', \$q\$select interclub.regenerer_jeton('$JB')\$q\$));

-- ---- EA-04 (A4) : régénération de l'invitation coach ------------------------
select pg_temp.verif('EA-04a coach : refusé', 'non_admin',
  pg_temp.essai('$COACH', \$q\$select interclub.regenerer_invitation_coach('$INV')\$q\$));
create trigger _ea_echec before insert on interclub.invitation_coach for each row execute function public._ea_echec();
select pg_temp.verif('EA-04b atomicité : création en échec', 'echec_force',
  pg_temp.essai('$ADMIN', \$q\$select interclub.regenerer_invitation_coach('$INV')\$q\$));
drop trigger _ea_echec on interclub.invitation_coach;
select pg_temp.verif('EA-04b ancienne invitation toujours active', 'true',
  (select actif::text from interclub.invitation_coach where id = '$INV'));
select pg_temp.verif('EA-04c admin : régénérée', 'ok',
  pg_temp.essai('$ADMIN', \$q\$select interclub.regenerer_invitation_coach('$INV')\$q\$));
select pg_temp.verif('EA-04c ancienne révoquée, une seule active pour le club', 'false|1',
  (select actif::text from interclub.invitation_coach where id = '$INV') || '|' ||
  (select count(*) from interclub.invitation_coach where club_id = '$CLUB_A' and actif));
select pg_temp.verif('EA-04d invitation inconnue', 'invitation_introuvable',
  pg_temp.essai('$ADMIN', \$q\$select interclub.regenerer_invitation_coach(gen_random_uuid())\$q\$));

-- ---- EA-05 (A5) : invitation administrateur ---------------------------------
select pg_temp.verif('EA-05a coach : refusé', 'non_admin',
  pg_temp.essai('$COACH', \$q\$select interclub.generer_invitation_admin()\$q\$));
select pg_temp.verif('EA-05b deux générations', 'ok|ok',
  pg_temp.essai('$ADMIN', \$q\$select interclub.generer_invitation_admin()\$q\$) || '|' ||
  pg_temp.essai('$ADMIN', \$q\$select interclub.generer_invitation_admin()\$q\$));
create temp table _active as select id from interclub.invitation_admin where actif;
select pg_temp.verif('EA-05b une seule invitation active', '1', (select count(*)::text from _active));
create trigger _ea_echec before insert on interclub.invitation_admin for each row execute function public._ea_echec();
select pg_temp.verif('EA-05c atomicité : création en échec', 'echec_force',
  pg_temp.essai('$ADMIN', \$q\$select interclub.generer_invitation_admin()\$q\$));
drop trigger _ea_echec on interclub.invitation_admin;
select pg_temp.verif('EA-05c invitation active inchangée', 'true',
  (select actif::text from interclub.invitation_admin where id = (select id from _active)));

-- ---- EA-06 : droits -----------------------------------------------------------
select pg_temp.verif('EA-06 droits anon / authenticated (5 fonctions)', 'false/true',
  (select case when count(f) < 5 then 'fonction absente' else
     bool_or(has_function_privilege('anon', f, 'execute'))::text || '/' ||
     bool_and(has_function_privilege('authenticated', f, 'execute'))::text end
     from (select unnest(array[
       to_regprocedure('interclub.mettre_a_jour_bareme_vitesse(uuid, int, int, jsonb)'),
       to_regprocedure('interclub.mettre_a_jour_bareme_vitesse_gabarit(uuid, int, int, jsonb)'),
       to_regprocedure('interclub.regenerer_jeton(uuid)'),
       to_regprocedure('interclub.regenerer_invitation_coach(uuid)'),
       to_regprocedure('interclub.generer_invitation_admin()')]) f) p));

select (case when ok then 'OK' else 'KO' end) || E'\t' || id || E'\t' || attendu || E'\t' || obtenu
  from pg_temp._res order by id;
rollback;
EOSQL
)

echo "== Écritures atomiques (A1–A5) =="
SORTIE=$(printf '%s\n' "$SQL" | docker exec -i "$CONTENEUR" psql -U postgres -tA -q 2>&1)
if ! printf '%s\n' "$SORTIE" | grep -qE '^(OK|KO)'$'\t'; then
  echo "$SORTIE" >&2
  echo "Exécution SQL en échec." >&2
  exit 2
fi
while IFS=$'\t' read -r etat id attendu obtenu; do
  case "$etat" in
    OK) ok "$id" ;;
    KO) ko "$id — obtenu « $obtenu », attendu « $attendu »" ;;
  esac
done <<< "$(printf '%s\n' "$SORTIE" | grep -E '^(OK|KO)'$'\t')"

echo "== EA-07 Migration rejouée, retour arrière, réapplication =="
sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }
VERSION="202611101600_rpc_ecritures_atomiques"
MIGRATION="supabase/migrations/$VERSION.sql"
RETOUR="supabase/retours-arriere/${VERSION}_retour_arriere.sql"
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
etat() {
  sql "select (select count(*) from pg_proc where pronamespace = 'interclub'::regnamespace
                 and proname in ('mettre_a_jour_bareme_vitesse', 'mettre_a_jour_bareme_vitesse_gabarit',
                                 'regenerer_jeton', 'regenerer_invitation_coach', 'generer_invitation_admin'))
              || '/' || (select count(*) from interclub.version where version = '$VERSION');"
}
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "rejeu de la migration"; else ko "rejeu de la migration en erreur"; fi
verifie "5 fonctions, version enregistrée" "$(etat)" "5/1"
if [ -f "$RETOUR" ] && appliquer "$RETOUR"; then ok "retour arrière"; else ko "retour arrière en erreur"; fi
verifie "fonctions et version retirées" "$(etat)" "0/0"
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "réapplication"; else ko "réapplication en erreur"; fi
verifie "présentes après réapplication" "$(etat)" "5/1"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
