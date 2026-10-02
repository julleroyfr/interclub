#!/usr/bin/env bash
#
# Crée deux rencontres COMPLÈTES en phase ④ CLÔTURE pour tester le contrôle des
# résultats contre les fiches de juges (spec #16, cahier 27) à l'échelle réelle :
#
#   - ENFANT du 26/09/2026 (porteur Club C) : 100 grimpeurs, 4 clubs, groupes de
#     départ variés → 3 voies chacun, B1 + B2 pour TOUS, vitesse ; NP posés sur
#     les attendus non réalisés (comme la clôture, spec #6 R18) ;
#   - ADO du 27/09/2026 (porteur Club D) : 60 grimpeurs, 4 clubs, 4 à 6 voies au
#     choix (zones), B1 + B2 pour TOUS, vitesse ; pas de NP sur les voies ado.
#
# Structure (voies, blocs, paliers, barème) copiée des GABARITS via la RPC
# `creer_rencontre_avec_gabarit`. Quelques grimpeurs PRÊTÉS (équipe d'un autre
# club). Données jetables, plages d'UUID dédiées : clubs `f1000000-…`,
# grimpeurs `d0000000-…` (enfant) / `d1000000-…` (ado).
#
# Idempotent : supprime les deux rencontres (repérées par date + porteur) et
# leurs données avant de les recréer.
# Purge  : bash scripts/seed-controle-cloture.sh --purge
#
# Pré-requis : `supabase start` puis `supabase db reset` (seed 01 chargé).
# Usage      : bash scripts/seed-controle-cloture.sh [--purge]

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

PURGE_SQL=$(cat <<'SQL'
-- Rencontres de test (date + porteur) et toutes leurs données.
create temp table r_purge on commit drop as
  select id from interclub.rencontre
   where (date_rencontre, club_porteur_id) in (
     ('2026-09-26', 'f1000000-0000-0000-0000-00000000000c'),
     ('2026-09-27', 'f1000000-0000-0000-0000-00000000000d'));
delete from interclub.resultat_voie where voie_difficulte_id in (
  select vd.id from interclub.voie_difficulte vd
    join interclub.epreuve e on e.id = vd.epreuve_id where e.rencontre_id in (select id from r_purge));
delete from interclub.resultat_bloc where bloc_id in (
  select b.id from interclub.bloc b
    join interclub.epreuve e on e.id = b.epreuve_id where e.rencontre_id in (select id from r_purge));
delete from interclub.temps_vitesse where epreuve_id in (
  select id from interclub.epreuve where rencontre_id in (select id from r_purge));
delete from interclub.composition where rencontre_id in (select id from r_purge);
delete from interclub.equipe where rencontre_id in (select id from r_purge);
delete from interclub.rencontre where id in (select id from r_purge);
delete from interclub.grimpeur where id::text like 'd0000000-%' or id::text like 'd1000000-%';
SQL
)

if [ "${1:-}" = "--purge" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 <<SQL
begin;
$PURGE_SQL
delete from interclub.club where id::text like 'f1000000-%';
commit;
SQL
  echo "Purgé (rencontres du 26/09 et 27/09/2026, grimpeurs d0/d1…, clubs C/D)."
  exit 0
fi

docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 <<SQL
begin;
$PURGE_SQL

-- ---- Clubs supplémentaires (4 clubs au total : A, B, C, D) -----------------
insert into interclub.club (id, nom) values
  ('f1000000-0000-0000-0000-00000000000c', 'Club C — Vertige Mérignac'),
  ('f1000000-0000-0000-0000-00000000000d', 'Club D — Roc Pessac')
on conflict (id) do nothing;

do \$\$
declare
  clubs uuid[] := array[
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'f1000000-0000-0000-0000-00000000000c',
    'f1000000-0000-0000-0000-00000000000d']::uuid[];
  noms text[] := array['Petit','Roux','Girard','Fontaine','Chevalier','Robin','Masson',
    'Sanchez','Gauthier','Martinez','Lefèvre','Meyer','Renard','Dumas','Lambert','Bonnet',
    'François','Rousseau','Écuyer','Mercier','Blanc','Guérin','Boyer','Garnier','Perrin',
    'Morin','Henry','Marchand','Duval','Denis','Dufour','Meunier','Brun','Lemaire'];
  pf text[] := array['Alice','Camille','Élise','Julie','Sarah','Nina','Lola','Maya','Rose',
    'Lucie','Eva','Zoé','Mila','Nora','Alix','Inès','Jade','Léna','Manon','Louise'];
  ph text[] := array['Lucas','Nathan','Théo','Hugo','Ethan','Sacha','Léo','Axel','Timéo',
    'Maël','Noé','Gabin','Ilan','Yanis','Élio','Tom','Arthur','Jules','Adam','Paul'];
  groupes text[] := array['M1','M2','M3','M4','T1','T2','T3','T4','T5','T6','T7','T8'];
  niveaux text[] := array['M1','M2','M3','M4','T1','T2','T3','T4','T5','T6','T7','T8','T9','T10'];
  r_enf uuid; r_ado uuid;
  ep_voie uuid; ep_bloc uuid; ep_vit uuid;
  g uuid; club uuid; club_equipe uuid; eq uuid;
  n int; k int; h int; idx int; nb int;
  v record; b record;
  issue text; pal uuid;
begin
  -- ===================== RENCONTRE ENFANT (④) =====================
  r_enf := interclub.creer_rencontre_avec_gabarit('2026-09-26', clubs[3], 'enfant');
  select id into ep_voie from interclub.epreuve where rencontre_id = r_enf and type = 'voie';
  select id into ep_bloc from interclub.epreuve where rencontre_id = r_enf and type = 'bloc';
  select id into ep_vit  from interclub.epreuve where rencontre_id = r_enf and type = 'vitesse';

  -- 4 équipes par club (« Enfants C1 »…).
  for k in 1..4 loop
    for idx in 1..4 loop
      insert into interclub.equipe (rencontre_id, club_id, nom)
      values (r_enf, clubs[k], 'Enfants ' || chr(64 + k) || idx);
    end loop;
  end loop;

  for n in 1..100 loop
    g := ('d0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
    club := clubs[(n % 4) + 1];
    insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
    values (g, club, noms[(n * 7 % array_length(noms, 1)) + 1],
            case when n % 2 = 0 then pf[(n % 20) + 1] else ph[(n % 20) + 1] end,
            2014 + (n % 3), case when n % 2 = 0 then 'F' else 'H' end, 300000 + n);
    -- Prêt : 1 grimpeur sur 17 court pour le club suivant.
    club_equipe := case when n % 17 = 0 then clubs[((n + 1) % 4) + 1] else club end;
    select id into eq from interclub.equipe
     where rencontre_id = r_enf and club_id = club_equipe
     order by nom offset (n / 4) % 4 limit 1;
    -- Groupe de départ : plutôt bas (débutants plus nombreux).
    idx := least(12, 1 + ((abs(hashtext('g' || n)) % 100) ^ 2)::int / 834);
    insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
    values (eq, g, groupes[idx]);

    -- 3 voies du groupe : Top / Prise valorisée (tête) / Échec / NP.
    for k in 0..2 loop
      select * into v from interclub.voie_difficulte
       where epreuve_id = ep_voie and niveau = niveaux[idx + k] order by ordre limit 1;
      h := abs(hashtext('v' || n || '-' || k)) % 100;
      issue := case when h < 6 then 'np'
                    when h < 30 then 'echec'
                    when h < 55 and v.type_voie = 'tete' then 'prise_valorisee'
                    else 'top' end;
      insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue, auteur_role)
      values (v.id, g, issue, case when issue = 'np' then null else 'coach' end);
    end loop;

    -- B1 et B2 pour tous : palier (meilleur essai) / Échec / NP.
    for b in select id from interclub.bloc where epreuve_id = ep_bloc order by ordre loop
      h := abs(hashtext('b' || n || b.id)) % 100;
      if h < 5 then issue := 'np'; pal := null;
      elsif h < 25 then issue := 'echec'; pal := null;
      else
        issue := 'palier';
        select id into pal from interclub.bloc_palier where bloc_id = b.id
         order by ordre offset (h % (select count(*) from interclub.bloc_palier where bloc_id = b.id)) limit 1;
      end if;
      insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id, auteur_role)
      values (b.id, g, issue, pal, case when issue = 'np' then null else 'coach' end);
    end loop;

    -- Vitesse : temps (8–30 s) / chute / non-présentation.
    h := abs(hashtext('t' || n)) % 100;
    insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps, auteur_role)
    values (ep_vit, g,
            case when h < 4 then 'non_presentation' when h < 12 then 'chute' else 'temps' end,
            case when h < 12 then null else round((8 + (h * 0.22))::numeric, 2) end, 'juge');
  end loop;

  update interclub.rencontre set phase = 'cloture' where id = r_enf;

  -- ===================== RENCONTRE ADO (④) =====================
  r_ado := interclub.creer_rencontre_avec_gabarit('2026-09-27', clubs[4], 'ado');
  select id into ep_voie from interclub.epreuve where rencontre_id = r_ado and type = 'voie';
  select id into ep_bloc from interclub.epreuve where rencontre_id = r_ado and type = 'bloc';
  select id into ep_vit  from interclub.epreuve where rencontre_id = r_ado and type = 'vitesse';

  for k in 1..4 loop
    for idx in 1..2 loop
      insert into interclub.equipe (rencontre_id, club_id, nom)
      values (r_ado, clubs[k], 'Ados ' || chr(64 + k) || idx);
    end loop;
  end loop;

  for n in 1..60 loop
    g := ('d1000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
    club := clubs[(n % 4) + 1];
    insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
    values (g, club, noms[(n * 11 % array_length(noms, 1)) + 1],
            case when n % 2 = 0 then pf[(n * 3 % 20) + 1] else ph[(n * 3 % 20) + 1] end,
            2009 + (n % 4), case when n % 2 = 0 then 'F' else 'H' end, 400000 + n);
    club_equipe := case when n % 19 = 0 then clubs[((n + 1) % 4) + 1] else club end;
    select id into eq from interclub.equipe
     where rencontre_id = r_ado and club_id = club_equipe
     order by nom offset (n / 4) % 2 limit 1;
    insert into interclub.composition (equipe_id, grimpeur_id) values (eq, g);

    -- 4 à 6 voies distinctes, choisies librement (fenêtre glissante sur T1–T10).
    nb := case when n % 7 = 0 then 4 when n % 5 = 0 then 5 else 6 end;
    idx := abs(hashtext('a' || n)) % 5;
    for v in select * from interclub.voie_difficulte where epreuve_id = ep_voie
              order by ordre offset idx limit nb loop
      h := abs(hashtext('va' || n || v.id)) % 100;
      issue := case when h < 25 then 'echec' when h < 45 then 'zone1'
                    when h < 70 then 'zone2' else 'top' end;
      insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue, auteur_role)
      values (v.id, g, issue, 'coach');
    end loop;

    for b in select id from interclub.bloc where epreuve_id = ep_bloc order by ordre loop
      h := abs(hashtext('ba' || n || b.id)) % 100;
      if h < 5 then issue := 'np'; pal := null;
      elsif h < 22 then issue := 'echec'; pal := null;
      else
        issue := 'palier';
        select id into pal from interclub.bloc_palier where bloc_id = b.id
         order by ordre offset (h % (select count(*) from interclub.bloc_palier where bloc_id = b.id)) limit 1;
      end if;
      insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id, auteur_role)
      values (b.id, g, issue, pal, case when issue = 'np' then null else 'coach' end);
    end loop;

    h := abs(hashtext('ta' || n)) % 100;
    insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps, auteur_role)
    values (ep_vit, g,
            case when h < 4 then 'non_presentation' when h < 12 then 'chute' else 'temps' end,
            case when h < 12 then null else round((6 + (h * 0.15))::numeric, 2) end, 'juge');
  end loop;

  update interclub.rencontre set phase = 'cloture' where id = r_ado;
end
\$\$;

commit;

select r.categorie, r.date_rencontre, r.phase, r.id,
  (select count(*) from interclub.composition c where c.rencontre_id = r.id) as grimpeurs,
  (select count(*) from interclub.resultat_voie rv join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
     join interclub.epreuve e on e.id = vd.epreuve_id where e.rencontre_id = r.id) as res_voie,
  (select count(*) from interclub.resultat_bloc rb join interclub.bloc bl on bl.id = rb.bloc_id
     join interclub.epreuve e on e.id = bl.epreuve_id where e.rencontre_id = r.id) as res_bloc,
  (select count(*) from interclub.temps_vitesse tv join interclub.epreuve e on e.id = tv.epreuve_id
     where e.rencontre_id = r.id) as vitesse
from interclub.rencontre r
where (r.date_rencontre, r.club_porteur_id) in (
  ('2026-09-26', 'f1000000-0000-0000-0000-00000000000c'),
  ('2026-09-27', 'f1000000-0000-0000-0000-00000000000d'))
order by r.date_rencontre;
SQL

echo "Rencontres de contrôle (④ clôture) prêtes — voir le tableau de bord admin."
echo "Purge : bash scripts/seed-controle-cloture.sh --purge"
