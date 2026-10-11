#!/usr/bin/env bash
#
# Tests automatisés de l'HEURE DE SAISIE et des refus de synchronisation (spec #17
# R7–R11, R19, R20 ; spec #6 R13bis, spec #9 R6, spec #10 R11bis ; migration
# 202610091100_heure_saisie) contre la stack Supabase LOCALE :
#   - R7  : une heure de saisie future est ramenée à l'heure du serveur ;
#   - R8  : une écriture sans heure (admin) prend l'heure du serveur et n'est
#           jamais refusée ; une simple coche de contrôle ne la change pas ;
#   - R9  : une écriture plus ancienne que le résultat existant est refusée
#           (`saisie_plus_ancienne`), quel que soit le chemin (fonction ou API) ;
#   - R10 : un retrait plus ancien que le résultat existant est refusé ;
#   - R11 : une heure égale est acceptée (rejeu) ;
#   - R19 : session coach absente → `session_absente` (distinct de hors périmètre) ;
#   - R20 : compétition clôturée → `competition_cloturee`.
#
# Approche : impersonation (SET ROLE authenticated + claim `sub`) dans UNE
# transaction annulée à la fin.
#
# Pré-requis : `supabase start` + `supabase db reset` (migrations + seed 01).
# Usage      : bash scripts/test-heure-saisie.sh  (ou : npm run test:heure-saisie)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

DB_CONTAINER="${DB_CONTAINER:-supabase_db_interclub}"
if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1)
fi
if [ -z "${DB_CONTAINER:-}" ]; then
  echo "Conteneur DB Supabase introuvable. Lance : supabase start && supabase db reset" >&2
  exit 2
fi

OUT=$(docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;

-- ---- Harnais ------------------------------------------------------------
create temp table _res(id text, attendu text, obtenu text, ok boolean) on commit drop;
grant insert, select on pg_temp._res to authenticated;

create or replace function pg_temp.code(p_id text, p_attendu text, p_sql text)
returns void language plpgsql as $fn$
declare v text;
begin
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := sqlerrm;
  end;
  insert into pg_temp._res values (p_id, p_attendu, v, v = p_attendu);
end $fn$;
grant execute on function pg_temp.code(text, text, text) to authenticated;

create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language plpgsql as $fn$
begin
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '(null)'), p_attendu = coalesce(p_obtenu, '(null)'));
end $fn$;
grant execute on function pg_temp.verif(text, text, text) to authenticated;

-- ---- Fixtures (superuser) -----------------------------------------------
-- Rencontre pilote enfant (33333333) en ③ ; Bob (Club A). Voie T1 (…9901).
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';
delete from interclub.resultat_voie where grimpeur_id = 'a0000000-0000-0000-0000-0000000000a2';
delete from interclub.resultat_bloc where grimpeur_id = 'a0000000-0000-0000-0000-0000000000a2';

-- Raccourci : heure de saisie stockée pour Bob sur T1.
create or replace function pg_temp.heure_t1() returns timestamptz language sql as $fn$
  select saisi_le from interclub.resultat_voie
   where voie_difficulte_id='99999999-9999-9999-9999-999999999901'
     and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'
$fn$;
grant execute on function pg_temp.heure_t1() to authenticated;

-- =========================================================================
-- Coach A (permanent Club A).
-- =========================================================================
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set role authenticated;

-- R7 — heure future ramenée à l'heure du serveur.
select pg_temp.code('R7-saisie-datee-dans-le-futur', 'ok',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top', now() + interval '1 hour')$$);
select pg_temp.verif('R7-heure-ramenee-a-maintenant', 'true', (select (pg_temp.heure_t1() <= now())::text));

-- R9 — une saisie PLUS ANCIENNE que l'existante est refusée, sans écriture.
select pg_temp.code('R9-saisie-plus-ancienne-refusee', 'saisie_plus_ancienne',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','echec', now() - interval '10 minutes')$$);
select pg_temp.verif('R9-valeur-conservee', 'top',
  (select issue from interclub.resultat_voie where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));

-- R11 — même heure (rejeu) : acceptée.
select pg_temp.code('R11-rejeu-meme-heure-accepte', 'ok',
  format($$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top', %L::timestamptz)$$, pg_temp.heure_t1()));

-- R9 — aussi par l'API directe (upsert), pas seulement par la fonction.
select pg_temp.code('R9-api-directe-plus-ancienne-refusee', 'saisie_plus_ancienne',
  $$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue, saisi_le)
      values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','echec', now() - interval '1 hour')
      on conflict (voie_difficulte_id, grimpeur_id) do update set issue = excluded.issue, saisi_le = excluded.saisi_le$$);

-- R10 — retrait plus ancien que le résultat : refusé ; plus récent : accepté.
select pg_temp.code('R10-retrait-plus-ancien-refuse', 'saisie_plus_ancienne',
  $$select interclub.retirer_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2', now() - interval '1 hour')$$);
select pg_temp.code('R10-retrait-recent-accepte', 'ok',
  $$select interclub.retirer_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2', now())$$);
select pg_temp.code('R10-retrait-sans-resultat-sans-effet', 'ok',
  $$select interclub.retirer_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2', now())$$);

-- Saisie de référence pour la suite (heure = il y a 5 min).
select pg_temp.code('prep-saisie-5-min', 'ok',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','echec', now() - interval '5 minutes')$$);
reset role;

-- =========================================================================
-- Admin : R8 — heure du serveur, jamais refusé ; coche sans effet sur l'heure.
-- =========================================================================
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R8-admin-correction-acceptee', 'ok',
  $$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
      values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top')
      on conflict (voie_difficulte_id, grimpeur_id) do update set issue = excluded.issue$$);
select pg_temp.verif('R8-admin-heure-serveur', 'true', (select (pg_temp.heure_t1() = now())::text));
reset role;
-- Une coche de contrôle (spec #16) ne modifie pas l'heure de saisie.
-- (mise en place : on recule l'heure stockée, triggers désactivés le temps de l'update)
set local session_replication_role = replica;
update interclub.resultat_voie set saisi_le = now() - interval '2 minutes'
 where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2';
set local session_replication_role = origin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set role authenticated;
update interclub.resultat_voie set controle_le = now(), controle_par = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2';
select pg_temp.verif('R8-coche-heure-inchangee', 'true', (select (pg_temp.heure_t1() < now() - interval '1 minute')::text));
reset role;

-- =========================================================================
-- R19 — session coach absente ; R20 — compétition clôturée.
-- =========================================================================
-- Compte sans rôle ni session QR : « session absente », pas « hors périmètre ».
select set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R19-sans-session-coach', 'session_absente',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top', now())$$);
reset role;

-- Coach B : session valide, grimpeur d'un autre club → hors périmètre.
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R18-autre-club-hors-perimetre', 'hors_perimetre',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top', now())$$);
reset role;

update interclub.rencontre set phase='cloture' where id='33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R20-competition-cloturee', 'competition_cloturee',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top', now())$$);
reset role;
update interclub.rencontre set phase='preparation' where id='33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set role authenticated;
-- En ② la structure n'est pas encore lisible par le coach (spec #6 R21bis) :
-- la voie est introuvable pour lui, rien n'est écrit.
select pg_temp.code('R5-preparation-voie-pas-encore-lisible', 'voie_introuvable',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top', now())$$);
reset role;
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';

-- ---- Restitution --------------------------------------------------------
\echo '--- Détail des assertions ---'
select id, attendu, obtenu, case when ok then 'OK' else 'KO' end as verdict from pg_temp._res order by id;
select 'HEURE_SAISIE RESULT: ' || count(*) filter (where ok) || ' OK / ' || count(*) filter (where not ok) || ' KO' as bilan
  from pg_temp._res;

rollback;
SQL
)
STATUS=$?

echo "$OUT"

if [ $STATUS -ne 0 ]; then
  echo "Échec d'exécution SQL (stack locale démarrée ? migration 202610091100 appliquée ?)" >&2
  exit 2
fi

if echo "$OUT" | grep -qE 'HEURE_SAISIE RESULT: [0-9]+ OK / 0 KO'; then
  echo "✅ Heure de saisie : toutes les assertions BDD passent."
  exit 0
else
  echo "❌ Heure de saisie : au moins une assertion a échoué (voir le détail)." >&2
  exit 1
fi
