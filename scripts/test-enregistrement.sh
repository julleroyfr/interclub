#!/usr/bin/env bash
#
# Tests automatisés des FONCTIONS D'ENREGISTREMENT en un appel (spec #6 R3/R20,
# spec #10 R3/R14, rév. 2026-10-09 ; migration 202610091000) contre la stack
# Supabase LOCALE. Chaque saisie coach / juge = un appel qui contrôle PUIS écrit :
#   - R3  : refus explicites et codés — voie/bloc introuvable, hors compétition,
#           hors périmètre (autre club), issue non admise (NP, prise valorisée
#           hors tête enfant, zones hors ado), palier d'un autre bloc ;
#           session juge absente ;
#   - R13/R17 : correction = remplacement (un seul résultat) ;
#   - R20 : la réponse porte les résultats du grimpeur AVEC leurs barèmes et ses
#           points de vitesse (matière du score) ;
#   - auteur forcé (trigger existant) : l'écrivain réel est tracé.
#
# Approche : impersonation (SET ROLE authenticated + claim `sub`) dans UNE
# transaction annulée à la fin. `code()` exécute un appel et compare le code
# d'erreur obtenu ('ok' si succès) au code attendu.
#
# Pré-requis : `supabase start` + `supabase db reset` (migrations + seed 01).
# Usage      : bash scripts/test-enregistrement.sh  (ou : npm run test:enregistrement)

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

-- code() : exécute p_sql ; 'ok' si succès, sinon le MESSAGE de l'erreur levée.
-- L'effet est CONSERVÉ (les cas s'enchaînent : correction, retrait…).
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

-- verif() : enregistre une égalité calculée (valeur obtenue vs attendue).
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language plpgsql as $fn$
begin
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '(null)'), p_attendu = coalesce(p_obtenu, '(null)'));
end $fn$;
grant execute on function pg_temp.verif(text, text, text) to authenticated;

-- ---- Fixtures (superuser) -----------------------------------------------
-- Rencontre pilote enfant (33333333) en ③ ; Ana + Bob (Club A, A1), Cléo (B, B1).
-- Voies : T1 tête (…9901), M1 moulinette (…9911) ; blocs B1 (…9902, paliers
-- …99a1/a2), B2 (…9903, paliers …99b1-b3). Épreuve de vitesse …8803.
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';
delete from interclub.resultat_voie where grimpeur_id in ('a0000000-0000-0000-0000-0000000000a2','b0000000-0000-0000-0000-0000000000b1');
delete from interclub.resultat_bloc where grimpeur_id in ('a0000000-0000-0000-0000-0000000000a2','b0000000-0000-0000-0000-0000000000b1');
delete from interclub.temps_vitesse where grimpeur_id in ('a0000000-0000-0000-0000-0000000000a2','b0000000-0000-0000-0000-0000000000b1');
-- Session QR juge (utilisateur anonyme) sur le jeton juge du seed.
insert into auth.users (instance_id,id,aud,role,is_anonymous,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-0000-0000-0000000000c9','authenticated','authenticated',true,now(),now());
insert into interclub.session_qr (utilisateur_id, jeton_qr_id) values
  ('e0000000-0000-0000-0000-0000000000c9','55555555-5555-5555-5555-555555555552');

-- =========================================================================
-- BLOC 1 — Coach A (permanent Club A) en ③.
-- =========================================================================
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set role authenticated;

select pg_temp.code('R3-voie-saisie-OK', 'ok',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top')$$);
select pg_temp.code('R13-voie-correction-OK', 'ok',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','prise_valorisee')$$);
select pg_temp.verif('R13-un-seul-resultat', '1',
  (select count(*)::text from interclub.resultat_voie where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));
select pg_temp.verif('R13-issue-remplacee', 'prise_valorisee',
  (select issue from interclub.resultat_voie where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));

-- R20 — la réponse porte les résultats AVEC barèmes.
select pg_temp.verif('R20-reponse-voie-avec-bareme', 'prise_valorisee',
  (select v->>'issue' from jsonb_array_elements(
     interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','prise_valorisee')->'voies') v
   where v->>'voie_difficulte_id' = '99999999-9999-9999-9999-999999999901' and v ? 'points_prise_valorisee'));

-- R3 — issues non admises (R10/R12/R18).
select pg_temp.code('R3-np-non-saisissable', 'issue_non_admise',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','np')$$);
select pg_temp.code('R3-prise-valorisee-moulinette', 'issue_non_admise',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999911','a0000000-0000-0000-0000-0000000000a2','prise_valorisee')$$);
select pg_temp.code('R3-zone-enfant', 'issue_non_admise',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','zone1')$$);
select pg_temp.code('R3-voie-introuvable', 'voie_introuvable',
  $$select interclub.saisir_resultat_voie('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-0000000000a2','top')$$);

-- R3/R2 — grimpeur d'un autre club : refus sans écriture.
select pg_temp.code('R3-autre-club-refuse', 'hors_perimetre',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','b0000000-0000-0000-0000-0000000000b1','top')$$);

-- Blocs (R15–R17).
select pg_temp.code('R3-bloc-palier-OK', 'ok',
  $$select interclub.saisir_resultat_bloc('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a2','palier','99999999-9999-9999-9999-9999999999a1')$$);
select pg_temp.code('R3-bloc-palier-autre-bloc', 'palier_invalide',
  $$select interclub.saisir_resultat_bloc('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a2','palier','99999999-9999-9999-9999-9999999999b1')$$);
select pg_temp.code('R3-bloc-np-non-saisissable', 'issue_non_admise',
  $$select interclub.saisir_resultat_bloc('99999999-9999-9999-9999-999999999903','a0000000-0000-0000-0000-0000000000a2','np',null)$$);
select pg_temp.code('R17-bloc-correction-echec-OK', 'ok',
  $$select interclub.saisir_resultat_bloc('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a2','echec','99999999-9999-9999-9999-9999999999a1')$$);
select pg_temp.verif('R17-echec-sans-palier', 'echec|',
  (select issue || '|' || coalesce(palier_id::text, '') from interclub.resultat_bloc where bloc_id='99999999-9999-9999-9999-999999999902' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));
select pg_temp.verif('R20-reponse-bloc-points-palier', '4',
  (select b->>'points_palier' from jsonb_array_elements(
     interclub.saisir_resultat_bloc('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a2','palier','99999999-9999-9999-9999-9999999999a1')->'blocs') b
   where b->>'bloc_id' = '99999999-9999-9999-9999-999999999902'));

-- Retrait (R11).
select pg_temp.code('R3-retrait-OK', 'ok',
  $$select interclub.retirer_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2')$$);
select pg_temp.verif('R3-retrait-effectif', '0',
  (select count(*)::text from interclub.resultat_voie where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));

-- Auteur tracé (trigger) = l'écrivain réel.
select pg_temp.code('R3-voie-pour-auteur', 'ok',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top')$$);
reset role;
select pg_temp.verif('auteur-coach-trace', 'cccccccc-cccc-cccc-cccc-cccccccccccc|coach',
  (select auteur_utilisateur_id::text || '|' || auteur_role from interclub.resultat_voie where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));

-- =========================================================================
-- BLOC 2 — Hors compétition (R5/R7) et coach d'un autre club (R2).
-- =========================================================================
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R2-coachB-sur-grimpeur-A-refuse', 'hors_perimetre',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','echec')$$);
reset role;

update interclub.rencontre set phase='cloture' where id='33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R5-cloture-refuse', 'hors_competition',
  $$select interclub.saisir_resultat_voie('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','echec')$$);
reset role;
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';

-- =========================================================================
-- BLOC 3 — Juge (spec #10 R3/R7bis/R11).
-- =========================================================================
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-0000000000c9","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R3-juge-temps-OK', 'ok',
  $$select interclub.saisir_temps_vitesse('a0000000-0000-0000-0000-0000000000a2','temps',8.123)$$);
select pg_temp.code('R11-juge-correction-chute-OK', 'ok',
  $$select interclub.saisir_temps_vitesse('a0000000-0000-0000-0000-0000000000a2','chute',8.5)$$);
select pg_temp.code('R7bis-juge-non-engage-refuse', 'grimpeur_non_engage',
  $$select interclub.saisir_temps_vitesse('a0000000-0000-0000-0000-0000000000a9','temps',9)$$);
reset role;
select pg_temp.verif('R11-juge-un-seul-resultat-chute', 'chute||e0000000-0000-0000-0000-0000000000c9',
  (select issue || '|' || coalesce(temps::text, '') || '|' || auteur_utilisateur_id::text from interclub.temps_vitesse
    where epreuve_id='88888888-8888-8888-8888-888888888803' and grimpeur_id='a0000000-0000-0000-0000-0000000000a2'));

-- Coach (pas de session juge) : refus.
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set role authenticated;
select pg_temp.code('R3-coach-pas-juge-refuse', 'session_juge_absente',
  $$select interclub.saisir_temps_vitesse('a0000000-0000-0000-0000-0000000000a2','temps',7)$$);
reset role;

-- ---- Restitution --------------------------------------------------------
\echo '--- Détail des assertions ---'
select id, attendu, obtenu, case when ok then 'OK' else 'KO' end as verdict from pg_temp._res order by id;
select 'ENREGISTREMENT RESULT: ' || count(*) filter (where ok) || ' OK / ' || count(*) filter (where not ok) || ' KO' as bilan
  from pg_temp._res;

rollback;
SQL
)
STATUS=$?

echo "$OUT"

if [ $STATUS -ne 0 ]; then
  echo "Échec d'exécution SQL (stack locale démarrée ? migration 202610091000 appliquée ?)" >&2
  exit 2
fi

if echo "$OUT" | grep -qE 'ENREGISTREMENT RESULT: [0-9]+ OK / 0 KO'; then
  echo "✅ Enregistrement en un appel : toutes les assertions BDD passent."
  exit 0
else
  echo "❌ Enregistrement en un appel : au moins une assertion a échoué (voir le détail)." >&2
  exit 1
fi
