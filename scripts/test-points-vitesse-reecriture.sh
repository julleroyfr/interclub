#!/usr/bin/env bash
#
# Tests du recalcul des points de vitesse SANS réécriture (constat R1 de
# l'analyse du 2026-11-10, lot 10 ; migration 202611101200). Un temps saisi
# recalcule toute l'épreuve (spec #10 R20), mais seules les lignes dont le rang
# ou les points changent sont écrites : c'est ce qui borne les évènements temps
# réel envoyés aux écrans abonnés à `points_vitesse`.
#
#   - RV-01 : temps le plus lent ajouté → aucune ligne existante réécrite.
#   - RV-02 : temps modifié sans changement de rang → aucune ligne réécrite.
#   - RV-03 : nouveau meilleur temps (F) → seules les F classées au temps sont
#             réécrites (8), aucune ligne H.
#   - RV-04 : points identiques à un recalcul complet (comportement inchangé).
#   - RV-05 : rejeu idempotent de la migration (archivée, retour arrière supprimé).
#
# Le nombre d'UPDATE est compté par un trigger posé DANS la transaction, annulée
# à la fin : la base locale n'est pas modifiée.
#
# Pré-requis : `supabase start` (seed 01 chargé : club A).
# Usage      : bash scripts/test-points-vitesse-reecriture.sh   (ou : npm run test:points-vitesse-reecriture)

set -uo pipefail

command -v docker >/dev/null 2>&1 || export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
CONTENEUR="${SUPABASE_DB_CONTAINER:-supabase_db_interclub}"
PASS=0
FAIL=0
ok() { printf '  \033[32m[OK]\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  \033[31m[KO]\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

SQL=$(cat <<'EOSQL'
\set ON_ERROR_STOP 1
begin;

create temp table _res (id text, attendu text, obtenu text, ok boolean);
create or replace function pg_temp.verif(p_id text, p_attendu text, p_obtenu text)
returns void language sql as $fn$
  insert into pg_temp._res values (p_id, p_attendu, coalesce(p_obtenu, '∅'), p_attendu = coalesce(p_obtenu, '∅'));
$fn$;

-- Compteur d'UPDATE sur points_vitesse (trigger annulé avec la transaction).
create table public._rv_updates (grimpeur_id uuid);
create function public._rv_compter() returns trigger language plpgsql as $fn$
begin
  insert into public._rv_updates values (new.grimpeur_id);
  return new;
end;
$fn$;
create trigger _rv_compter after update on interclub.points_vitesse
  for each row execute function public._rv_compter();

-- ---- Jeu d'essai : 7 F au temps, 1 chute, 1 NP ; 2 H -----------------------
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
values ('e8e8e8e8-0000-0000-0000-000000000001', '2026-11-07',
        '11111111-1111-1111-1111-111111111111', 'enfant', 'competition');
insert into interclub.epreuve (id, rencontre_id, type, points_chute, points_non_presentation)
values ('e8e8e8e8-0000-0000-0000-000000000003', 'e8e8e8e8-0000-0000-0000-000000000001',
        'vitesse', 3, 1);
insert into interclub.bareme_vitesse_echelon (epreuve_id, rang_min, rang_max, points, decrement, ordre) values
  ('e8e8e8e8-0000-0000-0000-000000000003', 1, null, 30, 2, 1);
insert into interclub.equipe (id, rencontre_id, club_id, nom)
values ('e8e8e8e8-0000-0000-0000-000000000002', 'e8e8e8e8-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Essai réécriture');
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select ('e8e8e8e8-0000-0000-0000-0000000000' || code)::uuid,
       '11111111-1111-1111-1111-111111111111', 'Reecriture', code, 2015, sexe, 980000 + n
  from (values ('f1','F',1),('f2','F',2),('f3','F',3),('f4','F',4),('f5','F',5),
               ('f6','F',6),('f7','F',7),('f8','F',8),('f9','F',9),('fa','F',10),('fb','F',11),
               ('d1','H',12),('d2','H',13)) as t(code, sexe, n);
insert into interclub.composition (equipe_id, grimpeur_id)
select 'e8e8e8e8-0000-0000-0000-000000000002', id
  from interclub.grimpeur where nom = 'Reecriture';
insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
select 'e8e8e8e8-0000-0000-0000-000000000003',
       ('e8e8e8e8-0000-0000-0000-0000000000' || code)::uuid, issue, temps
  from (values ('f1','temps',8.0),('f2','temps',9.0),('f3','temps',9.0),('f4','temps',10.0),
               ('f5','temps',15.0),('f6','temps',16.0),('f7','temps',17.0),
               ('f8','chute',null),('f9','non_presentation',null),
               ('d1','temps',7.5),('d2','temps',12.0)) as t(code, issue, temps);

-- ---- RV-01 : temps le plus lent ajouté → 0 réécriture ---------------------
truncate public._rv_updates;
insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
values ('e8e8e8e8-0000-0000-0000-000000000003', 'e8e8e8e8-0000-0000-0000-0000000000fa', 'temps', 30.0);
select pg_temp.verif('RV-01 temps le plus lent : lignes réécrites', '0',
                     (select count(*)::text from public._rv_updates));
select pg_temp.verif('RV-01 nouvelle ligne créée (rang 8)', '8',
                     (select rang::text from interclub.points_vitesse
                       where grimpeur_id = 'e8e8e8e8-0000-0000-0000-0000000000fa'));

-- ---- RV-02 : temps modifié sans changement de rang → 0 réécriture ---------
truncate public._rv_updates;
update interclub.temps_vitesse set temps = 17.5
 where grimpeur_id = 'e8e8e8e8-0000-0000-0000-0000000000f7';
select pg_temp.verif('RV-02 rang inchangé : lignes réécrites', '0',
                     (select count(*)::text from public._rv_updates));

-- ---- RV-03 : nouveau meilleur temps F → seules les F au temps bougent ------
truncate public._rv_updates;
insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
values ('e8e8e8e8-0000-0000-0000-000000000003', 'e8e8e8e8-0000-0000-0000-0000000000fb', 'temps', 7.0);
select pg_temp.verif('RV-03 lignes réécrites = F classées au temps', '8',
                     (select count(*)::text from public._rv_updates));
select pg_temp.verif('RV-03 aucune ligne H ni chute/NP réécrite', '0',
                     (select count(*)::text from public._rv_updates u
                        join interclub.grimpeur g on g.id = u.grimpeur_id
                       where g.sexe = 'H' or g.prenom in ('f8', 'f9')));

-- ---- RV-04 : identique à un recalcul complet --------------------------------
create temp table _avant as
  select grimpeur_id, rang, points from interclub.points_vitesse
   where epreuve_id = 'e8e8e8e8-0000-0000-0000-000000000003';
delete from interclub.points_vitesse where epreuve_id = 'e8e8e8e8-0000-0000-0000-000000000003';
select interclub.recalculer_points_vitesse('e8e8e8e8-0000-0000-0000-000000000003');
select pg_temp.verif('RV-04 points identiques au recalcul complet', '0',
  (select count(*)::text from (
     (select grimpeur_id, rang, points from _avant
      except select grimpeur_id, rang, points from interclub.points_vitesse
              where epreuve_id = 'e8e8e8e8-0000-0000-0000-000000000003')
     union all
     (select grimpeur_id, rang, points from interclub.points_vitesse
       where epreuve_id = 'e8e8e8e8-0000-0000-0000-000000000003'
      except select grimpeur_id, rang, points from _avant)) d));
select pg_temp.verif('RV-04 une ligne par grimpeur saisi', '13',
                     (select count(*)::text from _avant));

select (case when ok then 'OK' else 'KO' end) || '|' || id || '|' || attendu || '|' || obtenu
  from pg_temp._res order by id;
rollback;
EOSQL
)

echo "== Recalcul des points de vitesse sans réécriture =="
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

echo "== RV-05 Migration rejouée (idempotence) =="
VERSION="202611101200_points_vitesse_sans_reecriture"
MIGRATION="supabase/migrations/archive/$VERSION.sql"
sql() { docker exec "$CONTENEUR" psql -U postgres -tA -v ON_ERROR_STOP=1 -c "$1"; }
appliquer() { docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1" >/dev/null 2>&1; }
etat() {
  sql "select (pg_get_functiondef('interclub.recalculer_points_vitesse(uuid)'::regprocedure) like '%is distinct from%')::text
              || '/' || (select count(*) from interclub.version where version = '$VERSION');"
}
verifie() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 — obtenu « $2 », attendu « $3 »"; fi; }
if appliquer "$MIGRATION"; then ok "rejeu de la migration"; else ko "rejeu de la migration en erreur"; fi
verifie "fonction sans réécriture, version enregistrée" "$(etat)" "true/1"

echo
echo "Résultat : $PASS OK, $FAIL KO"
[ "$FAIL" -eq 0 ]
