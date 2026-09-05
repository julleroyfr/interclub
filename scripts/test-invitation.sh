#!/usr/bin/env bash
#
# Tests automatisés de l'onboarding « invitation coach permanent » contre la
# stack Supabase LOCALE. Couvre les cas du cahier
# docs/tests/16-invitation-coach.cahier.md qui exigent un CONTOURNEMENT de
# l'écran (appel API direct) :
#   - CT-08 : gestion réservée à l'admin — coach / sans-rôle refusés (RLS, R29).
#   - CT-07 : au plus UNE invitation active par club (R28).
#   - CT-09 : fail-closed — la RPC refuse une invitation inexistante/révoquée
#             (R30, R33), aucun mapping créé.
#   - CT-06 : un e-mail déjà utilisé ne crée pas de doublon (R32).
#
# Rejouable : on révoque d'abord toute invitation active de Club A, puis on
# nettoie. Aucun compte n'est créé (CT-06 échoue volontairement).
#
# Pré-requis : `supabase start` puis `supabase db reset` (charge le seed
#              01-jeu-de-test.sql et la migration 202609051000). Docker + CLI.
# Usage      : bash scripts/test-invitation.sh   (ou : npm run test:invitation)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
CLUB_A="11111111-1111-1111-1111-111111111111"
NIL="00000000-0000-0000-0000-000000000000"
PASS=0
FAIL=0

ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

# Robuste aux deux formats de `supabase status` : texte (« anon key: … ») et
# JSON (« "ANON_KEY": "…" »). On isole la clé après le dernier « : ».
STATUS=$(supabase status 2>/dev/null)
KEY=$(printf '%s\n' "$STATUS" | grep -iE "anon.?key|publishable" | head -1 | sed 's/.*: *//' | tr -d '", ')
SRK=$(printf '%s\n' "$STATUS" | grep -iE "service_role" | head -1 | sed 's/.*: *//' | tr -d '", ')
if [ -z "$KEY" ] || [ -z "$SRK" ]; then
  echo "Stack locale introuvable. Démarre-la : supabase start && supabase db reset" >&2
  exit 2
fi

token() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//'
}
# insert_invitation <token> <club_id>  -> code HTTP (via RLS, authenticated)
insert_invitation() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/invitation_coach" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d "{\"club_id\":\"$2\"}"
}
# insert_invitation_valeur <token> <club_id>  -> valeur du jeton créé (représentation)
insert_invitation_valeur() {
  curl -s -X POST "$API/rest/v1/invitation_coach" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"club_id\":\"$2\"}" \
    | grep -o '"valeur":"[^"]*"' | sed 's/.*:"//;s/"$//'
}
# revoke_a <token>  -> révoque toute invitation active de Club A (reset)
revoke_a() {
  curl -s -o /dev/null -X PATCH \
    "$API/rest/v1/invitation_coach?club_id=eq.$CLUB_A&actif=eq.true" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d '{"actif":false}'
}
# rpc_finaliser <valeur> <utilisateur_id>  -> code HTTP (service_role)
rpc_finaliser() {
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$API/rest/v1/rpc/finaliser_inscription_coach" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d "{\"p_valeur\":\"$1\",\"p_utilisateur_id\":\"$2\"}"
}
# create_user_admin <email> <password>  -> code HTTP (Auth admin, service_role)
create_user_admin() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true}"
}

TA=$(token admin@test.local "$MDP")
TC=$(token coach@test.local "$MDP")
TS=$(token sansmapping@test.local "$MDP")
if [ -z "$TA" ] || [ -z "$TC" ] || [ -z "$TS" ]; then
  echo "Connexion des comptes de test impossible (seed chargé ? lance supabase db reset)" >&2
  exit 2
fi

echo "== CT-08 Gestion réservée à l'admin (RLS, R29) =="
revoke_a "$TA" >/dev/null # reset : aucune invitation active Club A

code=$(insert_invitation "$TC" "$CLUB_A")
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "coach → génération d'invitation refusée (HTTP $code)"
else
  ko "coach invitation HTTP $code (attendu 403)"
fi

code=$(insert_invitation "$TS" "$CLUB_A")
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "sansmapping → génération d'invitation refusée (HTTP $code)"
else
  ko "sansmapping invitation HTTP $code (attendu 403)"
fi

echo "== CT-07 Au plus une invitation active par club (R28) =="
c1=$(insert_invitation "$TA" "$CLUB_A")
c2=$(insert_invitation "$TA" "$CLUB_A")
if [ "$c1" = "201" ] && [ "$c2" = "409" ]; then
  ok "1re invitation créée (201), 2e refusée (409, unicité R28)"
else
  ko "codes inattendus : 1re=$c1 (attendu 201), 2e=$c2 (attendu 409)"
fi

echo "== CT-09 Fail-closed : RPC refuse invitation invalide (R30, R33) =="
code=$(rpc_finaliser "$NIL" "$NIL")
if [ "$code" != "200" ]; then
  ok "RPC sur invitation inexistante refusée (HTTP $code, aucun mapping)"
else
  ko "RPC inexistante HTTP $code (attendu ≠ 200)"
fi

# Invitation active puis révoquée → la RPC doit encore refuser (révoquée).
revoke_a "$TA" >/dev/null # libère l'unicité laissée par CT-07 avant de recréer
VAL=$(insert_invitation_valeur "$TA" "$CLUB_A")
revoke_a "$TA" >/dev/null
if [ -n "$VAL" ]; then
  code=$(rpc_finaliser "$VAL" "$NIL")
  if [ "$code" != "200" ]; then
    ok "RPC sur invitation révoquée refusée (HTTP $code, aucun mapping)"
  else
    ko "RPC révoquée HTTP $code (attendu ≠ 200)"
  fi
else
  ko "impossible de créer l'invitation de test (valeur vide)"
fi

echo "== CT-06 E-mail déjà utilisé : pas de doublon (R32) =="
code=$(create_user_admin "coach@test.local" "$MDP")
if [ "$code" != "200" ] && [ "$code" != "201" ]; then
  ok "création d'un compte sur e-mail existant refusée (HTTP $code)"
else
  ko "e-mail existant accepté HTTP $code (attendu ≠ 200/201) — DOUBLON !"
fi

revoke_a "$TA" >/dev/null # nettoyage : rejouable

echo
echo "Résultat : $PASS OK / $FAIL KO"
[ "$FAIL" = "0" ]
