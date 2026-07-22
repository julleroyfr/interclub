-- Seed : utilisateurs de test (LOCAL) pour le cahier T5a.
-- Chargé automatiquement par `supabase db reset` (config.toml → [db.seed]).
-- Idempotent (`on conflict do nothing`) et rejouable. UUID fixes pour être
-- reproductible à l'identique.
--
-- ⚠️ Données de TEST uniquement — mot de passe commun trivial. Ne JAMAIS
--    appliquer en prod. En recette, préférer la création via le Dashboard.
--
-- Mot de passe des trois comptes : « interclub »
--   - admin@test.local        → rôle admin
--   - coach@test.local        → rôle coach (Club A)
--   - sansmapping@test.local  → AUCUN mapping (cas spec #2 R5, fail-closed)

-- ---------------------------------------------------------------------------
-- 1. Club d'accueil du coach.
-- ---------------------------------------------------------------------------
insert into interclub.club (id, nom)
values ('11111111-1111-1111-1111-111111111111', 'Club A')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Comptes Supabase Auth. `encrypted_password` via pgcrypto (schéma
--    `extensions`). `email_confirmed_at` renseigné pour un compte utilisable
--    tout de suite. `aud`/`role` = 'authenticated'.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'admin@test.local', extensions.crypt('interclub', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated',
   'coach@test.local', extensions.crypt('interclub', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
   'sansmapping@test.local', extensions.crypt('interclub', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}')
on conflict do nothing;

-- GoTrue lit les colonnes de jetons comme des chaînes et refuse les NULL :
-- on les initialise à '' pour nos comptes de test (idempotent).
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '55555555-5555-5555-5555-555555555555'
);

-- ---------------------------------------------------------------------------
-- 3. Identités e-mail — requises par GoTrue pour la connexion par mot de passe.
--    `identity_data` doit porter `sub` (= id) et `email`.
-- ---------------------------------------------------------------------------
insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"admin@test.local","email_verified":true}',
   'email', now(), now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","email":"coach@test.local","email_verified":true}',
   'email', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555',
   '{"sub":"55555555-5555-5555-5555-555555555555","email":"sansmapping@test.local","email_verified":true}',
   'email', now(), now(), now())
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Mappings de rôle (interclub.compte). `sansmapping@test.local` n'a PAS de
--    ligne : c'est le cas R5 (compte authentifié sans droit applicatif).
-- ---------------------------------------------------------------------------
insert into interclub.compte (utilisateur_id, role, club_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach', '11111111-1111-1111-1111-111111111111')
on conflict (utilisateur_id) do nothing;
