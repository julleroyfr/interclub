#!/usr/bin/env bash
#
# Tests automatisés de la tranche T6 (policies RLS des tables métier) contre la
# stack Supabase LOCALE. Vérifie la matrice rôles × actions de la spec #1 et les
# deux chemins d'acteur de l'ADR 0001 (permanent via `compte`, éphémère via
# `session_qr → jeton_qr → rencontre`), avec gating de phase.
#
# Approche : impersonation en base (SET ROLE authenticated + claim JWT `sub`)
# dans UNE transaction annulée à la fin. Chaque assertion tente une écriture ;
# un petit harnais plpgsql annule l'effet et compare le succès réel au succès
# attendu. Aucune donnée n'est laissée en base (rollback global).
#
# Pré-requis : `supabase start` puis `supabase db reset` (migrations + seeds
#              01/02/03). Docker + CLI Supabase.
# Usage      : bash scripts/test-t6.sh   (ou : npm run test:t6)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

# Nom du conteneur DB (par défaut supabase_db_<project>). Détecté sinon.
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

-- Harnais : tente p_sql, annule l'effet, enregistre succès réel vs attendu.
create temp table _res(id text, attendu boolean, obtenu boolean, ok boolean) on commit drop;
grant insert on pg_temp._res to authenticated;  -- essai() y écrit sous l'identité impersonée
create or replace function pg_temp.essai(p_id text, p_attendu_ok boolean, p_sql text)
returns void language plpgsql as $fn$
declare v_ok boolean;
begin
  begin
    execute p_sql;
    raise exception 'ESSAI_UNDO';           -- succès : on force l'annulation
  exception
    when others then
      v_ok := (sqlerrm = 'ESSAI_UNDO');      -- sentinelle = l'écriture a réussi
  end;
  insert into pg_temp._res values (p_id, p_attendu_ok, v_ok, p_attendu_ok = v_ok);
end $fn$;

-- ---- Fixtures (superuser, RLS contournée) -------------------------------
-- Le jeu de test (seed 01) fournit déjà : épreuves voie (…801)/vitesse (…803),
-- grimpeurs gA1 (a…a1) et gB2 (b…b2, libre), équipes A1 (…6666)/A2 (…6602),
-- compositions gA1∈A1. On n'ajoute que ce qui ne peut être seedé :
--   1. le PRÊT posé par l'admin (gB2 club B ∈ équipe A1 club A) — état initial R36 ;
--   2. deux utilisateurs anonymes + leurs sessions QR (créées au scan en vrai).
insert into interclub.composition (equipe_id, grimpeur_id) values
  ('66666666-6666-6666-6666-666666666666','b0000000-0000-0000-0000-0000000000b2'); -- gB2 prêté par l'admin
insert into auth.users (instance_id,id,aud,role,is_anonymous,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000c7','authenticated','authenticated',true,now(),now()),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-0000-0000-0000000000c8','authenticated','authenticated',true,now(),now());
insert into interclub.session_qr (utilisateur_id, jeton_qr_id) values
  ('d0000000-0000-0000-0000-0000000000c7','55555555-5555-5555-5555-555555555551'),  -- coach temp Club A
  ('e0000000-0000-0000-0000-0000000000c8','55555555-5555-5555-5555-555555555552');  -- juge Voie 1

-- =========================== BLOC A : phase ① ===========================
update interclub.rencontre set phase='pre_competition' where id='33333333-3333-3333-3333-333333333333';

-- Admin (tout permis) & compte sans mapping (rien) — indépendants de la phase.
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
select pg_temp.essai('A-admin-club', true, $$insert into interclub.club (nom) values ('T6 Z')$$);
reset role;
select set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555"}', true); set role authenticated;
select pg_temp.essai('A-sansmap-club', false, $$insert into interclub.club (nom) values ('T6 KO')$$);
reset role;

-- Coach permanent Club A.
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', true); set role authenticated;
select pg_temp.essai('A-coachA-grimpeurA',  true,  $$insert into interclub.grimpeur (club_id,nom,prenom,annee_naissance) values ('11111111-1111-1111-1111-111111111111','r','a',2016)$$);
select pg_temp.essai('A-coachA-grimpeurB',  false, $$insert into interclub.grimpeur (club_id,nom,prenom,annee_naissance) values ('22222222-2222-2222-2222-222222222222','r','b',2016)$$);
select pg_temp.essai('A-coachA-equipeA-p1', true,  $$insert into interclub.equipe (rencontre_id,club_id,nom) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','A2')$$);
select pg_temp.essai('A-coachA-equipeB',    false, $$insert into interclub.equipe (rencontre_id,club_id,nom) values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','B2')$$);
select pg_temp.essai('A-coachA-resultat-p1',false, $$insert into interclub.resultat (epreuve_id,grimpeur_id,valeur) values ('88888888-8888-8888-8888-888888888801','a0000000-0000-0000-0000-0000000000a1','top')$$);
reset role;

-- Coach temporaire : aucune session valide en phase ① (R28).
select set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-0000000000c7"}', true); set role authenticated;
select pg_temp.essai('A-coachTemp-equipe-p1', false, $$insert into interclub.equipe (rencontre_id,club_id,nom) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','TMP')$$);
reset role;

-- =========================== BLOC B : phase ② ===========================
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';

-- Coach permanent Club A.
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', true); set role authenticated;
select pg_temp.essai('B-coachA-equipe-p2',   false, $$insert into interclub.equipe (rencontre_id,club_id,nom) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','A3')$$);
select pg_temp.essai('B-coachA-resultat',    true,  $$insert into interclub.resultat (epreuve_id,grimpeur_id,valeur) values ('88888888-8888-8888-8888-888888888801','a0000000-0000-0000-0000-0000000000a1','top')$$);
select pg_temp.essai('B-coachA-resultatPrete',true, $$insert into interclub.resultat (epreuve_id,grimpeur_id,valeur) values ('88888888-8888-8888-8888-888888888801','b0000000-0000-0000-0000-0000000000b2','top')$$);
select pg_temp.essai('B-coachA-composePrete',false, $$insert into interclub.composition (equipe_id,grimpeur_id) values ('66666666-6666-6666-6666-666666666602','b0000000-0000-0000-0000-0000000000b1')$$);
reset role;

-- Coach temporaire Club A (session, phase ②).
select set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-0000000000c7"}', true); set role authenticated;
select pg_temp.essai('B-coachTemp-equipeA',  true,  $$insert into interclub.equipe (rencontre_id,club_id,nom) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','TMP2')$$);
select pg_temp.essai('B-coachTemp-equipeB',  false, $$insert into interclub.equipe (rencontre_id,club_id,nom) values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','TMPB')$$);
reset role;

-- Juge (session, phase ②).
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-0000000000c8"}', true); set role authenticated;
select pg_temp.essai('B-juge-tempsVitesse',  true,  $$insert into interclub.temps_vitesse (epreuve_id,grimpeur_id,temps) values ('88888888-8888-8888-8888-888888888803','a0000000-0000-0000-0000-0000000000a1',7.2)$$);
select pg_temp.essai('B-juge-resultatVoie',  false, $$insert into interclub.resultat (epreuve_id,grimpeur_id,valeur) values ('88888888-8888-8888-8888-888888888801','a0000000-0000-0000-0000-0000000000a1','top')$$);
select pg_temp.essai('B-juge-tempsSurVoie',  false, $$insert into interclub.temps_vitesse (epreuve_id,grimpeur_id,temps) values ('88888888-8888-8888-8888-888888888801','a0000000-0000-0000-0000-0000000000a1',7.2)$$);
reset role;

-- ---- Restitution --------------------------------------------------------
\echo '--- Détail des assertions ---'
select id, attendu, obtenu, case when ok then 'OK' else 'KO' end as verdict from pg_temp._res order by id;
select 'T6 RESULT: ' || count(*) filter (where ok) || ' OK / ' || count(*) filter (where not ok) || ' KO' as bilan
  from pg_temp._res;

rollback;
SQL
)
STATUS=$?

echo "$OUT"

if [ $STATUS -ne 0 ]; then
  echo "Échec d'exécution SQL (stack locale démarrée ? supabase db reset lancé ?)" >&2
  exit 2
fi

# Bilan : 0 KO attendu.
if echo "$OUT" | grep -qE 'T6 RESULT: [0-9]+ OK / 0 KO'; then
  echo "✅ T6 : toutes les assertions RLS passent."
  exit 0
else
  echo "❌ T6 : au moins une assertion RLS a échoué (voir le détail ci-dessus)." >&2
  exit 1
fi
