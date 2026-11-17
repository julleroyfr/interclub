#!/usr/bin/env bash
#
# Tests du trigger `resultat_voie_un_par_niveau_enfant` (migration
# 202611171200 ; spec #6 R9bis et R14, rév. 2026-11-17 ; spec #9 R7) : voies
# d'un grimpeur ENFANT garanties en base.
#
#   - VD-01 : coach, Top sur T2 Noire (variante d'un niveau doublé) : enregistré.
#   - VD-02 : coach, Top sur T2 Rouge : remplace T2 Noire (un résultat au niveau).
#   - VD-03 : saisie plus ancienne sur T2 Noire : refusée, T2 Rouge intact.
#   - VD-04 : correction de l'issue sur la même voie : permise, pas de doublon.
#   - VD-05 : voie hors des 3 niveaux du groupe : refusée.
#   - VD-06 : grimpeur sans groupe de départ : refusé.
#   - VD-07 : admin (écriture directe) sur T2 Noire : remplace T2 Rouge.
#   - VD-08 : ado : deux voies du même niveau restent permises (non concerné).
#   - VD-09 : clôture : NP sur la voie de plus petit ordre d'un niveau sans
#             résultat ; aucun NP sur un niveau qui a un résultat.
#   - VD-10 : droits (fonction du trigger non exécutable par anon).
#   - VD-11 : rejeu idempotent de la migration.
#
# VD-01 à VD-10 tournent dans une transaction annulée : la base locale est
# rendue dans son état.
#
# Pré-requis : `supabase start` (seed 01 chargé : club A, admin, coach).
# Usage      : bash scripts/test-voies-doublees.sh   (ou : npm run test:voies-doublees)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"
PASS=0
FAIL=0
ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
verifie() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 — obtenu « $2 », attendu « $3 »"; fi; }

ADMIN=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
COACH=cccccccc-cccc-cccc-cccc-cccccccccccc
P=d0d0d0d0-0000-0000

SQL=$(cat <<EOSQL
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as \$fn\$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
\$fn\$;

-- Saisie coach (fonction d'enregistrement) sous l'identité du coach : 'ok' ou
-- le message d'erreur (sous-transaction annulée en cas d'échec).
create or replace function pg_temp.saisir(p_voie uuid, p_grimpeur uuid, p_issue text, p_saisi_le timestamptz default null)
returns text language plpgsql as \$fn\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '$COACH', 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform interclub.saisir_resultat_voie(p_voie, p_grimpeur, p_issue, p_saisi_le);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end;
\$fn\$;

-- Écriture directe de l'admin (upsert, comme la saisie admin, spec #9).
create or replace function pg_temp.admin_ecrit(p_voie uuid, p_grimpeur uuid, p_issue text)
returns text language plpgsql as \$fn\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '$ADMIN', 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
  values (p_voie, p_grimpeur, p_issue)
  on conflict (voie_difficulte_id, grimpeur_id) do update set issue = excluded.issue;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end;
\$fn\$;

-- Voies d'un grimpeur : « libellé:issue » triés.
create or replace function pg_temp.voies(p_grimpeur uuid)
returns text language sql as \$fn\$
  select coalesce(string_agg(v.niveau || coalesce(v.repere, '') || ':' || r.issue, ',' order by v.ordre), '')
    from interclub.resultat_voie r
    join interclub.voie_difficulte v on v.id = r.voie_difficulte_id
   where r.grimpeur_id = p_grimpeur;
\$fn\$;

-- ---- Jeu d'essai --------------------------------------------------------
-- E : enfant, jour J, en ③ ; voies T2 Rouge (ordre 1), T2 Noire (ordre 2), T3,
--     T4, T5. Grimpeurs : gA (groupe T2), gB (sans groupe), gC (groupe T2,
--     rien saisi). A : ado ③, deux T5 ; gD.
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
  ('$P-0000-0000000000e0', current_date, '11111111-1111-1111-1111-111111111111', 'enfant', 'pre_competition'),
  ('$P-0000-0000000000a0', current_date, '11111111-1111-1111-1111-111111111111', 'ado',    'pre_competition');
insert into interclub.epreuve (id, rencontre_id, type, active) values
  ('$P-0000-0000000000e1', '$P-0000-0000000000e0', 'voie', true),
  ('$P-0000-0000000000a1', '$P-0000-0000000000a0', 'voie', true);
insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_prise_valorisee, repere) values
  ('$P-0001-000000000021', '$P-0000-0000000000e1', 'T2', 'tete', '5a', 1, 7, 4, 'Rouge'),
  ('$P-0001-000000000022', '$P-0000-0000000000e1', 'T2', 'tete', '5b', 2, 8, 4, 'Noire'),
  ('$P-0001-000000000003', '$P-0000-0000000000e1', 'T3', 'tete', '5b', 3, 9, 5, null),
  ('$P-0001-000000000004', '$P-0000-0000000000e1', 'T4', 'tete', '5c', 4, 10, 5, null),
  ('$P-0001-000000000005', '$P-0000-0000000000e1', 'T5', 'tete', '6a', 5, 11, 6, null);
insert into interclub.voie_difficulte (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_zone1, points_zone2, repere) values
  ('$P-0001-0000000000a1', '$P-0000-0000000000a1', 'T5', 'tete', '6a', 1, 11, 4, 8, 'Jaune'),
  ('$P-0001-0000000000a2', '$P-0000-0000000000a1', 'T5', 'tete', '6a', 2, 11, 4, 8, null);
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('$P-0003-0000000000e0', '$P-0000-0000000000e0', '11111111-1111-1111-1111-111111111111', 'Essai voies doublées'),
  ('$P-0003-0000000000a0', '$P-0000-0000000000a0', '11111111-1111-1111-1111-111111111111', 'Essai ado');
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select ('$P-0004-00000000000' || n)::uuid,
       '11111111-1111-1111-1111-111111111111', 'Doublees', code, annee, 'F', 960000 + n
  from (values ('gA', 2016, 1), ('gB', 2016, 2), ('gC', 2016, 3), ('gD', 2012, 4)) as t(code, annee, n);
insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart) values
  ('$P-0003-0000000000e0', '$P-0004-000000000001', 'T2'),
  ('$P-0003-0000000000e0', '$P-0004-000000000002', null),
  ('$P-0003-0000000000e0', '$P-0004-000000000003', 'T2'),
  ('$P-0003-0000000000a0', '$P-0004-000000000004', null);
update interclub.rencontre set phase = 'competition' where id::text like '$P-%';

-- ---- VD-01 : Top sur la variante ----------------------------------------
select pg_temp.verif('VD-01 Top sur T2 Noire', 'ok',
  pg_temp.saisir('$P-0001-000000000022', '$P-0004-000000000001', 'top'));
select pg_temp.verif('VD-01 résultat sur T2 Noire', 'T2Noire:top', pg_temp.voies('$P-0004-000000000001'));

-- ---- VD-02 : remplacement par l'autre voie du niveau ---------------------
select pg_temp.verif('VD-02 Top sur T2 Rouge', 'ok',
  pg_temp.saisir('$P-0001-000000000021', '$P-0004-000000000001', 'top'));
select pg_temp.verif('VD-02 un seul résultat au niveau T2, sur T2 Rouge', 'T2Rouge:top',
  pg_temp.voies('$P-0004-000000000001'));

-- ---- VD-03 : saisie plus ancienne refusée --------------------------------
select pg_temp.verif('VD-03 saisie plus ancienne sur T2 Noire refusée', 'saisie_plus_ancienne',
  pg_temp.saisir('$P-0001-000000000022', '$P-0004-000000000001', 'echec', now() - interval '1 hour'));
select pg_temp.verif('VD-03 T2 Rouge intact', 'T2Rouge:top', pg_temp.voies('$P-0004-000000000001'));

-- ---- VD-04 : correction sur la même voie ----------------------------------
select pg_temp.verif('VD-04 correction T2 Rouge → prise valorisée', 'ok',
  pg_temp.saisir('$P-0001-000000000021', '$P-0004-000000000001', 'prise_valorisee'));
select pg_temp.verif('VD-04 pas de doublon', 'T2Rouge:prise_valorisee', pg_temp.voies('$P-0004-000000000001'));

-- ---- VD-05 / VD-06 : hors groupe ------------------------------------------
select pg_temp.verif('VD-05 voie T5 hors groupe T2 refusée', 'voie_hors_groupe',
  pg_temp.saisir('$P-0001-000000000005', '$P-0004-000000000001', 'top'));
select pg_temp.verif('VD-05 T4 (3e niveau du groupe) permise', 'ok',
  pg_temp.saisir('$P-0001-000000000004', '$P-0004-000000000001', 'echec'));
select pg_temp.verif('VD-06 grimpeur sans groupe refusé', 'voie_hors_groupe',
  pg_temp.saisir('$P-0001-000000000003', '$P-0004-000000000002', 'top'));
select pg_temp.verif('VD-06 aucune ligne écrite', '', pg_temp.voies('$P-0004-000000000002'));

-- ---- VD-07 : admin, écriture directe --------------------------------------
select pg_temp.verif('VD-07 admin Top sur T2 Noire', 'ok',
  pg_temp.admin_ecrit('$P-0001-000000000022', '$P-0004-000000000001', 'top'));
select pg_temp.verif('VD-07 T2 Rouge remplacée', 'T2Noire:top,T4:echec', pg_temp.voies('$P-0004-000000000001'));
select pg_temp.verif('VD-07 admin, hors groupe refusé', 'voie_hors_groupe',
  pg_temp.admin_ecrit('$P-0001-000000000005', '$P-0004-000000000001', 'top'));

-- ---- VD-08 : ado non concerné ---------------------------------------------
select pg_temp.verif('VD-08 ado : T5 Jaune', 'ok',
  pg_temp.saisir('$P-0001-0000000000a1', '$P-0004-000000000004', 'top'));
select pg_temp.verif('VD-08 ado : seconde T5', 'ok',
  pg_temp.saisir('$P-0001-0000000000a2', '$P-0004-000000000004', 'zone1'));
select pg_temp.verif('VD-08 ado : deux résultats au niveau T5', '2',
  (select count(*)::text from interclub.resultat_voie where grimpeur_id = '$P-0004-000000000004'));

-- ---- VD-09 : NP de clôture --------------------------------------------------
create or replace function pg_temp.cloturer(p_rencontre uuid)
returns text language plpgsql as \$fn\$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '$ADMIN', 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform interclub.changer_phase_rencontre(p_rencontre, 'cloture');
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end;
\$fn\$;
select pg_temp.verif('VD-09 clôture ③ → ④', 'ok', pg_temp.cloturer('$P-0000-0000000000e0'));
select pg_temp.verif('VD-09 gA : NP sur T3 seulement (T2 Noire et T4 saisis)', 'T2Noire:top,T3:np,T4:echec',
  pg_temp.voies('$P-0004-000000000001'));
select pg_temp.verif('VD-09 gC : NP sur T2 Rouge (plus petit ordre), T3, T4', 'T2Rouge:np,T3:np,T4:np',
  pg_temp.voies('$P-0004-000000000003'));

-- ---- VD-10 : droits ---------------------------------------------------------
select pg_temp.verif('VD-10 fonction du trigger non exécutable par anon', 'false',
  (select case when f is null then 'fonction absente' else has_function_privilege('anon', f, 'execute')::text end
     from (select to_regprocedure('interclub.verifier_voie_enfant()') f) p));

select (case when ok then 'OK' else 'KO' end) || '|' || id || '|' || attendu || '|' || obtenu
  from pg_temp._res order by id;
rollback;
EOSQL
)

echo "== Voies enfant garanties en base (spec #6 R9bis, R14) =="
SORTIE=$(printf '%s\n' "$SQL" | docker exec -i "$CONTENEUR" psql -U postgres -tA -q 2>&1)
if ! printf '%s\n' "$SORTIE" | grep -qE '^(OK|KO)\|'; then
  echo "$SORTIE" >&2
  echo "Exécution SQL en échec." >&2
  exit 2
fi
while IFS='|' read -r etat id attendu obtenu; do
  case "$etat" in
    OK) ok "$id" ;;
    KO) ko "$id — obtenu « $obtenu », attendu « $attendu »" ;;
  esac
done <<< "$(printf '%s\n' "$SORTIE" | grep -E '^(OK|KO)\|')"

echo "== VD-11 Migration rejouée (idempotence) =="
sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }
VERSION="202611171200_voies_doublees_enfant"
MIGRATION="supabase/migrations/$VERSION.sql"
[ -f "$MIGRATION" ] || MIGRATION="supabase/migrations/archive/$VERSION.sql"
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
etat() {
  sql "select (select count(*) from pg_trigger where tgname = 'resultat_voie_un_par_niveau_enfant')
              || '/' || (select count(*) from interclub.version where version = '$VERSION');"
}
if [ -f "$MIGRATION" ] && appliquer "$MIGRATION"; then ok "rejeu de la migration"; else ko "rejeu de la migration en erreur"; fi
verifie "trigger présent, version enregistrée" "$(etat)" "1/1"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
