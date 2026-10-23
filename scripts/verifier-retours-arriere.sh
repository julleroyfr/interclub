#!/usr/bin/env bash
#
# Vérifie, sur la stack Supabase LOCALE, que chaque migration de la liste et son
# script de retour arrière (supabase/retours-arriere/) sont réversibles (spec #20
# R34/R35, convention supabase/retours-arriere/README.md) :
#   1. base sans les migrations de la liste (référence) ;
#   2. pour chaque préfixe de la liste : db reset avec ce préfixe, puis retours
#      arrière dans l'ordre inverse — chaque état atteint doit être IDENTIQUE à
#      l'état de référence correspondant ;
#   3. rejeu de toutes les migrations deux fois (idempotence) puis db reset final.
# Comparaison par `cmp` d'une empreinte du schéma (scripts/empreinte-schema.sql),
# insensible aux fins de ligne dans les corps de fonction.
#
# Usage : bash scripts/verifier-retours-arriere.sh <version> [<version> …]
#         (versions dans l'ordre d'application, ex. 202610231000_categorie_adulte)
#         ou : npm run db:verifier-retours -- <versions…>
# ⚠️ Fait plusieurs `supabase db reset` : la base locale est réinitialisée.

set -u
cd "$(dirname "$0")/.."
[ $# -ge 1 ] || { echo "Usage : $0 <version> [<version> …]" >&2; exit 2; }

M=supabase/migrations
R=supabase/retours-arriere
T=$(mktemp -d)
VERSIONS=("$@")
ECHECS=0

for v in "${VERSIONS[@]}"; do
  [ -f "$M/$v.sql" ] || { echo "Migration introuvable : $M/$v.sql" >&2; exit 2; }
  [ -f "$R/${v}_retour_arriere.sql" ] || { echo "Retour arrière introuvable : $R/${v}_retour_arriere.sql" >&2; exit 2; }
done

remettre() { for v in "${VERSIONS[@]}"; do [ -f "$T/$v.sql" ] && mv "$T/$v.sql" "$M/"; done; }
trap remettre EXIT

empreinte() { docker exec -i supabase_db_interclub psql -U postgres -At -F'|' < scripts/empreinte-schema.sql > "$T/$1.txt"; }
appliquer() { docker exec -i supabase_db_interclub psql -U postgres -v ON_ERROR_STOP=1 -q < "$1" > /dev/null 2>"$T/err.txt" || { echo "❌ Échec : $1"; cat "$T/err.txt"; exit 1; }; }
reinit() { npx supabase db reset > "$T/reset.log" 2>&1 || { echo "❌ db reset en échec"; tail -20 "$T/reset.log"; exit 1; }; }
comparer() {
  if cmp -s "$T/$1.txt" "$T/$2.txt"; then echo "✓ $3"
  else echo "❌ $3"; diff "$T/$1.txt" "$T/$2.txt" | head -20; ECHECS=$((ECHECS + 1)); fi
}

# 1. Référence : aucune migration de la liste.
for v in "${VERSIONS[@]}"; do mv "$M/$v.sql" "$T/"; done
reinit; empreinte etat0

# 2. Préfixes successifs, puis retours arrière en ordre inverse.
n=${#VERSIONS[@]}
for ((i = 0; i < n; i++)); do
  mv "$T/${VERSIONS[$i]}.sql" "$M/"
  reinit; empreinte "etat$((i + 1))"
  for ((j = i; j >= 0; j--)); do
    appliquer "$R/${VERSIONS[$j]}_retour_arriere.sql"
    empreinte "retour_${i}_${j}"
    comparer "etat$j" "retour_${i}_${j}" "retour arrière de ${VERSIONS[$j]} (après ${VERSIONS[$i]}) = état antérieur"
  done
done

# 3. Rejeu x2 (idempotence) puis base finale reconstruite.
for passe in 1 2; do for v in "${VERSIONS[@]}"; do appliquer "$M/$v.sql"; done; done
empreinte rejeu; comparer "etat$n" rejeu "rejeu des migrations (2 passes) = état migré"
reinit; empreinte final; comparer "etat$n" final "db reset final = état migré"

rm -rf "$T"
if [ "$ECHECS" -eq 0 ]; then echo "✅ Retours arrière vérifiés."; exit 0; fi
echo "❌ $ECHECS vérification(s) en échec." >&2; exit 1
