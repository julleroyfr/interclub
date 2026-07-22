#!/usr/bin/env bash
#
# Tests automatisés de la tranche T5b (mapping de rôle) contre la stack Supabase
# LOCALE. Couvre les cas du cahier docs/tests/03-mapping-de-role-t5b.cahier.md qui
# exigent un CONTOURNEMENT de l'écran (appel API direct), donc non vérifiables au
# navigateur :
#   - CT-07  : un non-admin ne peut PAS écrire un mapping (RLS, spec #2 R4).
#   - CT-05  : la contrainte R3 (chk_compte_role_club) rejette un coach sans club
#              et un admin avec club, même en forçant l'écriture côté admin.
#
# Les cas UI (CT-01..CT-04, CT-06, CT-08 : affichage, sélection, 404 non-admin)
# restent à vérifier à la main dans l'app.
#
# Aucun de ces cas ne modifie l'état (toutes les écritures testées sont refusées).
#
# Pré-requis : `supabase start` puis `supabase db reset` (charge le seed, dont la
#              migration 202607221400). Docker + CLI Supabase.
# Usage      : bash scripts/test-t5b.sh   (ou : npm run test:t5b)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
# uuid bidon : pour CT-07, la RLS refuse AVANT toute vérif de FK/contrainte.
FAUX_UUID="55555555-5555-5555-5555-555555555555"
FAUX_CLUB="11111111-1111-1111-1111-111111111111"
PASS=0
FAIL=0

ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

# Docker n'est pas toujours dans le PATH du shell : on l'ajoute au besoin.
command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

# Clé anon/publishable de la stack locale.
KEY=$(supabase status 2>/dev/null | grep -iE "anon key|publishable" | head -1 | sed 's/.*: *//' | tr -d '"')
if [ -z "$KEY" ]; then
  echo "Stack locale introuvable. Démarre-la : supabase start && supabase db reset" >&2
  exit 2
fi

# token <email> <mdp>  -> access_token (vide si échec)
token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//'
}
# user_id <token>  -> id de l'utilisateur connecté (claim sub)
user_id() {
  curl -s "$API/auth/v1/user" -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"$//'
}
# insert_compte <token> <utilisateur_id> <role> <club_id|null>  -> code HTTP
insert_compte() {
  local club="$4" data
  if [ "$club" = "null" ]; then club="null"; else club="\"$club\""; fi
  data="{\"utilisateur_id\":\"$2\",\"role\":\"$3\",\"club_id\":$club}"
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/compte" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d "$data"
}

TA=$(token admin@test.local "$MDP")
TC=$(token coach@test.local "$MDP")
TS=$(token sansmapping@test.local "$MDP")
if [ -z "$TA" ] || [ -z "$TC" ] || [ -z "$TS" ]; then
  echo "Connexion des comptes de test impossible (seed chargé ? lance supabase db reset)" >&2
  exit 2
fi
SID=$(user_id "$TS") # id réel de sansmapping (sans mapping) : cible des inserts

echo "== CT-07 — un non-admin ne peut pas écrire un mapping (RLS, R4) =="
code=$(insert_compte "$TC" "$FAUX_UUID" coach "$FAUX_CLUB")
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "coach : insert refusé (HTTP $code)"
else
  ko "coach : insert HTTP $code (attendu 403)"
fi

code=$(insert_compte "$TS" "$FAUX_UUID" admin null)
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "sansmapping (aucun rôle) : insert refusé (HTTP $code) — R5 fail-closed"
else
  ko "sansmapping : insert HTTP $code (attendu 403)"
fi

echo "== CT-05 — contrainte R3 (chk_compte_role_club), même côté admin =="
# Admin passe la RLS : la contrainte doit alors rejeter les combinaisons invalides.
code=$(insert_compte "$TA" "$SID" coach null)
if [ "$code" = "400" ]; then
  ok "admin : coach SANS club refusé (HTTP 400, contrainte)"
else
  ko "admin : coach sans club HTTP $code (attendu 400)"
fi

code=$(insert_compte "$TA" "$SID" admin "$FAUX_CLUB")
if [ "$code" = "400" ]; then
  ok "admin : admin AVEC club refusé (HTTP 400, contrainte)"
else
  ko "admin : admin avec club HTTP $code (attendu 400)"
fi

echo
echo "Résultat : $PASS OK / $FAIL KO"
[ "$FAIL" = "0" ]
