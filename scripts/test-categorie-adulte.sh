#!/usr/bin/env bash
#
# Tests automatisés de la CATÉGORIE ADULTE (spec #20), lot 1, contre la stack
# Supabase LOCALE. Couvre les règles ENFORÇABLES EN BASE :
#   - R1     : création d'une rencontre adulte (RPC), catégorie inconnue refusée
#   - R6–R9  : copie du gabarit adulte (10 voies T1–T10 et leurs points, B1/B2 et
#              paliers, voies de vitesse « Voie 1 »/« Voie 2 », barème, chute/NP)
#   - R24/R26: zones admises en adulte ; prise valorisée refusée (trigger)
#   - R22    : plafond de 6 voies par grimpeur en adulte (trigger)
#   - R23/R26: issue « top_moulinette » admise en adulte seulement (lot 4)
#   - R10–R14: équipes adultes sans club, composées par l'admin seul, 4 au plus,
#              nom unique (lot 3) ; R28 : roster juge avec le club d'origine
#
# Les règles applicatives (éligibilité ≥ 16 ans, issues proposées, libellé de voie
# de vitesse) sont couvertes par le domaine pur (Vitest). Le reste est au cahier.
#
# Approche : comme scripts/test-resultats.sh — impersonation (SET ROLE
# authenticated + claim JWT), UNE transaction annulée à la fin : aucune donnée
# laissée en base.
#
# Pré-requis : `supabase start` puis `npm run db:reset` (migration
#              202610231000_categorie_adulte incluse).
# Usage      : bash scripts/test-categorie-adulte.sh   (ou : npm run test:adulte)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

DB_CONTAINER="${DB_CONTAINER:-supabase_db_interclub}"
if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1)
fi
if [ -z "${DB_CONTAINER:-}" ]; then
  echo "Conteneur DB Supabase introuvable. Lance : supabase start && npm run db:reset" >&2
  exit 2
fi

OUT=$(docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;

-- ---- Harnais ------------------------------------------------------------
create temp table _res(id text, attendu boolean, obtenu boolean, ok boolean) on commit drop;
grant insert on pg_temp._res to authenticated;

-- essai() : tente p_sql, annule l'effet, enregistre succès réel vs attendu.
create or replace function pg_temp.essai(p_id text, p_attendu_ok boolean, p_sql text)
returns void language plpgsql as $fn$
declare v_ok boolean;
begin
  begin
    execute p_sql;
    raise exception 'ESSAI_UNDO';
  exception
    when others then
      v_ok := (sqlerrm = 'ESSAI_UNDO');
  end;
  insert into pg_temp._res values (p_id, p_attendu_ok, v_ok, p_attendu_ok = v_ok);
end $fn$;
grant execute on function pg_temp.essai(text, boolean, text) to authenticated;

-- verif() : enregistre une égalité calculée (valeur obtenue vs attendue).
create or replace function pg_temp.verif(p_id text, p_obtenu text, p_attendu text)
returns void language plpgsql as $fn$
begin
  insert into pg_temp._res values (p_id, true, p_obtenu is not distinct from p_attendu,
                                   p_obtenu is not distinct from p_attendu);
  if p_obtenu is distinct from p_attendu then
    raise notice '% : obtenu « % », attendu « % »', p_id, p_obtenu, p_attendu;
  end if;
end $fn$;
grant execute on function pg_temp.verif(text, text, text) to authenticated;

-- ---- R1 — création d'une rencontre adulte (admin) -------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
select interclub.creer_rencontre_avec_gabarit('2027-01-16',
  '11111111-1111-1111-1111-111111111111', 'adulte') as rid \gset
select pg_temp.essai('R1-categorie-inconnue-KO', false,
  $$select interclub.creer_rencontre_avec_gabarit('2027-01-16','11111111-1111-1111-1111-111111111111','senior')$$);
reset role;

-- ---- R6–R9 — copie du gabarit adulte -------------------------------------
select pg_temp.verif('R1-categorie', (select categorie from interclub.rencontre where id = :'rid'), 'adulte');
select pg_temp.verif('R7-voies-T1-T10',
  (select string_agg(niveau || ':' || type_voie || ':' || points || '/' || points_zone1 || '/' || points_zone2, ' ' order by ordre)
     from interclub.voie_difficulte vd join interclub.epreuve e on e.id = vd.epreuve_id
    where e.rencontre_id = :'rid'),
  'T1:tete:4/1/2 T2:tete:6/3/4 T3:tete:8/5/6 T4:tete:10/7/8 T5:tete:12/9/10 T6:tete:14/11/12 T7:tete:16/13/14 T8:tete:18/15/16 T9:tete:20/17/18 T10:tete:22/19/20');
select pg_temp.verif('R8-blocs-paliers',
  (select string_agg(b.code || ':' || p.libelle || '=' || p.points, ' ' order by b.ordre, p.ordre)
     from interclub.bloc b join interclub.bloc_palier p on p.bloc_id = b.id
     join interclub.epreuve e on e.id = b.epreuve_id where e.rencontre_id = :'rid'),
  'B1:Zone=15 B1:Bloc complet=30 B2:Zone 1=20 B2:Zone 2=50 B2:Bloc complet=70');
select pg_temp.verif('R9-voies-vitesse',
  (select string_agg(numero || ':' || libelle, ' ' order by numero) from interclub.voie_vitesse where rencontre_id = :'rid'),
  '1:Voie 1 2:Voie 2');
select pg_temp.verif('R9-chute-np',
  (select points_chute || '/' || points_non_presentation from interclub.epreuve where rencontre_id = :'rid' and type = 'vitesse'),
  '5/0');
select pg_temp.verif('R9-bareme',
  (select string_agg(b.rang_min || '-' || coalesce(b.rang_max::text, '∞') || ':' || b.points || '-' || b.decrement, ' ' order by b.ordre)
     from interclub.bareme_vitesse_echelon b join interclub.epreuve e on e.id = b.epreuve_id where e.rencontre_id = :'rid'),
  '1-5:100-5 6-10:75-0 11-15:60-0 16-20:45-0 21-25:30-0 26-30:15-0 31-∞:10-0');

-- ---- R22/R24/R26 — saisie des voies en compétition ------------------------
update interclub.rencontre set phase = 'competition' where id = :'rid';
select vd.id as v1 from interclub.voie_difficulte vd join interclub.epreuve e on e.id = vd.epreuve_id
 where e.rencontre_id = :'rid' and vd.niveau = 'T1' \gset

select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
-- Trigger de cohérence (insertion directe, admin).
select pg_temp.essai('R26-zone2-adulte-OK', true,
  format($$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values (%L, 'a0000000-0000-0000-0000-0000000000a1', 'zone2')$$, :'v1'));
select pg_temp.essai('R26-prise-valorisee-adulte-KO', false,
  format($$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values (%L, 'a0000000-0000-0000-0000-0000000000a1', 'prise_valorisee')$$, :'v1'));
-- NB : la RPC `saisir_resultat_voie` exige une session coach ; en adulte, ce
-- chemin sera celui du capitaine (lot 5) et testé avec lui.
reset role;

-- Lot 4 — top en moulinette (R23, R26) : admis en adulte (tête), refusé ailleurs.
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
select pg_temp.essai('R26-top-moulinette-adulte-OK', true,
  format($$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values (%L, 'a0000000-0000-0000-0000-0000000000a1', 'top_moulinette')$$, :'v1'));
select pg_temp.essai('R26-top-moulinette-voie-enfant-KO', false,
  $$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values ('99999999-9999-9999-9999-999999999901', 'a0000000-0000-0000-0000-0000000000a2', 'top_moulinette')$$);
select pg_temp.essai('R23-issue-inconnue-KO', false,
  format($$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values (%L, 'a0000000-0000-0000-0000-0000000000a1', 'moulinette')$$, :'v1'));
reset role;

-- Plafond : 6 voies saisies pour un grimpeur (superuser), la 7ᵉ est refusée.
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
select vd.id, 'a0000000-0000-0000-0000-0000000000a2', 'top'
  from interclub.voie_difficulte vd join interclub.epreuve e on e.id = vd.epreuve_id
 where e.rencontre_id = :'rid' and vd.ordre <= 6;
select vd.id as v7 from interclub.voie_difficulte vd join interclub.epreuve e on e.id = vd.epreuve_id
 where e.rencontre_id = :'rid' and vd.ordre = 7 \gset
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
select pg_temp.essai('R22-plafond-7e-voie-KO', false,
  format($$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values (%L, 'a0000000-0000-0000-0000-0000000000a2', 'top')$$, :'v7'));
select pg_temp.essai('R22-correction-voie-saisie-OK', true,
  format($$insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue) values (%L, 'a0000000-0000-0000-0000-0000000000a2', 'zone2')
           on conflict (voie_difficulte_id, grimpeur_id) do update set issue = excluded.issue$$, :'v1'));
reset role;

-- ---- Lot 3 — équipes adultes (R10–R14, R28) -------------------------------
update interclub.rencontre set phase = 'pre_competition' where id = :'rid';
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
select pg_temp.essai('R11-admin-equipe-avec-club-KO', false,
  format($$insert into interclub.equipe (rencontre_id, club_id, nom) values (%L, '11111111-1111-1111-1111-111111111111', 'X')$$, :'rid'));
select pg_temp.essai('R11-equipe-enfant-sans-club-KO', false,
  $$insert into interclub.equipe (rencontre_id, club_id, nom) values ('33333333-3333-3333-3333-333333333333', null, 'X')$$);
insert into interclub.equipe (rencontre_id, club_id, nom) values (:'rid', null, 'Équipe 1') returning id as eq1 \gset
select pg_temp.essai('R14-nom-equipe-adulte-duplique-KO', false,
  format($$insert into interclub.equipe (rencontre_id, club_id, nom) values (%L, null, 'Équipe 1')$$, :'rid'));
-- R11/R12 : 4 grimpeurs de deux clubs, le 5ᵉ refusé.
select pg_temp.essai('R11-compo-inter-clubs-OK', true,
  format($$insert into interclub.composition (equipe_id, grimpeur_id) values
    (%1$L, 'a0000000-0000-0000-0000-0000000000a3'), (%1$L, 'a0000000-0000-0000-0000-0000000000a4'),
    (%1$L, 'a0000000-0000-0000-0000-0000000000a5'), (%1$L, 'b0000000-0000-0000-0000-0000000000b1')$$, :'eq1'));
insert into interclub.composition (equipe_id, grimpeur_id) values
  (:'eq1', 'a0000000-0000-0000-0000-0000000000a3'), (:'eq1', 'a0000000-0000-0000-0000-0000000000a4'),
  (:'eq1', 'a0000000-0000-0000-0000-0000000000a5'), (:'eq1', 'b0000000-0000-0000-0000-0000000000b1');
select pg_temp.essai('R12-5e-grimpeur-KO', false,
  format($$insert into interclub.composition (equipe_id, grimpeur_id) values (%L, 'a0000000-0000-0000-0000-0000000000a6')$$, :'eq1'));
reset role;

-- R10 : le coach n'écrit rien sur les équipes d'une rencontre adulte.
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', true); set role authenticated;
select pg_temp.essai('R10-coach-equipe-son-club-KO', false,
  format($$insert into interclub.equipe (rencontre_id, club_id, nom) values (%L, '11111111-1111-1111-1111-111111111111', 'Coach')$$, :'rid'));
select pg_temp.essai('R10-coach-equipe-sans-club-KO', false,
  format($$insert into interclub.equipe (rencontre_id, club_id, nom) values (%L, null, 'Coach')$$, :'rid'));
-- Un DELETE filtré par la RLS ne lève rien : on teste l'INSERT (refus explicite)
-- et on vérifie plus bas que la composition est intacte.
select pg_temp.essai('R10-coach-compose-KO', false,
  format($$insert into interclub.composition (equipe_id, grimpeur_id) values (%L, 'a0000000-0000-0000-0000-0000000000a6')$$, :'eq1'));
delete from interclub.composition where equipe_id = :'eq1';
reset role;
select pg_temp.verif('R10-compo-intacte-apres-coach',
  (select count(*)::text from interclub.composition where equipe_id = :'eq1'), '4');

-- R28 : l'écran juge liste les adultes, avec leur club d'origine.
select e.id as evit from interclub.epreuve e where e.rencontre_id = :'rid' and e.type = 'vitesse' \gset
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;
select pg_temp.verif('R28-roster-juge-clubs-origine',
  (select string_agg(club_nom, ',' order by club_nom) from interclub.liste_grimpeurs_vitesse(:'evit')),
  'Club A,Club A,Club A,Club B');
reset role;

-- ---- Restitution --------------------------------------------------------
\echo '--- Détail des assertions ---'
select id, attendu, obtenu, case when ok then 'OK' else 'KO' end as verdict from pg_temp._res order by id;
select 'ADULTE RESULT: ' || count(*) filter (where ok) || ' OK / ' || count(*) filter (where not ok) || ' KO' as bilan
  from pg_temp._res;

rollback;
SQL
)
STATUS=$?

echo "$OUT"

if [ $STATUS -ne 0 ]; then
  echo "Échec d'exécution SQL (stack locale démarrée ? npm run db:reset lancé ?)" >&2
  exit 2
fi

if echo "$OUT" | grep -qE 'ADULTE RESULT: [0-9]+ OK / 0 KO'; then
  echo "✅ Spec #20 (lots 1, 3 et 4) : toutes les assertions BDD passent."
  exit 0
else
  echo "❌ Spec #20 (lots 1, 3 et 4) : au moins une assertion BDD a échoué (voir le détail ci-dessus)." >&2
  exit 1
fi
