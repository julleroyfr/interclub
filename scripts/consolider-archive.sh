#!/usr/bin/env bash
#
# Régénère `supabase/migrations/000000000000_base_archivee.sql` en concaténant,
# dans l'ordre, les migrations archivées de `supabase/migrations/archive/`.
#
# Pourquoi : une migration appliquée en recette ET en prod est déplacée dans
#   `archive/` (cf. docs/conventions/03-base-de-donnees-supabase.md §5.3). Or la
#   CLI Supabase ne lit que les `.sql` placés directement dans
#   `supabase/migrations/` : sans ce fichier consolidé, `supabase db reset`
#   produirait une base vide en local.
#
# Le fichier consolidé sert UNIQUEMENT à la stack locale. Il ne s'applique
# jamais en recette ni en prod (son contenu y est déjà installé). Son préfixe
# `000000000000` le place avant toute migration non archivée.
#
# Usage : npm run db:consolider    (après chaque archivage, puis npm run db:reset)

set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$RACINE/supabase/migrations/archive"
CIBLE="$RACINE/supabase/migrations/000000000000_base_archivee.sql"

shopt -s nullglob
fichiers=("$ARCHIVE"/[0-9]*_*.sql)
if [ ${#fichiers[@]} -eq 0 ]; then
  echo "✗ Aucune migration dans $ARCHIVE." >&2
  exit 1
fi

{
  echo "-- ============================================================================"
  echo "-- FICHIER GÉNÉRÉ par scripts/consolider-archive.sh — NE PAS MODIFIER."
  echo "-- Concaténation des ${#fichiers[@]} migrations de supabase/migrations/archive/,"
  echo "-- déjà appliquées en recette et en prod (cf. JOURNAL.md)."
  echo "-- Usage LOCAL uniquement (supabase db reset) : ne jamais l'appliquer en"
  echo "-- recette ni en prod."
  echo "-- ============================================================================"
  for f in "${fichiers[@]}"; do
    echo
    echo "-- ----------------------------------------------------------------------------"
    echo "-- archive/$(basename "$f")"
    echo "-- ----------------------------------------------------------------------------"
    cat "$f"
    echo
    # Une migration seule peut omettre le `;` final (toléré par la CLI) ; une
    # fois concaténée, sa dernière instruction se collerait à la suivante.
    derniere=$(grep -vE '^[[:space:]]*(--.*)?$' "$f" | tail -1 | sed 's/[[:space:]]*$//')
    case "$derniere" in
      *\;) ;;
      *) echo ";" ;;
    esac
  done
} > "$CIBLE"

echo "✓ $(basename "$CIBLE") régénéré (${#fichiers[@]} migrations archivées)."
