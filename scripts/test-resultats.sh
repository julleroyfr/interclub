#!/usr/bin/env bash
#
# Tests automatisés de la SAISIE DES RÉSULTATS (spec #6) contre la stack Supabase
# LOCALE. Couvre les règles ENFORÇABLES EN BASE (triggers, contraintes, RLS) du
# cahier `docs/tests/17-saisie-resultats.cahier.md` :
#   - R10  : « prise_valorisee » réservée aux voies TÊTE ENFANT (trigger)      → CT-04/CT-05
#   - R12  : « zone1 »/« zone2 » réservées à la catégorie ADO (trigger)        → CT-07
#   - R13  : une seule issue par (voie, grimpeur) — contrainte unique          → CT-06
#   - R16  : le palier choisi appartient au bloc (trigger)                     → CT-09
#   - R16  : issue='palier' ⇔ palier_id renseigné (contrainte CHECK)           → CT-09
#   - R17  : un seul résultat par (bloc, grimpeur) — contrainte unique         → CT-09
#   - R5/R7: écriture réservée au coach habilité EN COMPÉTITION                → CT-10/CT-11
#   - R6/R8: LECTURE ouverte à tout authentifié, tous clubs, DÈS la ③          → CT-13
#
# Les règles applicatives (R9 groupe de départ, R11 voies ado distinctes, R14
# plafond 6, R18 NP à la clôture, R20 compteur) sont couvertes par le domaine pur
# (`src/domaine/resultat.test.ts`, Vitest). Le rendu (pastilles, deux vues,
# navigation ‹/›, vitesse en lecture seule) reste MANUEL (CT-02/03/14).
#
# Approche : impersonation en base (SET ROLE authenticated + claim JWT `sub`)
# dans UNE transaction annulée à la fin. `essai()` teste une écriture (succès réel
# vs attendu) ; `lire()` teste une lecture (visibilité réelle vs attendue). Aucune
# donnée n'est laissée en base (rollback global).
#
# Pré-requis : `supabase start` puis `supabase db reset` (migrations + seed 01),
#              migration `202609081000_saisie_resultats_voie_bloc` incluse.
# Usage      : bash scripts/test-resultats.sh   (ou : npm run test:resultats)

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
create temp table _res(id text, attendu boolean, obtenu boolean, ok boolean) on commit drop;
grant insert on pg_temp._res to authenticated;

-- essai() : tente p_sql, annule l'effet, enregistre succès réel vs attendu.
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

-- lire() : exécute un `select count(*)`, compare (count>0) au visible attendu.
create or replace function pg_temp.lire(p_id text, p_attendu_visible boolean, p_sql text)
returns void language plpgsql as $fn$
declare v_n bigint; v_vis boolean;
begin
  execute p_sql into v_n;
  v_vis := (v_n > 0);
  insert into pg_temp._res values (p_id, p_attendu_visible, v_vis, p_attendu_visible = v_vis);
end $fn$;

-- ---- Fixtures (superuser, RLS contournée) -------------------------------
-- Le seed 01 fournit désormais, sur la rencontre ENFANT 33333333 (compétition),
-- la structure COMPLÈTE : voies moulinette M1 (…9911)…M4 et tête T1 (…9901)…T10 ;
-- blocs B1 (…9902) + B2 (…9903) avec leurs paliers (B1 « 1er essai » = …99a1).
-- On les réutilise tels quels ; seule la catégorie ADO (R12) reste à créer ici,
-- plus des résultats persistés (matière pour la LECTURE R6/R8 et l'UNICITÉ R13/R17).

-- Rencontre ADO (club A, compétition) + épreuve voie + voie tête ado.
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
values ('d3333333-3333-3333-3333-333333333330', '2026-09-19',
        '11111111-1111-1111-1111-111111111111', 'ado', 'competition');
insert into interclub.epreuve (id, rencontre_id, type)
values ('d8888888-8888-8888-8888-888888888801', 'd3333333-3333-3333-3333-333333333330', 'voie');
insert into interclub.voie_difficulte
  (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_zone1, points_zone2)
values ('d9999999-9999-9999-9999-999999999901', 'd8888888-8888-8888-8888-888888888801',
        'T6', 'tete', '6a', 6, 8, 2, 4);

-- Résultats persistés (matière pour LECTURE R6/R8 et UNICITÉ R13/R17).
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
values ('99999999-9999-9999-9999-999999999901', 'a0000000-0000-0000-0000-0000000000a1', 'top');
insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue)
values ('99999999-9999-9999-9999-999999999902', 'a0000000-0000-0000-0000-0000000000a2', 'echec');

-- =========================================================================
-- BLOC 1 — Triggers de cohérence issue ↔ catégorie / type de voie (admin).
--   L'admin contourne la RLS d'écriture ; SEULS les triggers doivent statuer.
-- =========================================================================
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true); set role authenticated;

-- R10 — « prise_valorisee » : voies tête ENFANT uniquement.
select pg_temp.essai('R10-pv-tete-enfant-OK',   true,  $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','prise_valorisee')$$);
select pg_temp.essai('R10-pv-moulinette-KO',     false, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999911','a0000000-0000-0000-0000-0000000000a2','prise_valorisee')$$);
select pg_temp.essai('R10-pv-tete-ado-KO',       false, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('d9999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','prise_valorisee')$$);

-- R12 — « zone1 »/« zone2 » : catégorie ADO uniquement.
select pg_temp.essai('R12-zone2-ado-OK',         true,  $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('d9999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','zone2')$$);
select pg_temp.essai('R12-zone1-enfant-KO',      false, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','zone1')$$);

-- Issues neutres admises partout (top / echec / np).
select pg_temp.essai('base-top-moulinette-OK',   true,  $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999911','a0000000-0000-0000-0000-0000000000a2','top')$$);
select pg_temp.essai('base-np-tete-ado-OK',      true,  $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('d9999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','np')$$);

-- R13 — une seule issue par (voie, grimpeur) : (9901, Ana) existe déjà (top).
select pg_temp.essai('R13-doublon-voie-KO',      false, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a1','echec')$$);
select pg_temp.essai('R13-correction-update-OK', true,  $$update interclub.resultat_voie set issue='echec' where voie_difficulte_id='99999999-9999-9999-9999-999999999901' and grimpeur_id='a0000000-0000-0000-0000-0000000000a1'$$);

-- R16 — palier ↔ bloc : palier de B1 (99a1) interdit sur B2 (9903).
select pg_temp.essai('R16-palier-bon-bloc-OK',   true,  $$insert into interclub.resultat_bloc (bloc_id,grimpeur_id,issue,palier_id) values ('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a1','palier','99999999-9999-9999-9999-9999999999a1')$$);
select pg_temp.essai('R16-palier-mauvais-bloc-KO',false,$$insert into interclub.resultat_bloc (bloc_id,grimpeur_id,issue,palier_id) values ('99999999-9999-9999-9999-999999999903','a0000000-0000-0000-0000-0000000000a1','palier','99999999-9999-9999-9999-9999999999a1')$$);

-- R16 (CHECK) — issue='palier' ⇔ palier_id renseigné.
select pg_temp.essai('R16-palier-sans-id-KO',    false, $$insert into interclub.resultat_bloc (bloc_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a1','palier')$$);
select pg_temp.essai('R16-echec-avec-id-KO',     false, $$insert into interclub.resultat_bloc (bloc_id,grimpeur_id,issue,palier_id) values ('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a1','echec','99999999-9999-9999-9999-9999999999a1')$$);
select pg_temp.essai('R16-echec-sans-id-OK',     true,  $$insert into interclub.resultat_bloc (bloc_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999903','a0000000-0000-0000-0000-0000000000a1','echec')$$);

-- R17 — un seul résultat par (bloc, grimpeur) : (B1, Bob) existe déjà (echec).
select pg_temp.essai('R17-doublon-bloc-KO',      false, $$insert into interclub.resultat_bloc (bloc_id,grimpeur_id,issue,palier_id) values ('99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a2','palier','99999999-9999-9999-9999-9999999999a1')$$);
reset role;

-- =========================================================================
-- BLOC 2 — Écriture réservée au coach habilité EN COMPÉTITION (R5/R7) — CT-11.
-- =========================================================================
-- Coach permanent Club A : autorisé en compétition.
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', true); set role authenticated;
select pg_temp.essai('R7-coachA-ecrit-competition-OK', true, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top')$$);
reset role;

-- Passage en PRÉPARATION : plus aucune écriture de résultat (R5).
update interclub.rencontre set phase='preparation' where id='33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', true); set role authenticated;
select pg_temp.essai('R5-coachA-ecrit-preparation-KO', false, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top')$$);
reset role;
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';

-- =========================================================================
-- BLOC 3 — Lecture au fil de l'eau, tous clubs, dès la ③ (R6/R8) — CT-13.
--   `sansmapping` : authentifié, AUCUN rôle/club. Ne doit jamais écrire, mais
--   VOIT les résultats dès la ③.
-- =========================================================================
-- En COMPÉTITION : lecture visible, écriture refusée.
select set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555"}', true); set role authenticated;
select pg_temp.lire('CT13-lit-voie-en-competition-VISIBLE', true, $$select count(*) from interclub.resultat_voie rv join interclub.voie_difficulte vd on vd.id=rv.voie_difficulte_id where vd.epreuve_id='88888888-8888-8888-8888-888888888801'$$);
select pg_temp.lire('CT13-lit-bloc-en-competition-VISIBLE', true, $$select count(*) from interclub.resultat_bloc rb join interclub.bloc b on b.id=rb.bloc_id where b.epreuve_id='88888888-8888-8888-8888-888888888802'$$);
select pg_temp.essai('CT13-sansmapping-ecrit-KO', false, $$insert into interclub.resultat_voie (voie_difficulte_id,grimpeur_id,issue) values ('99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a2','top')$$);
reset role;

-- En PRÉ-COMPÉTITION : plus rien de visible (avant la ③).
update interclub.rencontre set phase='pre_competition' where id='33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555"}', true); set role authenticated;
select pg_temp.lire('CT13-lit-voie-avant-③-INVISIBLE', false, $$select count(*) from interclub.resultat_voie rv join interclub.voie_difficulte vd on vd.id=rv.voie_difficulte_id where vd.epreuve_id='88888888-8888-8888-8888-888888888801'$$);
reset role;
update interclub.rencontre set phase='competition' where id='33333333-3333-3333-3333-333333333333';

-- ---- Restitution --------------------------------------------------------
\echo '--- Détail des assertions ---'
select id, attendu, obtenu, case when ok then 'OK' else 'KO' end as verdict from pg_temp._res order by id;
select 'RESULTATS RESULT: ' || count(*) filter (where ok) || ' OK / ' || count(*) filter (where not ok) || ' KO' as bilan
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

if echo "$OUT" | grep -qE 'RESULTATS RESULT: [0-9]+ OK / 0 KO'; then
  echo "✅ Spec #6 : toutes les assertions BDD (triggers, contraintes, RLS) passent."
  exit 0
else
  echo "❌ Spec #6 : au moins une assertion BDD a échoué (voir le détail ci-dessus)." >&2
  exit 1
fi
