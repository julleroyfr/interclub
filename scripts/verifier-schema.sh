#!/usr/bin/env bash
#
# Contrôles de cohérence du schéma `interclub` sur la stack Supabase LOCALE,
# après `supabase db reset` (enchaîné par `npm run db:reset`). Vérifie le
# RÉSULTAT des migrations, pas seulement qu'elles s'appliquent sans erreur
# (convention 03 §5.2).
#
# Contrôle 1 — pas de fonction surchargée : un `create or replace function`
#   avec une signature modifiée crée une 2ᵉ fonction au lieu de remplacer la
#   première ; PostgREST renvoie alors PGRST203 (« Could not choose the best
#   candidate function ») dès qu'un appel omet un paramètre à défaut.
#   Incident du 2026-10-03 (`rechercher_grimpeurs`, migration 202609251300).
#
# Contrôle 2 — fonctions fermées par défaut (cf. plus bas).
#
# Pré-requis : `supabase start`. Conteneur surchargeable via
#              SUPABASE_DB_CONTAINER (défaut : supabase_db_interclub).
#
# Usage : npm run db:verifier    (code de sortie ≠ 0 si un contrôle échoue)

set -euo pipefail

CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"

sql() {
  docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"
}

echec=0

surcharges=$(sql "
  select p.proname || ' : ' || string_agg(pg_get_function_identity_arguments(p.oid), '  |  ')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'interclub'
  group by p.proname
  having count(*) > 1
  order by p.proname;
")

if [ -n "$surcharges" ]; then
  echo "✗ Fonction(s) surchargée(s) dans le schéma interclub (risque PGRST203) :"
  echo "$surcharges" | sed 's/^/    /'
  echo "  → supprimer l'ancienne signature (drop function if exists …) dans une migration."
  echo "    Cf. docs/conventions/03-base-de-donnees-supabase.md §5.2."
  echec=1
else
  echo "✓ Aucune fonction surchargée dans le schéma interclub."
fi

# Contrôle 2 — aucune fonction ouverte à PUBLIC, et `anon` n'exécute que la
#   liste blanche des RPC des sessions QR. Sans `revoke`, Postgres accorde
#   EXECUTE à PUBLIC sur toute fonction : une RPC SECURITY DEFINER devient
#   appelable avec la seule clé anon publique. Revue du 2026-10-03 (C1/M1),
#   migration 202610031100.
ANON_AUTORISEES="'ouvrir_session_qr','contexte_coach_temporaire','contexte_juge','liste_grimpeurs_vitesse'"

ouvertes=$(sql "
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'interclub'
    and (p.proacl is null
         or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
         or (has_function_privilege('anon', p.oid, 'execute')
             and p.proname not in ($ANON_AUTORISEES)))
  order by 1;
")

if [ -n "$ouvertes" ]; then
  echo "✗ Fonction(s) exécutable(s) par PUBLIC ou anon hors liste blanche :"
  echo "$ouvertes" | sed 's/^/    /'
  echo "  → revoke execute … from public, puis grant explicite au(x) rôle(s) requis."
  echo "    Cf. docs/conventions/03-base-de-donnees-supabase.md §5.2."
  echec=1
else
  echo "✓ Aucune fonction interclub ouverte à PUBLIC ; anon limité aux RPC QR."
fi

exit "$echec"
