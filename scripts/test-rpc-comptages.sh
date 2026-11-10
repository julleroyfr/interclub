#!/usr/bin/env bash
#
# Tests automatisés des RPC de comptage (plan « appels Supabase », J4/J6)
# contre la stack Supabase LOCALE :
#   - `lister_comptes_permanents` (spec #2 R46) : tous les comptes permanents,
#     au-delà de 1000 utilisateurs anonymes (sessions QR) ; aucun anonyme ;
#     mapping et club joints ; EXECUTE refusé à anon et authenticated.
#   - `effectifs_grimpeurs` (spec #19 R9/R10) : somme des effectifs = nombre
#     de grimpeurs, une ligne par club et année ; EXECUTE refusé à anon et
#     authenticated.
#   - Rejeu des deux migrations, retour arrière puis réapplication.
#
# Rejouable : les utilisateurs anonymes créés ici sont supprimés à la fin.
#
# Pré-requis : `supabase start` puis `supabase db reset`. Docker + CLI.
# Usage      : bash scripts/test-rpc-comptages.sh   (ou : npm run test:rpc-comptages)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"
NB_ANONYMES=1100
PASS=0
FAIL=0

ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
verifie() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 — obtenu « $2 », attendu « $3 »"; fi; }

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

STATUS=$(supabase status 2>/dev/null)
KEY=$(printf '%s\n' "$STATUS" | grep -iE "anon.?key|publishable" | head -1 | sed 's/.*: *//' | tr -d '", ')
if [ -z "$KEY" ]; then
  echo "Stack locale introuvable. Démarre-la : supabase start && supabase db reset" >&2
  exit 2
fi

sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }

token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//'
}
# rpc <bearer|vide> <fonction> -> code HTTP
rpc() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/rpc/$2" \
    -H "apikey: $KEY" ${1:+-H "Authorization: Bearer $1"} \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" -d '{}'
}

TA=$(token admin@test.local "$MDP")
if [ -z "$TA" ]; then
  echo "Connexion du compte admin de test impossible (seed chargé ? lance supabase db reset)" >&2
  exit 2
fi

# Utilisateurs anonymes marqués (e-mail null, métadonnée de test) : purgeables.
purger_anonymes() {
  sql "delete from auth.users where is_anonymous and raw_app_meta_data ->> 'test' = 'rpc-comptages';" >/dev/null
}

echo "== lister_comptes_permanents (spec #2 R46) =="
purger_anonymes
sql "insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, created_at, updated_at)
     select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            true, '{\"test\": \"rpc-comptages\"}'::jsonb, now(), now()
       from generate_series(1, $NB_ANONYMES);" >/dev/null
verifie "plus de 1000 utilisateurs Auth (anonymes compris)" \
  "$(sql "select (count(*) > 1000)::text from auth.users;")" "true"
verifie "tous les comptes permanents listés" \
  "$(sql "select count(*) from interclub.lister_comptes_permanents();")" \
  "$(sql "select count(*) from auth.users where not coalesce(is_anonymous, false);")"
verifie "aucun compte anonyme listé" \
  "$(sql "select count(*) from interclub.lister_comptes_permanents() l
          join auth.users u on u.id = l.utilisateur_id where u.is_anonymous;")" "0"
verifie "mapping admin joint" \
  "$(sql "select coalesce(role, '-') || '/' || coalesce(club_nom, '-') from interclub.lister_comptes_permanents()
          where email = 'admin@test.local';")" "admin/-"
verifie "mapping coach et club joints" \
  "$(sql "select coalesce(role, '-') || '/' || coalesce(club_nom, '-') from interclub.lister_comptes_permanents()
          where email = 'coach@test.local';")" "coach/Club A"
verifie "trié par e-mail" \
  "$(sql "select (array_agg(email) = array_agg(email order by email))::text
            from interclub.lister_comptes_permanents() where email is not null;")" "true"
purger_anonymes
verifie "appel refusé à anon" "$(rpc "" lister_comptes_permanents)" "401"
verifie "appel refusé à authenticated (admin connecté)" "$(rpc "$TA" lister_comptes_permanents)" "403"

echo "== effectifs_grimpeurs (spec #19 R9/R10) =="
verifie "somme des effectifs = nombre de grimpeurs" \
  "$(sql "select coalesce(sum(nombre), 0) from interclub.effectifs_grimpeurs();")" \
  "$(sql "select count(*) from interclub.grimpeur;")"
verifie "une ligne par club et année de naissance" \
  "$(sql "select count(*) from interclub.effectifs_grimpeurs();")" \
  "$(sql "select count(*) from (select distinct club_id, annee_naissance from interclub.grimpeur) d;")"
verifie "appel refusé à anon" "$(rpc "" effectifs_grimpeurs)" "401"
verifie "appel refusé à authenticated (admin connecté)" "$(rpc "$TA" effectifs_grimpeurs)" "403"

echo "== Migrations rejouées, retour arrière, réapplication =="
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
for m in 202611101000_rpc_lister_comptes_permanents:lister_comptes_permanents \
         202611101100_rpc_effectifs_grimpeurs:effectifs_grimpeurs; do
  version=${m%%:*}
  fonction=${m##*:}
  migration="supabase/migrations/$version.sql"
  retour="supabase/retours-arriere/${version}_retour_arriere.sql"
  controles() {
    sql "select (to_regprocedure('interclub.$fonction()') is not null)::text || '/' ||
                (select count(*) from interclub.version where version = '$version') || '/' ||
                has_function_privilege('authenticated', 'interclub.$fonction()', 'execute')::text || '/' ||
                has_function_privilege('service_role', 'interclub.$fonction()', 'execute')::text;"
  }
  if appliquer "$migration"; then ok "$version : rejeu sans erreur"; else ko "$version : rejeu en erreur"; fi
  verifie "$version : fonction, version et droits" "$(controles)" "true/1/false/true"
  if appliquer "$retour"; then ok "$version : retour arrière sans erreur"; else ko "$version : retour arrière en erreur"; fi
  verifie "$version : fonction et version retirées" \
    "$(sql "select (to_regprocedure('interclub.$fonction()') is null)::text || '/' ||
                   (select count(*) from interclub.version where version = '$version');")" "true/0"
  if appliquer "$migration"; then ok "$version : réapplication"; else ko "$version : réapplication en erreur"; fi
  verifie "$version : fonction, version et droits après réapplication" "$(controles)" "true/1/false/true"
done

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
