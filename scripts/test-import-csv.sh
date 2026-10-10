#!/usr/bin/env bash
#
# Tests automatisés de l'import CSV sans licence (spec #18) contre la stack
# Supabase LOCALE. Couvre les cas du cahier
# docs/tests/31-import-csv-sans-licence.cahier.md qui portent sur la RPC
# `importer_grimpeurs_csv` et la colonne dérivée `licence_generee` :
#   - CT-09 : RPC réservée à l'admin — coach refusé, anon sans EXECUTE (R1).
#   - CT-04 : création avec licences générées distinctes, à partir de 2e9 (R14).
#   - CT-05 : ré-import → grimpeurs reconnus, aucune nouvelle licence (R13).
#   - CT-06 : forme comparable SQL ≡ TS (tirets, apostrophes, accents) (R9).
#   - CT-07 : rapprochement limité au club cible ; ambiguïté signalée (R13).
#   - CT-08 : licence_generee dérivée (vraie licence → false) (R15).
#   - CT-10 : club inexistant → refus sans écriture (R16).
#
# Rejouable : un club dédié « Club test import CSV » est supprimé (cascade) puis
# recréé à chaque exécution.
#
# Pré-requis : `supabase start` puis `supabase db reset` (seed 01-jeu-de-test.sql
#              + migration 202610101000). Docker + CLI.
# Usage      : bash scripts/test-import-csv.sh   (ou : npm run test:import-csv)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"
CLUB_A="11111111-1111-1111-1111-111111111111"
CLUB_T="18181818-1818-1818-1818-181818181818"
NIL="00000000-0000-0000-0000-000000000000"
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
# rpc <bearer> <club_id> <json grimpeurs>  -> corps de la réponse. Le corps passe
# par stdin : sous Windows, un argument non ASCII (« ’ ») arrive corrompu à curl.
rpc() {
  printf '{"p_club_id":"%s","p_grimpeurs":%s}' "$2" "$3" \
    | curl -s -X POST "$API/rest/v1/rpc/importer_grimpeurs_csv" \
      -H "apikey: $KEY" -H "Authorization: Bearer $1" \
      -H "Content-Profile: interclub" -H "Content-Type: application/json; charset=utf-8" \
      --data-binary @-
}
champ() { printf '%s' "$1" | grep -o "\"$2\": *[0-9]*" | sed 's/.*: *//'; }

TA=$(token admin@test.local "$MDP")
TC=$(token coach@test.local "$MDP")
if [ -z "$TA" ] || [ -z "$TC" ]; then
  echo "Connexion des comptes de test impossible (seed chargé ? lance supabase db reset)" >&2
  exit 2
fi

# Club dédié, vidé à chaque exécution (cascade sur ses grimpeurs).
sql "delete from interclub.club where id = '$CLUB_T';" >/dev/null
sql "insert into interclub.club (id, nom) values ('$CLUB_T', 'Club test import CSV');" >/dev/null
MAX_AVANT=$(sql "select coalesce(max(licence), 1999999999) from interclub.grimpeur where licence >= 2000000000;")

LOT='[{"ligne":2,"nom":"ROBIN-BROSSE","prenom":"CELESTE","sexe":"F","annee_naissance":2021},
      {"ligne":3,"nom":"L’HOSTIS","prenom":"GABIN","sexe":"H","annee_naissance":2021}]'

echo "== CT-09 RPC réservée à l'admin (R1) =="
r=$(rpc "$TC" "$CLUB_T" "$LOT")
case "$r" in *acces_refuse*) ok "coach → acces_refuse" ;; *) ko "coach : $r" ;; esac
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/rpc/importer_grimpeurs_csv" \
  -H "apikey: $KEY" -H "Content-Profile: interclub" -H "Content-Type: application/json" \
  -d "{\"p_club_id\":\"$CLUB_T\",\"p_grimpeurs\":[]}")
if [ "$code" = "401" ] || [ "$code" = "403" ] || [ "$code" = "404" ]; then
  ok "anon → refusé (HTTP $code)"
else
  ko "anon HTTP $code (attendu 401/403/404)"
fi
verifie "aucun grimpeur écrit après les refus" "$(sql "select count(*) from interclub.grimpeur where club_id = '$CLUB_T';")" "0"

echo "== CT-04 Création avec licences générées (R14) =="
r=$(rpc "$TA" "$CLUB_T" "$LOT")
verifie "2 créés" "$(champ "$r" crees)" "2"
verifie "licences = max précédent + 1, + 2" \
  "$(sql "select string_agg(licence::text, ',' order by licence) from interclub.grimpeur where club_id = '$CLUB_T';")" \
  "$((MAX_AVANT + 1)),$((MAX_AVANT + 2))"
verifie "licence_generee vraie" "$(sql "select bool_and(licence_generee) from interclub.grimpeur where club_id = '$CLUB_T';")" "t"

echo "== CT-05 / CT-06 Ré-import, forme comparable (R9, R13) =="
VARIANTE='[{"ligne":2,"nom":"Robin Brosse","prenom":"Céleste","sexe":"F","annee_naissance":2021},
           {"ligne":3,"nom":"L'"'"'Hostis","prenom":"Gabin","sexe":"H","annee_naissance":2021}]'
r=$(rpc "$TA" "$CLUB_T" "$VARIANTE")
verifie "0 créé" "$(champ "$r" crees)" "0"
verifie "2 déjà présents" "$(champ "$r" deja_presents)" "2"
verifie "toujours 2 grimpeurs" "$(sql "select count(*) from interclub.grimpeur where club_id = '$CLUB_T';")" "2"
verifie "libellés conservés (pas de mise à jour)" \
  "$(sql "select nom from interclub.grimpeur where club_id = '$CLUB_T' and sexe = 'F';")" "ROBIN-BROSSE"
r=$(rpc "$TA" "$CLUB_T" '[{"ligne":2,"nom":"ROBIN-BROSSE","prenom":"CELESTE","sexe":"F","annee_naissance":2020}]')
verifie "année différente → autre grimpeur, créé" "$(champ "$r" crees)" "1"

echo "== CT-07 Club cible seul ; ambiguïté (R13) =="
r=$(rpc "$TA" "$CLUB_A" "$LOT")
verifie "même identité dans un autre club → créée dans ce club" "$(champ "$r" crees)" "2"
sql "delete from interclub.grimpeur where club_id = '$CLUB_A' and licence_generee;" >/dev/null
sql "insert into interclub.grimpeur (club_id, nom, prenom, annee_naissance, sexe, licence)
     values ('$CLUB_T', 'Robin Brosse', 'Celeste', 2021, 'F', 987654);" >/dev/null
r=$(rpc "$TA" "$CLUB_T" "$LOT")
verifie "ambiguïté : 0 créé" "$(champ "$r" crees)" "0"
verifie "ambiguïté : 1 déjà présent (L’Hostis)" "$(champ "$r" deja_presents)" "1"
AMBIGUS=$(printf '%s' "$r" | grep -o '"ambigus": *\[[^]]*\]')
case "$AMBIGUS" in
  *'"ligne": 2'*) case "$AMBIGUS" in
    *'"nb": 2'*) ok "ligne 2 signalée ambiguë (2 correspondances)" ;;
    *) ko "ambigus : $r" ;;
  esac ;;
  *) ko "ambigus : $r" ;;
esac

echo "== CT-08 licence_generee dérivée (R15) =="
sql "update interclub.grimpeur set licence = 123123 where club_id = '$CLUB_T' and nom = 'L’HOSTIS';" >/dev/null
verifie "vraie licence → licence_generee = false" \
  "$(sql "select licence_generee from interclub.grimpeur where club_id = '$CLUB_T' and nom = 'L’HOSTIS';")" "f"
r=$(rpc "$TA" "$CLUB_T" '[{"ligne":3,"nom":"L HOSTIS","prenom":"GABIN","sexe":"H","annee_naissance":2021}]')
verifie "grimpeur à vraie licence toujours reconnu" "$(champ "$r" deja_presents)" "1"

echo "== CT-10 Club inexistant (R16) =="
r=$(rpc "$TA" "$NIL" "$LOT")
case "$r" in *club_introuvable*) ok "club inexistant → club_introuvable" ;; *) ko "club inexistant : $r" ;; esac

# Nettoyage.
sql "delete from interclub.club where id = '$CLUB_T';" >/dev/null

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
