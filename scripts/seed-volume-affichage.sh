#!/usr/bin/env bash
#
# Charge ~100 grimpeurs (composés + résultats voie/bloc variés) sur la rencontre
# ENFANT du seed (JD-RENCONTRE-ENFANT, 33333333-…-3333) pour tester à l'échelle
# réelle l'écran d'affichage secondaire (spec #14, ~100 grimpeurs par rencontre,
# R12b de la spec #7). Données de VOLUME uniquement — jetables, plage d'UUID
# dédiée (grimpeurs `c0000000-…`, équipes `e0000000-…`), aucun conflit avec le
# seed `01-jeu-de-test.sql` ni avec les cahiers existants.
#
# Idempotent : ON CONFLICT DO NOTHING sur les insertions, DELETE avant re-seed
# pour les résultats (pour pouvoir relancer après un `supabase db reset`).
# Purge  : bash scripts/seed-volume-affichage.sh --purge
#
# Pré-requis : `supabase start` puis `supabase db reset` (seed 01 chargé).
# Usage      : bash scripts/seed-volume-affichage.sh [--purge]

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

if [ "${1:-}" = "--purge" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
delete from interclub.grimpeur where id::text like 'c0000000-%';
delete from interclub.equipe where id::text like 'e0000000-%';
SQL
  echo "Purgé (grimpeurs c0000000-… et équipes e0000000-… retirés)."
  exit 0
fi

docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;

-- ---- 1. Équipes de volume (14, alternant Club A / Club B) -----------------
insert into interclub.equipe (id, rencontre_id, club_id, nom)
select
  ('e0000000-0000-0000-0000-' || lpad(k::text, 12, '0'))::uuid,
  '33333333-3333-3333-3333-333333333333',
  (case when k % 2 = 0
    then '11111111-1111-1111-1111-111111111111'  -- Club A
    else '22222222-2222-2222-2222-222222222222'  -- Club B
  end)::uuid,
  'Équipe Volume ' || k
from generate_series(1, 14) as k
on conflict (id) do nothing;

-- ---- 2. 100 grimpeurs (sexe alterné F/H, noms/prénoms variés) -------------
with noms(nom) as (
  values ('Petit'),('Roux'),('Girard'),('Fontaine'),('Chevalier'),('Robin'),
         ('Masson'),('Sanchez'),('Gauthier'),('Martinez'),('Lefevre'),('Meyer'),
         ('Renard'),('Dumas'),('Lambert'),('Bonnet'),('Francois'),('Rousseau')
), prenoms_f(prenom) as (
  values ('Alice'),('Camille'),('Elise'),('Julie'),('Sarah'),('Nina'),('Lola'),
         ('Maya'),('Rose'),('Lucie'),('Eva'),('Zoe'),('Mila'),('Nora'),('Alix')
), prenoms_h(prenom) as (
  values ('Lucas'),('Nathan'),('Theo'),('Hugo'),('Ethan'),('Sacha'),('Leo'),
         ('Axel'),('Timeo'),('Mael'),('Noe'),('Gabin'),('Ilan'),('Yanis'),('Elio')
)
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select
  ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  (case when n % 2 = 0
    then '11111111-1111-1111-1111-111111111111'
    else '22222222-2222-2222-2222-222222222222'
  end)::uuid,
  (select nom from noms offset (n % 18) limit 1),
  case when n % 2 = 0
    then (select prenom from prenoms_f offset (n % 15) limit 1)
    else (select prenom from prenoms_h offset (n % 15) limit 1)
  end,
  case when n % 2 = 0 then 2015 else 2016 end,
  case when n % 2 = 0 then 'F' else 'H' end,
  200000 + n
from generate_series(1, 100) as n
on conflict (id) do nothing;

-- ---- 3. Composition : chaque grimpeur dans une équipe de volume -----------
insert into interclub.composition (equipe_id, grimpeur_id)
select
  ('e0000000-0000-0000-0000-' || lpad(((n % 14) + 1)::text, 12, '0'))::uuid,
  ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1, 100) as n
on conflict (equipe_id, grimpeur_id) do nothing;

-- ---- 4. Résultats voie : une issue par grimpeur, variée -------------------
delete from interclub.resultat_voie
 where grimpeur_id::text like 'c0000000-%';

with voies as (
  select id, niveau, type_voie, row_number() over (order by ordre) - 1 as rang
    from interclub.voie_difficulte
   where epreuve_id = '88888888-8888-8888-8888-888888888801'
)
insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue)
select
  v.id,
  ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  case
    when n % 5 = 4 then 'np'
    when n % 5 = 3 then 'echec'
    when n % 5 = 2 and v.type_voie = 'tete' then 'prise_valorisee'
    else 'top'
  end
from generate_series(1, 100) as n
join voies v on v.rang = (n % 14)
on conflict (voie_difficulte_id, grimpeur_id) do nothing;

-- ---- 5. Résultats bloc : un essai par grimpeur, varié ---------------------
delete from interclub.resultat_bloc
 where grimpeur_id::text like 'c0000000-%';

with paliers as (
  select id, bloc_id, ordre
    from interclub.bloc_palier
   where bloc_id in (
     '99999999-9999-9999-9999-999999999902',
     '99999999-9999-9999-9999-999999999903'
   )
)
insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id)
select
  (case when n % 2 = 0
    then '99999999-9999-9999-9999-999999999902'
    else '99999999-9999-9999-9999-999999999903'
  end)::uuid,
  ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  case when n % 3 = 2 then 'echec' else 'palier' end,
  case when n % 3 = 2 then null
       else (
         select p.id from paliers p
          where p.bloc_id = (case when n % 2 = 0
            then '99999999-9999-9999-9999-999999999902'
            else '99999999-9999-9999-9999-999999999903'
          end)::uuid
          order by p.ordre
          offset (n % 3) limit 1
       )
  end
from generate_series(1, 100) as n
on conflict (bloc_id, grimpeur_id) do nothing;

commit;

select
  (select count(*) from interclub.grimpeur where id::text like 'c0000000-%') as grimpeurs,
  (select count(*) from interclub.composition where grimpeur_id::text like 'c0000000-%') as composes,
  (select count(*) from interclub.resultat_voie where grimpeur_id::text like 'c0000000-%') as resultats_voie,
  (select count(*) from interclub.resultat_bloc where grimpeur_id::text like 'c0000000-%') as resultats_bloc;
SQL

echo "Volume chargé sur la rencontre enfant 33333333-…-3333."
echo "→ http://localhost:3000/admin/rencontres/33333333-3333-3333-3333-333333333333/affichage"
echo "Purge : bash scripts/seed-volume-affichage.sh --purge"
