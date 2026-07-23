-- Seed : données de test (LOCAL) pour le cahier T5c (jetons QR).
-- Chargé après 01 par `supabase db reset` (config.toml → sql_paths = seed/*.sql).
-- Idempotent (`on conflict do nothing`), UUID fixes pour être reproductible.
--
-- ⚠️ Données de TEST uniquement. Complète le seed 01 (Club A + comptes).
--
-- Contenu : un 2e club (Club B), une rencontre portée par Club A en phase
-- « préparation » (teste R14 : un jeton est générable AVANT la phase ②), deux
-- voies de vitesse, et deux équipes (Club A et Club B engagés).

-- ---------------------------------------------------------------------------
-- 1. Deuxième club (pour les cas « autre club », R16 négatif).
-- ---------------------------------------------------------------------------
insert into interclub.club (id, nom)
values ('22222222-2222-2222-2222-222222222222', 'Club B')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Rencontre portée par Club A, catégorie enfant, phase « pré-compétition ».
--    Le jeton reste générable hors phase ② (R14).
-- ---------------------------------------------------------------------------
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
values (
  '33333333-3333-3333-3333-333333333333', '2026-09-19',
  '11111111-1111-1111-1111-111111111111', 'enfant', 'pre_competition'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Deux voies de vitesse (affectation juge = un jeton par voie, R18).
-- ---------------------------------------------------------------------------
insert into interclub.voie_vitesse (id, rencontre_id, numero)
values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1),
  ('44444444-4444-4444-4444-444444444445', '33333333-3333-3333-3333-333333333333', 2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Équipes engagées : Club A et Club B (clubs engagés = périmètres coach temp.).
-- ---------------------------------------------------------------------------
insert into interclub.equipe (id, rencontre_id, club_id, nom)
values
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111', 'Équipe A1'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222', 'Équipe B1')
on conflict (id) do nothing;
