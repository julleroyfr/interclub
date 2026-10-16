-- ===========================================================================
-- 04-demo-repere-voies.sql — OPT-IN (non chargé au reset, cf. config.toml).
--
-- Démo du repère et du libellé des voies doublées (spec #3 R49/R50, spec #6
-- R21 ; cahier 12 CT-18). Deux rencontres ADO du Club A, Nora et Owen Delta
-- (seed 01) engagés dans l'équipe « Ados repère » :
--
--   1. aeaeaeae-…-000000000001 — ① pré-compétition (structure éditable) :
--        T5 ×3 : « T5 Jaune », « T5 Relais 12 », « T5 c » (sans repère)
--        T6 ×2 : « T6 a », « T6 b » (sans repère)
--   2. aeaeaeae-…-000000000002 — ③ compétition, datée du jour (saisie coach,
--      repère encore modifiable) :
--        T4 ×2 : « T4 a », « T4 b » (sans repère)
--        T5 ×2 : « T5 Jaune », « T5 b »
--        T7 ×3 : « T7 Bleu », « T7 Rouge », « T7 c »
--   Les autres niveaux (T1–T10) sont uniques → libellé = niveau seul.
--
-- Pré-requis : migrations (dont 202610161100_repere_voie) + seed 01.
-- Rejouable : supprime d'abord ses deux rencontres (cascade : épreuves, voies,
-- blocs, équipes, compositions, résultats). UUID réservés `aeaeaeae-…`.
-- Usage local : docker exec -i supabase_db_interclub psql -U postgres
--               < supabase/seed/04-demo-repere-voies.sql
-- Jamais en prod.
-- ===========================================================================

begin;

delete from interclub.rencontre
 where id in ('aeaeaeae-0000-0000-0000-000000000001', 'aeaeaeae-0000-0000-0000-000000000002');

insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase) values
  ('aeaeaeae-0000-0000-0000-000000000001', current_date + 30,
   '11111111-1111-1111-1111-111111111111', 'ado', 'pre_competition'),
  ('aeaeaeae-0000-0000-0000-000000000002', current_date,
   '11111111-1111-1111-1111-111111111111', 'ado', 'competition');

-- Épreuves : voie / bloc / vitesse (suffixe 1x = rencontre 1, 2x = rencontre 2).
insert into interclub.epreuve (id, rencontre_id, type, points_chute, points_non_presentation) values
  ('aeaeaeae-0000-0000-0001-000000000011', 'aeaeaeae-0000-0000-0000-000000000001', 'voie',    null, null),
  ('aeaeaeae-0000-0000-0001-000000000012', 'aeaeaeae-0000-0000-0000-000000000001', 'bloc',    null, null),
  ('aeaeaeae-0000-0000-0001-000000000013', 'aeaeaeae-0000-0000-0000-000000000001', 'vitesse', 5, 0),
  ('aeaeaeae-0000-0000-0001-000000000021', 'aeaeaeae-0000-0000-0000-000000000002', 'voie',    null, null),
  ('aeaeaeae-0000-0000-0001-000000000022', 'aeaeaeae-0000-0000-0000-000000000002', 'bloc',    null, null),
  ('aeaeaeae-0000-0000-0001-000000000023', 'aeaeaeae-0000-0000-0000-000000000002', 'vitesse', 5, 0);

-- Barème de vitesse ado (§ Après-midi, comme le seed 01).
insert into interclub.bareme_vitesse_echelon (epreuve_id, rang_min, rang_max, points, decrement, ordre)
select e.id, b.rang_min, b.rang_max, b.points, b.decrement, b.ordre
  from (values ('aeaeaeae-0000-0000-0001-000000000013'::uuid),
               ('aeaeaeae-0000-0000-0001-000000000023'::uuid)) as e(id)
 cross join (values (1, 5, 60, 1, 1), (6, 50, 55, 1, 2), (51, null::int, 10, 0, 3))
       as b(rang_min, rang_max, points, decrement, ordre);

insert into interclub.voie_vitesse (rencontre_id, numero, libelle) values
  ('aeaeaeae-0000-0000-0000-000000000001', 1, 'Filles'),
  ('aeaeaeae-0000-0000-0000-000000000001', 2, 'Garçons'),
  ('aeaeaeae-0000-0000-0000-000000000002', 1, 'Filles'),
  ('aeaeaeae-0000-0000-0000-000000000002', 2, 'Garçons');

-- Voies de difficulté : T1–T10 + doublons, barème « Après-midi » du niveau.
-- (epreuve, niveau, cotation, ordre, repère) ; points dérivés du niveau.
insert into interclub.voie_difficulte
  (epreuve_id, niveau, type_voie, cotation, ordre, repere, points, points_zone1, points_zone2)
select v.epreuve_id::uuid, v.niveau, 'tete', v.cotation, v.ordre, v.repere,
       2 + 2 * n.i, 2 * n.i - 1, 2 * n.i
  from (values
    -- Rencontre 1 (① pré-compétition)
    ('aeaeaeae-0000-0000-0001-000000000011', 'T1',  '4c',  1, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T2',  '5a',  2, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T3',  '5b',  3, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T4',  '5c',  4, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T5',  '6a',  5, 'Jaune'),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T5',  '6a',  6, 'Relais 12'),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T5',  '6a+', 7, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T6',  '6b',  8, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T6',  '6b',  9, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T7',  '6c', 10, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T8',  '7a', 11, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T9',  '7b', 12, null),
    ('aeaeaeae-0000-0000-0001-000000000011', 'T10', '7c', 13, null),
    -- Rencontre 2 (③ compétition)
    ('aeaeaeae-0000-0000-0001-000000000021', 'T1',  '4c',  1, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T2',  '5a',  2, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T3',  '5b',  3, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T4',  '5c',  4, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T4',  '5c',  5, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T5',  '6a',  6, 'Jaune'),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T5',  '6a',  7, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T6',  '6b',  8, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T7',  '6c',  9, 'Bleu'),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T7',  '6c', 10, 'Rouge'),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T7',  '6c+', 11, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T8',  '7a', 12, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T9',  '7b', 13, null),
    ('aeaeaeae-0000-0000-0001-000000000021', 'T10', '7c', 14, null)
  ) as v(epreuve_id, niveau, cotation, ordre, repere)
  cross join lateral (select substring(v.niveau from 2)::int as i) as n;

-- Blocs ado B1/B2 + paliers.
insert into interclub.bloc (id, epreuve_id, code, ordre) values
  ('aeaeaeae-0000-0000-0002-000000000011', 'aeaeaeae-0000-0000-0001-000000000012', 'B1', 1),
  ('aeaeaeae-0000-0000-0002-000000000012', 'aeaeaeae-0000-0000-0001-000000000012', 'B2', 2),
  ('aeaeaeae-0000-0000-0002-000000000021', 'aeaeaeae-0000-0000-0001-000000000022', 'B1', 1),
  ('aeaeaeae-0000-0000-0002-000000000022', 'aeaeaeae-0000-0000-0001-000000000022', 'B2', 2);

insert into interclub.bloc_palier (bloc_id, libelle, points, ordre)
select b.id, p.libelle, p.points, p.ordre
  from interclub.bloc b
  join (values ('B1', 'Zone', 10, 1), ('B1', 'Bloc complet', 30, 2),
               ('B2', 'Zone 1', 20, 1), ('B2', 'Zone 2', 40, 2), ('B2', 'Bloc complet', 60, 3))
       as p(code, libelle, points, ordre) on p.code = b.code
 where b.id::text like 'aeaeaeae-%';

-- Équipe Club A + Nora et Owen Delta (grimpeurs ado du seed 01).
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('aeaeaeae-0000-0000-0003-000000000001', 'aeaeaeae-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Ados repère'),
  ('aeaeaeae-0000-0000-0003-000000000002', 'aeaeaeae-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'Ados repère');

insert into interclub.composition (equipe_id, grimpeur_id)
select e.id, g.id
  from (values ('aeaeaeae-0000-0000-0003-000000000001'::uuid),
               ('aeaeaeae-0000-0000-0003-000000000002'::uuid)) as e(id)
 cross join (values ('adadadad-0000-0000-0000-0000000000c1'::uuid),
                    ('adadadad-0000-0000-0000-0000000000c2'::uuid)) as g(id);

commit;
