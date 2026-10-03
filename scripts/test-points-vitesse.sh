#!/usr/bin/env bash
#
# Tests des règles de la composante VITESSE calculées EN BASE (spec #7 R15–R20) :
# trigger `trg_recalculer_points_vitesse` → `recalculer_points_vitesse`, qui
# matérialise `points_vitesse`. Ces règles ne vivent pas dans `src/domaine/`
# (field-dependent, matérialisées en base, R19/R20) : elles sont testées ici
# contre la stack Supabase LOCALE (lot 7 de la revue du 2026-10-03, décision :
# script psql, sans nouvel outil).
#
# Jeu d'essai DÉDIÉ (rencontre, épreuve, barème, grimpeurs), posé et vérifié dans
# UNE transaction annulée à la fin : la base locale n'est pas modifiée.
# Barème d'essai (spec #3 R46) choisi pour que chaque règle donne une valeur
# distincte : rangs 1–3 = 20 (décrément 2) ; 4–5 = 10 (palier plat) ;
# 6 et au-delà = 4 (décrément 1) ; chute = 3 ; non-présentation = 1.
#
# Pré-requis : `supabase start` (seed 01 chargé : clubs A/B).
# Usage      : bash scripts/test-points-vitesse.sh  (ou : npm run test:points-vitesse)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"

SQL=$(cat <<'EOSQL'
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as $fn$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
$fn$;

-- Rang et points d'un grimpeur (« rang/points », « -/points » sans rang, ∅ sans ligne).
create or replace function pg_temp.pv(p_grimpeur text) returns text language sql as $fn$
  select coalesce(rang::text, '-') || '/' || points
    from interclub.points_vitesse
   where epreuve_id = 'e7e7e7e7-0000-0000-0000-000000000003'
     and grimpeur_id = ('e7e7e7e7-0000-0000-0000-0000000000' || p_grimpeur)::uuid;
$fn$;

-- ---- Jeu d'essai -----------------------------------------------------------
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
values ('e7e7e7e7-0000-0000-0000-000000000001', '2026-11-07',
        '11111111-1111-1111-1111-111111111111', 'enfant', 'competition');
insert into interclub.epreuve (id, rencontre_id, type, points_chute, points_non_presentation)
values ('e7e7e7e7-0000-0000-0000-000000000003', 'e7e7e7e7-0000-0000-0000-000000000001',
        'vitesse', 3, 1);
insert into interclub.bareme_vitesse_echelon (epreuve_id, rang_min, rang_max, points, decrement, ordre) values
  ('e7e7e7e7-0000-0000-0000-000000000003', 1, 3,    20, 2, 1),
  ('e7e7e7e7-0000-0000-0000-000000000003', 4, 5,    10, 0, 2),
  ('e7e7e7e7-0000-0000-0000-000000000003', 6, null,  4, 1, 3);
insert into interclub.equipe (id, rencontre_id, club_id, nom)
values ('e7e7e7e7-0000-0000-0000-000000000002', 'e7e7e7e7-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Essai vitesse');

-- Grimpeurs : f1…f9, fa (F), d1…d2 (H) ; tous engagés (spec #10 R7bis).
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select ('e7e7e7e7-0000-0000-0000-0000000000' || code)::uuid,
       '11111111-1111-1111-1111-111111111111', 'Essai', code, 2015, sexe, 990000 + n
  from (values ('f1','F',1),('f2','F',2),('f3','F',3),('f4','F',4),('f5','F',5),
               ('f6','F',6),('f7','F',7),('f8','F',8),('f9','F',9),('fa','F',10),
               ('d1','H',11),('d2','H',12)) as t(code, sexe, n);
insert into interclub.composition (equipe_id, grimpeur_id)
select 'e7e7e7e7-0000-0000-0000-000000000002', id
  from interclub.grimpeur where nom = 'Essai' and licence between 990001 and 990012;

-- Résultats : F = 8,0 · 9,0 · 9,0 (ex æquo) · 10,0 · 15,0 · 16,0 · 17,0 ;
-- f8 chute, f9 non-présentation, fa sans résultat ; H = 7,5 · 12,0.
insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
select 'e7e7e7e7-0000-0000-0000-000000000003',
       ('e7e7e7e7-0000-0000-0000-0000000000' || code)::uuid, issue, temps
  from (values ('f1','temps',8.0),('f2','temps',9.0),('f3','temps',9.0),('f4','temps',10.0),
               ('f5','temps',15.0),('f6','temps',16.0),('f7','temps',17.0),
               ('f8','chute',null),('f9','non_presentation',null),
               ('d1','temps',7.5),('d2','temps',12.0)) as t(code, issue, temps);

-- ---- R15 / R16 : rang par sexe, temps croissant, ex æquo, barème ----------
select pg_temp.verif('R15-R16 f1 rang 1 → 20',                 '1/20', pg_temp.pv('f1'));
select pg_temp.verif('R15 ex æquo f2 rang 2 → 20−1×2 = 18',    '2/18', pg_temp.pv('f2'));
select pg_temp.verif('R15 ex æquo f3 même rang que f2',        '2/18', pg_temp.pv('f3'));
select pg_temp.verif('R15 saut de rang f4 rang 4 (palier) → 10','4/10', pg_temp.pv('f4'));
select pg_temp.verif('R16 palier plat f5 rang 5 → 10',         '5/10', pg_temp.pv('f5'));
select pg_temp.verif('R16 échelon ouvert f6 rang 6 → 4',       '6/4',  pg_temp.pv('f6'));
select pg_temp.verif('R16 au-delà f7 rang 7 → 4−1×1 = 3',      '7/3',  pg_temp.pv('f7'));
select pg_temp.verif('R15 par sexe : d1 rang 1 H → 20',        '1/20', pg_temp.pv('d1'));
select pg_temp.verif('R15 par sexe : d2 rang 2 H → 18',        '2/18', pg_temp.pv('d2'));

-- ---- R17 : chute, non-présentation, absence --------------------------------
select pg_temp.verif('R17 chute f8 sans rang → 3',             '-/3',  pg_temp.pv('f8'));
select pg_temp.verif('R17 non-présentation f9 sans rang → 1',  '-/1',  pg_temp.pv('f9'));
select pg_temp.verif('R17 sans résultat fa : aucune ligne',    '∅',    pg_temp.pv('fa'));

-- ---- R19 / R20 : field-dependent, recalcul au fil des écritures -----------
-- Un nouveau temps F plus rapide décale tout le classement F (et pas les H).
update interclub.temps_vitesse set issue = 'temps', temps = 7.0
 where epreuve_id = 'e7e7e7e7-0000-0000-0000-000000000003'
   and grimpeur_id = 'e7e7e7e7-0000-0000-0000-0000000000f8';
select pg_temp.verif('R19 chute → 7,0 : f8 rang 1 → 20',       '1/20', pg_temp.pv('f8'));
select pg_temp.verif('R19 f1 recule rang 2 → 18',              '2/18', pg_temp.pv('f1'));
select pg_temp.verif('R19 f2/f3 reculent rang 3 → 16',         '3/16', pg_temp.pv('f2'));
select pg_temp.verif('R19 f7 recule rang 8 → 4−2×1 = 2',       '8/2',  pg_temp.pv('f7'));
select pg_temp.verif('R19 classement H inchangé (d1)',         '1/20', pg_temp.pv('d1'));

-- Suppression d'un temps : les rangs se recompactent.
delete from interclub.temps_vitesse
 where epreuve_id = 'e7e7e7e7-0000-0000-0000-000000000003'
   and grimpeur_id = 'e7e7e7e7-0000-0000-0000-0000000000f8';
select pg_temp.verif('R20 delete f8 : plus de ligne',          '∅',    pg_temp.pv('f8'));
select pg_temp.verif('R20 delete : f1 revient rang 1 → 20',    '1/20', pg_temp.pv('f1'));
select pg_temp.verif('R20 delete : f7 revient rang 7 → 3',     '7/3',  pg_temp.pv('f7'));

-- ---- Bilan -------------------------------------------------------------------
select case when ok then '[OK]' else '[KO]' end || ' ' || id
       || case when ok then '' else ' (attendu ' || attendu || ', obtenu ' || obtenu || ')' end
  from pg_temp._res order by id;
select 'POINTS_VITESSE RESULT: ' || count(*) filter (where ok) || ' OK / '
       || count(*) filter (where not ok) || ' KO' from pg_temp._res;
rollback;
EOSQL
)

sortie=$(printf '%s\n' "$SQL" | docker exec -i "$CONTENEUR" psql -U postgres -tA -q 2>&1) || {
  echo "$sortie"
  echo "Échec d'exécution SQL (stack locale démarrée ? seed chargé ?)" >&2
  exit 2
}
echo "$sortie" | grep -E '^\[(OK|KO)\]|RESULT'
echo "$sortie" | grep -q ' 0 KO$'
