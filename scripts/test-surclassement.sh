#!/usr/bin/env bash
#
# Tests automatisés du surclassement (spec #21) contre la stack Supabase LOCALE.
# Couvre les cas du cahier docs/tests/34-surclassement.cahier.md qui portent
# sur la table `surclassement` et la RPC `revoquer_surclassement` :
#   - CT-10 : écriture réservée à l'admin (RLS), coach et anon refusés (R1).
#   - CT-11 : au plus un surclassement actif par grimpeur et saison (R4).
#   - CT-12 : lecture par le coach du club du grimpeur, pas par un autre (RLS).
#   - CT-13 : révocation : retrait des rencontres ado de la saison en ①/②,
#             compositions ET prêts (R12) ; rien en ③/⑤, ni en enfant, ni sur
#             une autre saison (R13) ; nombre de rencontres renvoyé (R15).
#   - CT-14 : historique et nouvel accord après révocation (R11).
#   - CT-15 : grimpeur éligible ado par l'âge (p_retirer = faux) : aucun retrait.
#   - CT-16 : rejeu de la migration, contrôles du cahier (version, index, droit
#             anon), retour arrière puis réapplication.
#
# Rejouable : club, grimpeurs et rencontres dédiés supprimés (cascade) puis
# recréés à chaque exécution.
#
# Pré-requis : `supabase start` puis `supabase db reset`. Docker + CLI.
# Usage      : bash scripts/test-surclassement.sh   (ou : npm run test:surclassement)

set -uo pipefail

API="http://127.0.0.1:54321"
MDP="interclub"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"
CLUB_A="11111111-1111-1111-1111-111111111111"
CLUB_T="21212121-2121-2121-2121-212121212121"
G1="21000000-0000-0000-0000-0000000000a1" # club A, né en 2015
G2="21000000-0000-0000-0000-0000000000a2" # club T, né en 2015, prêté au club A
G3="21000000-0000-0000-0000-0000000000a3" # club T, né en 2015, sans prêt
R_PRE="21000000-0000-0000-0000-000000000001"   # ado 2026-12-05, ①
R_PREP="21000000-0000-0000-0000-000000000002"  # ado 2026-12-12, ②
R_COMP="21000000-0000-0000-0000-000000000003"  # ado 2026-11-21, ③
R_PUB="21000000-0000-0000-0000-000000000004"   # ado 2026-10-10, ⑤
R_SUIV="21000000-0000-0000-0000-000000000005"  # ado 2027-10-02 (saison 2027), ①
R_ENF="21000000-0000-0000-0000-000000000006"   # enfant 2026-12-05, ①
R_PRET="21000000-0000-0000-0000-000000000007"  # ado 2027-03-06 (saison 2026), ①, prêt
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
# inserer <bearer> <grimpeur> <saison> -> code HTTP
inserer() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/surclassement" \
    -H "apikey: $KEY" ${1:+-H "Authorization: Bearer $1"} \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"grimpeur_id\":\"$2\",\"saison\":$3}"
}
# lire <bearer> <grimpeur> -> nombre de lignes visibles
lire() {
  curl -s "$API/rest/v1/surclassement?select=id&grimpeur_id=eq.$2" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" -H "Accept-Profile: interclub" \
    | grep -o '"id"' | wc -l | tr -d ' '
}
# revoquer <bearer> <grimpeur> <saison> <retirer> -> corps de la réponse
revoquer() {
  curl -s -X POST "$API/rest/v1/rpc/revoquer_surclassement" \
    -H "apikey: $KEY" -H "Authorization: Bearer $1" \
    -H "Content-Profile: interclub" -H "Content-Type: application/json" \
    -d "{\"p_grimpeur\":\"$2\",\"p_saison\":$3,\"p_retirer\":$4}"
}

TA=$(token admin@test.local "$MDP")
TC=$(token coach@test.local "$MDP")
if [ -z "$TA" ] || [ -z "$TC" ]; then
  echo "Connexion des comptes de test impossible (seed chargé ? lance supabase db reset)" >&2
  exit 2
fi

# --- Jeu de données dédié ---------------------------------------------------
RENCONTRES="'$R_PRE','$R_PREP','$R_COMP','$R_PUB','$R_SUIV','$R_ENF','$R_PRET'"
sql "delete from interclub.rencontre where id in ($RENCONTRES);" >/dev/null
sql "delete from interclub.grimpeur where id in ('$G1','$G2','$G3');" >/dev/null
sql "delete from interclub.club where id = '$CLUB_T';" >/dev/null
sql "insert into interclub.club (id, nom) values ('$CLUB_T', 'Club test surclassement');" >/dev/null
sql "insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence) values
     ('$G1', '$CLUB_A', 'Surclasse', 'Tom', 2015, 'H', 921001),
     ('$G2', '$CLUB_T', 'Surclasse', 'Lea', 2015, 'F', 921002),
     ('$G3', '$CLUB_T', 'Surclasse', 'Zoe', 2015, 'F', 921003);" >/dev/null
# Rencontres créées en ①, composées, puis amenées à leur phase.
sql "insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
     ('$R_PRE',  '2026-12-05', '$CLUB_A', 'ado',    'pre_competition'),
     ('$R_PREP', '2026-12-12', '$CLUB_A', 'ado',    'pre_competition'),
     ('$R_COMP', '2026-11-21', '$CLUB_A', 'ado',    'pre_competition'),
     ('$R_PUB',  '2026-10-10', '$CLUB_A', 'ado',    'pre_competition'),
     ('$R_SUIV', '2027-10-02', '$CLUB_A', 'ado',    'pre_competition'),
     ('$R_ENF',  '2026-12-05', '$CLUB_A', 'enfant', 'pre_competition'),
     ('$R_PRET', '2027-03-06', '$CLUB_A', 'ado',    'pre_competition');" >/dev/null
for r in $R_PRE $R_PREP $R_COMP $R_PUB $R_SUIV $R_ENF; do
  sql "with e as (insert into interclub.equipe (rencontre_id, club_id, nom)
                  values ('$r', '$CLUB_A', 'Test surclassement') returning id)
       insert into interclub.composition (equipe_id, grimpeur_id) select id, '$G1' from e;" >/dev/null
done
sql "insert into interclub.pret (rencontre_id, grimpeur_id, club_accueil_id) values ('$R_PRET', '$G2', '$CLUB_A');" >/dev/null
sql "update interclub.rencontre set phase = 'preparation' where id = '$R_PREP';
     update interclub.rencontre set phase = 'competition' where id = '$R_COMP';
     update interclub.rencontre set phase = 'resultats_publics' where id = '$R_PUB';" >/dev/null

echo "== CT-10 Écriture réservée à l'admin (R1) =="
code=$(inserer "$TC" "$G1" 2026)
case "$code" in 401|403) ok "coach → refusé (HTTP $code)" ;; *) ko "coach HTTP $code (attendu 401/403)" ;; esac
code=$(inserer "" "$G1" 2026)
case "$code" in 401|403) ok "anon → refusé (HTTP $code)" ;; *) ko "anon HTTP $code (attendu 401/403)" ;; esac
r=$(revoquer "$TC" "$G1" 2026 true)
case "$r" in *acces_refuse*) ok "coach → RPC acces_refuse" ;; *) ko "coach RPC : $r" ;; esac
verifie "aucun surclassement écrit" "$(sql "select count(*) from interclub.surclassement where grimpeur_id = '$G1';")" "0"
verifie "admin → créé (G1, 2026)" "$(inserer "$TA" "$G1" 2026)" "201"
verifie "admin → créé (G2, 2026)" "$(inserer "$TA" "$G2" 2026)" "201"
verifie "admin → créé (G3, 2026)" "$(inserer "$TA" "$G3" 2026)" "201"

echo "== CT-11 Un seul surclassement actif par saison (R4) =="
verifie "second accord 2026 → conflit" "$(inserer "$TA" "$G1" 2026)" "409"
verifie "accord 2027 (autre saison) → créé" "$(inserer "$TA" "$G1" 2027)" "201"

echo "== CT-12 Lecture (RLS) =="
verifie "coach du club voit les surclassements de G1" "$(lire "$TC" "$G1")" "2"
verifie "coach voit un grimpeur prêté à son club (G2)" "$(lire "$TC" "$G2")" "1"
verifie "coach ne voit pas un grimpeur d'un autre club (G3)" "$(lire "$TC" "$G3")" "0"
verifie "admin voit G3" "$(lire "$TA" "$G3")" "1"

echo "== CT-13 Révocation : retraits en ①/② seulement (R12, R13, R15) =="
verifie "G1 : 2 rencontres quittées" "$(revoquer "$TA" "$G1" 2026 true)" "2"
compo() { sql "select count(*) from interclub.composition where rencontre_id = '$1' and grimpeur_id = '$G1';"; }
verifie "retiré de la rencontre ado ①" "$(compo "$R_PRE")" "0"
verifie "retiré de la rencontre ado ②" "$(compo "$R_PREP")" "0"
verifie "conservé en ③ compétition" "$(compo "$R_COMP")" "1"
verifie "conservé en ⑤ résultats publics" "$(compo "$R_PUB")" "1"
verifie "conservé sur une autre saison" "$(compo "$R_SUIV")" "1"
verifie "conservé en enfant" "$(compo "$R_ENF")" "1"
verifie "surclassement 2026 révoqué" \
  "$(sql "select count(*) from interclub.surclassement where grimpeur_id = '$G1' and saison = 2026 and revoque_le is not null;")" "1"
verifie "surclassement 2027 toujours actif" \
  "$(sql "select count(*) from interclub.surclassement where grimpeur_id = '$G1' and saison = 2027 and revoque_le is null;")" "1"
verifie "G2 : prêt supprimé, 1 rencontre quittée" "$(revoquer "$TA" "$G2" 2026 true)" "1"
verifie "prêt de G2 supprimé" "$(sql "select count(*) from interclub.pret where rencontre_id = '$R_PRET';")" "0"
r=$(revoquer "$TA" "$G1" 2026 true)
case "$r" in *surclassement_introuvable*) ok "seconde révocation → surclassement_introuvable" ;; *) ko "seconde révocation : $r" ;; esac

echo "== CT-14 Historique et nouvel accord (R11) =="
verifie "nouvel accord 2026 → créé" "$(inserer "$TA" "$G1" 2026)" "201"
verifie "historique 2026 : 2 lignes" "$(sql "select count(*) from interclub.surclassement where grimpeur_id = '$G1' and saison = 2026;")" "2"
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  "$API/rest/v1/surclassement?grimpeur_id=eq.$G1&saison=eq.2026" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TA" -H "Content-Profile: interclub" \
  -H "Content-Type: application/json" -d '{"saison":2030}')
case "$code" in 401|403) ok "saison non modifiable (HTTP $code)" ;; *) ko "modification de saison HTTP $code" ;; esac

echo "== CT-15 Éligible ado par l'âge : aucun retrait (R12) =="
sql "with e as (select id from interclub.equipe where rencontre_id = '$R_PRE')
     insert into interclub.composition (equipe_id, grimpeur_id) select id, '$G1' from e;" >/dev/null
verifie "p_retirer = faux → 0 rencontre quittée" "$(revoquer "$TA" "$G1" 2026 false)" "0"
verifie "composition ① conservée" "$(compo "$R_PRE")" "1"

# --- Nettoyage ---------------------------------------------------------------
sql "delete from interclub.rencontre where id in ($RENCONTRES);" >/dev/null
sql "delete from interclub.grimpeur where id in ('$G1','$G2','$G3');" >/dev/null
sql "delete from interclub.club where id = '$CLUB_T';" >/dev/null

echo "== CT-16 Migration rejouée, contrôles et retour arrière =="
MIGRATION="supabase/migrations/202611071100_surclassement.sql"
RETOUR="supabase/retours-arriere/202611071100_surclassement_retour_arriere.sql"
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
controles() {
  sql "select count(*) from interclub.version where version = '202611071100_surclassement';"
  sql "select string_agg(indexname, ',' order by indexname) from pg_indexes
       where schemaname = 'interclub' and tablename = 'surclassement' and indexname <> 'surclassement_pkey';"
  sql "select has_function_privilege('anon', 'interclub.revoquer_surclassement(uuid, int, boolean)', 'execute');"
}
ATTENDU=$'1\nidx_surclassement_grimpeur_id,uq_surclassement_actif\nf'
if appliquer "$MIGRATION"; then ok "rejeu de la migration sans erreur"; else ko "rejeu de la migration en erreur"; fi
verifie "version, index et droit anon après rejeu" "$(controles)" "$ATTENDU"
if appliquer "$RETOUR"; then ok "retour arrière sans erreur"; else ko "retour arrière en erreur"; fi
verifie "retour arrière : table, fonction et version retirées" \
  "$(sql "select (to_regclass('interclub.surclassement') is null)::text || '/' ||
                 (to_regprocedure('interclub.revoquer_surclassement(uuid, int, boolean)') is null)::text || '/' ||
                 (select count(*) from interclub.version where version = '202611071100_surclassement');")" \
  "true/true/0"
if appliquer "$MIGRATION"; then ok "réapplication après retour arrière"; else ko "réapplication en erreur"; fi
verifie "version, index et droit anon après réapplication" "$(controles)" "$ATTENDU"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
