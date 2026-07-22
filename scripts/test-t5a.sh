#!/usr/bin/env bash
#
# Tests automatisés de la tranche T5a (authentification permanente + RLS compte)
# contre la stack Supabase LOCALE. Couvre les cas du cahier
# docs/tests/02-authentification-t5a.cahier.md qui ne passent pas par le
# navigateur : connexions (CT-01..04 partie auth), CT-03, CT-04, CT-05..07.
#
# Les cas purement UI (affichage du rôle à l'écran, bouton déconnexion : CT-01,
# CT-02, CT-08) restent à vérifier à la main dans l'app.
#
# Pré-requis : `supabase start` puis `supabase db reset` (charge le seed
#              supabase/seed/01-utilisateurs-de-test.sql). Docker + CLI Supabase.
# Usage      : bash scripts/test-t5a.sh   (ou : npm run test:t5a)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
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

# login <email> <mdp>  -> corps JSON brut de /token
login() {
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
# token <email> <mdp>  -> access_token (vide si échec)
token() { login "$1" "$2" | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//'; }
# compte_get <token>   -> JSON des lignes interclub.compte visibles par ce user
compte_get() {
  curl -s "$API/rest/v1/compte?select=utilisateur_id,role,club_id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" -H "Accept-Profile: interclub"
}
# nb_lignes            -> compte les lignes d'un tableau JSON de comptes (stdin)
nb_lignes() { grep -o '"utilisateur_id"' | wc -l | tr -d ' '; }

echo "== Authentification =="
for u in admin coach sansmapping; do
  if [ -n "$(token "$u@test.local" "$MDP")" ]; then
    ok "connexion $u@test.local"
  else
    ko "connexion $u@test.local (seed chargé ? lance supabase db reset)"
  fi
done

# CT-03 — mauvais mot de passe refusé
if login admin@test.local mauvais-mot-de-passe | grep -qi 'error'; then
  ok "CT-03 mauvais mot de passe refusé"
else
  ko "CT-03 mauvais mot de passe : aucune erreur renvoyée"
fi

echo "== RLS interclub.compte =="
TC=$(token coach@test.local "$MDP")
TA=$(token admin@test.local "$MDP")
TS=$(token sansmapping@test.local "$MDP")

# CT-05 — un coach ne lit que sa ligne
n=$(compte_get "$TC" | nb_lignes)
if [ "$n" = "1" ]; then ok "CT-05 coach voit 1 ligne (la sienne)"; else ko "CT-05 coach voit $n ligne(s) (attendu 1)"; fi

# CT-06 — l'admin lit tous les comptes
n=$(compte_get "$TA" | nb_lignes)
if [ "$n" = "2" ]; then ok "CT-06 admin voit 2 lignes"; else ko "CT-06 admin voit $n ligne(s) (attendu 2)"; fi

# CT-04 — compte sans mapping : aucune ligne (rôle nul, R5)
n=$(compte_get "$TS" | nb_lignes)
if [ "$n" = "0" ]; then ok "CT-04 sansmapping voit 0 ligne (R5 fail-closed)"; else ko "CT-04 sansmapping voit $n ligne(s) (attendu 0)"; fi

# CT-07 — un coach ne peut pas créer un mapping (with check est_admin())
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/compte" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TC" \
  -H "Content-Profile: interclub" -H "Content-Type: application/json" \
  -d '{"utilisateur_id":"55555555-5555-5555-5555-555555555555","role":"coach","club_id":"11111111-1111-1111-1111-111111111111"}')
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  ok "CT-07 coach insert refusé (HTTP $code)"
else
  ko "CT-07 coach insert HTTP $code (attendu 403)"
fi

echo
echo "Résultat : $PASS OK / $FAIL KO"
[ "$FAIL" = "0" ]
