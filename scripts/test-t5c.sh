#!/usr/bin/env bash
#
# Tests automatisés de la tranche T5c (jetons QR) contre la stack Supabase
# LOCALE. Couvre les cas du cahier docs/tests/04-jetons-qr-t5c.cahier.md qui
# exigent un CONTOURNEMENT de l'écran (appel API direct) :
#   - CT-06 : un coach ne peut pas créer un jeton pour un AUTRE club (RLS, R16).
#   - CT-07 : un coach ne peut pas créer un jeton JUGE (RLS, R17).
#   - CT-09 : un compte sans rôle ne peut rien créer (RLS, R5).
#   - CT-08 : au plus UN jeton coach temporaire actif par (club, rencontre) (R19).
#
# CT-06/07/09 ne modifient rien (écritures refusées). CT-08 est rendu rejouable :
# on révoque d'abord tout jeton coach temp. actif de Club A, puis on nettoie.
#
# Pré-requis : `supabase start` puis `supabase db reset` (charge les seeds 01+02
#              et la migration 202607230900). Docker + CLI Supabase.
# Usage      : bash scripts/test-t5c.sh   (ou : npm run test:t5c)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
RENC="33333333-3333-3333-3333-333333333333" # rencontre de test (seed 02)
VOIE1="44444444-4444-4444-4444-444444444444" # voie 1
CLUB_A="11111111-1111-1111-1111-111111111111"
CLUB_B="22222222-2222-2222-2222-222222222222"
PASS=0
FAIL=0

ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

KEY=$(supabase status 2>/dev/null | grep -iE "anon key|publishable" | head -1 | sed 's/.*: *//' | tr -d '"')
if [ -z "$KEY" ]; then
  echo "Stack locale introuvable. Démarre-la : supabase start && supabase db reset" >&2
  exit 2
fi

token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//'
}
# insert_jeton <token> <json>  -> code HTTP
insert_jeton() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/jeton_qr" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d "$2"
}
# revoke_coach_a <token>  -> révoque tout jeton coach temp. actif de Club A (reset)
revoke_coach_a() {
  curl -s -o /dev/null -X PATCH \
    "$API/rest/v1/jeton_qr?nature=eq.coach_temporaire&club_id=eq.$CLUB_A&actif=eq.true" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d '{"actif":false}'
}

TA=$(token admin@test.local "$MDP")
TC=$(token coach@test.local "$MDP")
TS=$(token sansmapping@test.local "$MDP")
if [ -z "$TA" ] || [ -z "$TC" ] || [ -z "$TS" ]; then
  echo "Connexion des comptes de test impossible (seed chargé ? lance supabase db reset)" >&2
  exit 2
fi

echo "== Négatifs RLS (contournement de l'écran) =="

# CT-06 — coach ne peut pas créer un jeton coach temp. pour un AUTRE club (R16)
code=$(insert_jeton "$TC" "{\"rencontre_id\":\"$RENC\",\"nature\":\"coach_temporaire\",\"club_id\":\"$CLUB_B\"}")
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "CT-06 coach → jeton d'un autre club refusé (HTTP $code)"
else
  ko "CT-06 coach autre club HTTP $code (attendu 403)"
fi

# CT-07 — coach ne peut pas créer un jeton JUGE (R17)
code=$(insert_jeton "$TC" "{\"rencontre_id\":\"$RENC\",\"nature\":\"juge\",\"voie_vitesse_id\":\"$VOIE1\"}")
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "CT-07 coach → jeton juge refusé (HTTP $code)"
else
  ko "CT-07 coach juge HTTP $code (attendu 403)"
fi

# CT-09 — compte sans rôle : aucune écriture (R5 fail-closed)
code=$(insert_jeton "$TS" "{\"rencontre_id\":\"$RENC\",\"nature\":\"coach_temporaire\",\"club_id\":\"$CLUB_A\"}")
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "CT-09 sansmapping → jeton refusé (HTTP $code)"
else
  ko "CT-09 sansmapping HTTP $code (attendu 403)"
fi

echo "== Unicité R19 (au plus un coach temp. actif par club/rencontre) =="
revoke_coach_a "$TA" >/dev/null # reset : aucun jeton coach A actif
c1=$(insert_jeton "$TA" "{\"rencontre_id\":\"$RENC\",\"nature\":\"coach_temporaire\",\"club_id\":\"$CLUB_A\"}")
c2=$(insert_jeton "$TA" "{\"rencontre_id\":\"$RENC\",\"nature\":\"coach_temporaire\",\"club_id\":\"$CLUB_A\"}")
if [ "$c1" = "201" ] && [ "$c2" = "409" ]; then
  ok "CT-08 1er jeton créé (201), 2e refusé (409, unicité R19)"
else
  ko "CT-08 codes inattendus : 1er=$c1 (attendu 201), 2e=$c2 (attendu 409)"
fi
revoke_coach_a "$TA" >/dev/null # nettoyage : rejouable

echo
echo "Résultat : $PASS OK / $FAIL KO"
[ "$FAIL" = "0" ]
