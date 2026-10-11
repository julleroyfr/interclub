-- Jeu de données de VOLUME (opt-in) — ~50 grimpeurs pour tester le calcul du
-- score et la mise à jour des classements (spec #7) à l'échelle.
--
-- ⚠️ NON chargé automatiquement au `supabase db reset` : il n'est PAS dans
--    `config.toml` → `[db.seed].sql_paths` (qui ne charge que 01). Sinon il
--    fausserait les rosters attendus par les cahiers 18 / 20. À appliquer
--    MANUELLEMENT quand on veut un volume (SQL Editor local, après 01).
--
-- Contenu : 51 grimpeurs répartis Club A / Club B, sexes mixtes, dont
--   - 34 (2/3) engagés sur la rencontre ENFANT (33333333…) : équipes A1/A2 (A),
--     B1 (B), avec un groupe de départ (M1–M4) ;
--   - 17 (1/3) engagés sur la rencontre ADO (adadadad…) : équipes « Ados A1 » (A)
--     et « Ados B1 » (B, créée ici), en choix libre (pas de groupe de départ).
-- UUID marqués `c0c0c0c0-…` (purgeables : la purge 99 supprime les grimpeurs des
-- clubs A/B et les équipes des rencontres de test). Idempotent (on conflict).

-- Équipe ADO manquante côté Club B (accueil des ados du Club B).
insert into interclub.equipe (id, nom, club_id, rencontre_id) values
  (
    'adadadad-0000-0000-0000-00000000e002',
    'Ados B1',
    '22222222-2222-2222-2222-222222222222',
    'adadadad-adad-adad-adad-adadadadadad'
  )
on conflict (id) do nothing;

-- 51 grimpeurs. club = pair→B / impair→A ; sexe = FFGG (i%4) pour mixer les deux
-- sexes DANS chaque club ; année selon enfant (2014–2016) / ado (2008–2012).
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe, licence)
select
  ('c0c0c0c0-0000-0000-0000-' || lpad(to_hex(i), 12, '0'))::uuid,
  (case when i % 2 = 0 then '22222222-2222-2222-2222-222222222222'
        else '11111111-1111-1111-1111-111111111111' end)::uuid,
  (array[
    'Martin','Bernard','Dubois','Thomas','Robert','Petit','Durand','Leroy',
    'Moreau','Simon','Laurent','Michel','Garcia','David','Bertrand','Roux',
    'Vincent','Fournier','Morel','Girard','Andre','Lefevre','Mercier','Blanc',
    'Guerin','Boyer','Garnier','Chevalier','Francois','Legrand','Gauthier',
    'Perrin','Robin','Clement','Morin','Nicolas','Henry','Rousseau','Mathieu',
    'Gautier','Masson','Marchand','Duval','Denis','Dumont','Marie','Lemaire',
    'Noel','Meyer','Dufour','Meunier','Blanchard'
  ])[1 + (i % 52)],
  (array[
    'Lea','Emma','Jade','Louis','Hugo','Lucas','Manon','Chloe','Ines','Lina',
    'Adam','Nael','Tom','Sacha','Mia','Zoe','Noe','Eli','Anna','Nora','Ethan',
    'Liam','Maya','Rose','Jules','Leo','Alix','Kais','Yanis','Sara'
  ])[1 + (i % 30)],
  case when i <= 34 then 2014 + (i % 3) else 2008 + (i % 5) end,
  case when (i % 4) < 2 then 'F' else 'H' end,
  200000 + i  -- licence unique (spec #3 R21b), distincte du seed 01 (100001+)
from generate_series(1, 51) as i
on conflict (id) do nothing;

-- Compositions : rattache chaque grimpeur à une équipe (rencontre_id posé par
-- trigger). Enfant (i ≤ 34) : Club A → A1 (i%4=1) / A2, Club B → B1, avec groupe
-- de départ. Ado (i > 34) : Club A → Ados A1, Club B → Ados B1, sans groupe.
insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart)
select
  (case
    when i <= 34 and i % 2 <> 0 and i % 4 = 1
      then '66666666-6666-6666-6666-666666666666'  -- enfant Club A → Équipe A1
    when i <= 34 and i % 2 <> 0
      then '66666666-6666-6666-6666-666666666602'  -- enfant Club A → Équipe A2
    when i <= 34
      then '77777777-7777-7777-7777-777777777777'  -- enfant Club B → Équipe B1
    when i % 2 <> 0
      then 'adadadad-0000-0000-0000-00000000e001'  -- ado Club A → Ados A1
    else 'adadadad-0000-0000-0000-00000000e002'    -- ado Club B → Ados B1
  end)::uuid,
  ('c0c0c0c0-0000-0000-0000-' || lpad(to_hex(i), 12, '0'))::uuid,
  case when i <= 34 then (array['M1','M2','M3','M4'])[1 + (i % 4)] else null end
from generate_series(1, 51) as i
on conflict do nothing;
