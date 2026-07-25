-- Seed : données de test (LOCAL) pour le cahier T5d (sessions QR éphémères).
-- Chargé après 02 par `supabase db reset` (config.toml → sql_paths = seed/*.sql).
-- Idempotent (`on conflict do nothing` + `update` borné par l'id).
--
-- ⚠️ Données de TEST uniquement.
--
-- Ce seed :
--   1. Passe la rencontre de test en phase `competition` (requis : CT-01..CT-09).
--   2. Insère deux jetons QR à UUIDs fixes et connus → reproductible sans UI.
--
-- UUIDs des jetons (valeur = secret encodé dans le QR) :
--   Coach temp. Club A : valeur = aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa
--   Juge Voie 1        : valeur = bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb
--
-- URL de scan local :
--   http://localhost:3000/scan?jeton=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa  (coach)
--   http://localhost:3000/scan?jeton=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb  (juge)

-- ---------------------------------------------------------------------------
-- 1. Rencontre en phase « competition » (requis R10, R12 — CT-01..04, CT-06..09).
--    CT-03 : le testeur doit repasser manuellement en `pre_competition`
--    puis revenir en `competition` après.
-- ---------------------------------------------------------------------------
update interclub.rencontre
set phase = 'competition'
where id = '33333333-3333-3333-3333-333333333333';

-- ---------------------------------------------------------------------------
-- 2. Jeton coach temporaire — Club A, Rencontre 33…33.
--    id   = 55555555-5555-5555-5555-555555555551
--    valeur (QR) = aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa
-- ---------------------------------------------------------------------------
insert into interclub.jeton_qr (id, rencontre_id, nature, club_id, voie_vitesse_id, valeur, actif)
values (
  '55555555-5555-5555-5555-555555555551',
  '33333333-3333-3333-3333-333333333333',
  'coach_temporaire',
  '11111111-1111-1111-1111-111111111111',
  null,
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  true
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Jeton juge — Voie 1 de la rencontre 33…33.
--    id   = 55555555-5555-5555-5555-555555555552
--    valeur (QR) = bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb
-- ---------------------------------------------------------------------------
insert into interclub.jeton_qr (id, rencontre_id, nature, club_id, voie_vitesse_id, valeur, actif)
values (
  '55555555-5555-5555-5555-555555555552',
  '33333333-3333-3333-3333-333333333333',
  'juge',
  null,
  '44444444-4444-4444-4444-444444444444',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  true
)
on conflict (id) do nothing;
