-- Seed : JEU DE DONNÉES DE TEST (T7) — source unique, idempotente.
-- Réf. : docs/conventions/09-environnements-et-donnees.md §3-4.
--
-- ⚠️ Données de TEST uniquement. Appliqué :
--   - en LOCAL, automatiquement au `supabase db reset` (config.toml → [db.seed]) ;
--   - en RECETTE, À LA MAIN dans le SQL Editor (JAMAIS en prod).
-- Purge associée : `99-purge-jeu-de-test.sql` (bornée aux UUID de test).
--
-- MARQUAGE / ISOLATION (convention 09 §4) : toutes les lignes de test utilisent
-- une PLAGE D'UUID RÉSERVÉE, reconnaissable, ce qui rend la purge prouvablement
-- bornée :
--   Clubs        11111111… (A) · 22222222… (B)
--   Comptes      aaaaaaaa… (admin) · cccccccc… (coach A) · 55555555…5555 (sans mapping)
--   Rencontre    33333333…
--   Voies        44444444…
--   Jetons       55555555-5555-5555-5555-5555555555 5x
--   Équipes      66666666… (A) · 77777777… (B)
--   Épreuves     88888888…
--   Grimpeurs    a……… (club A) · b……… (club B)
--
-- Mot de passe des trois comptes : « interclub ».

-- ===========================================================================
-- 1. Clubs.
-- ===========================================================================
insert into interclub.club (id, nom) values
  ('11111111-1111-1111-1111-111111111111', 'Club A'),
  ('22222222-2222-2222-2222-222222222222', 'Club B')
on conflict (id) do nothing;

-- ===========================================================================
-- 2. Comptes Supabase Auth (admin, coach A, sans mapping).
--    `encrypted_password` via pgcrypto (schéma extensions). Compte utilisable
--    tout de suite (`email_confirmed_at`).
-- ===========================================================================
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
on conflict (id) do nothing;

-- GoTrue lit les colonnes de jetons comme des chaînes et refuse les NULL.
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

-- Identités e-mail (requises par GoTrue pour la connexion par mot de passe).
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

-- Mappings de rôle. `sansmapping@test.local` n'a PAS de ligne (cas R5).
insert into interclub.compte (utilisateur_id, role, club_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach', '11111111-1111-1111-1111-111111111111')
on conflict (utilisateur_id) do nothing;

-- ===========================================================================
-- 3. Rencontre de test (enfant), portée par Club A, en phase `competition`
--    (requise par les cahiers jetons/session/RLS ; CT toggling phase possible).
-- ===========================================================================
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
values (
  '33333333-3333-3333-3333-333333333333', '2026-09-19',
  '11111111-1111-1111-1111-111111111111', 'enfant', 'competition'
)
on conflict (id) do nothing;

-- ===========================================================================
-- 4. Voies de vitesse (affectation juge = un jeton par voie).
-- ===========================================================================
insert into interclub.voie_vitesse (id, rencontre_id, numero) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1),
  ('44444444-4444-4444-4444-444444444445', '33333333-3333-3333-3333-333333333333', 2)
on conflict (id) do nothing;

-- ===========================================================================
-- 5. Épreuves de la rencontre : voie, bloc, vitesse (une par type, R30).
-- ===========================================================================
insert into interclub.epreuve (id, rencontre_id, type) values
  ('88888888-8888-8888-8888-888888888801', '33333333-3333-3333-3333-333333333333', 'voie'),
  ('88888888-8888-8888-8888-888888888802', '33333333-3333-3333-3333-333333333333', 'bloc'),
  ('88888888-8888-8888-8888-888888888803', '33333333-3333-3333-3333-333333333333', 'vitesse')
on conflict (id) do nothing;

-- ===========================================================================
-- 6. Équipes engagées : deux pour Club A (A1, A2), une pour Club B (B1).
-- ===========================================================================
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111', 'Équipe A1'),
  ('66666666-6666-6666-6666-666666666602', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111', 'Équipe A2'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222', 'Équipe B1')
on conflict (id) do nothing;

-- ===========================================================================
-- 7. Grimpeurs (année de naissance = catégorie enfant).
--    Club A : Ana + Bob engagés dans A1, plus un POOL DE LIBRES (Chloé…Jade) —
--    matière pour l'ajout au roster (cahier 13 CT-02) et le remplissage d'une
--    équipe à 8/8 (plafond R15, CT-04). gB2 (Devi, club B) reste LIBRE pour
--    illustrer un prêt (R35/R36).
-- ===========================================================================
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance) values
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Ana',    2015),
  ('a0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Bob',    2016),
  -- Pool de grimpeurs Club A LIBRES (non engagés) — 8 pour pouvoir atteindre 8/8.
  ('a0000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Chloé',  2015),
  ('a0000000-0000-0000-0000-0000000000a4', '11111111-1111-1111-1111-111111111111', 'Alpha',  'David',  2016),
  ('a0000000-0000-0000-0000-0000000000a5', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Emma',   2015),
  ('a0000000-0000-0000-0000-0000000000a6', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Félix',  2016),
  ('a0000000-0000-0000-0000-0000000000a7', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Gaby',   2015),
  ('a0000000-0000-0000-0000-0000000000a8', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Hugo',   2016),
  ('a0000000-0000-0000-0000-0000000000a9', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Iris',   2015),
  ('a0000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Jade',   2016),
  ('b0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'Bravo',  'Cléo',   2015),
  ('b0000000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'Bravo',  'Devi',   2016)
on conflict (id) do nothing;

-- ===========================================================================
-- 8. Compositions : gA1+gA2 dans l'équipe A1 ; gB1 dans l'équipe B1.
--    (A2 reste vide ; gB2 non engagé — matière à prêt dans le cahier.)
-- ===========================================================================
insert into interclub.composition (equipe_id, grimpeur_id) values
  ('66666666-6666-6666-6666-666666666666', 'a0000000-0000-0000-0000-0000000000a1'),
  ('66666666-6666-6666-6666-666666666666', 'a0000000-0000-0000-0000-0000000000a2'),
  ('77777777-7777-7777-7777-777777777777', 'b0000000-0000-0000-0000-0000000000b1')
on conflict (equipe_id, grimpeur_id) do nothing;

-- ===========================================================================
-- 9. Jetons QR (anonymes, multi-usage). Coach temp. Club A + juge Voie 1.
--    Valeurs (secrets encodés dans le QR) à UUID fixes, connues des cahiers.
--    URL de scan locale : http://localhost:3000/scan?jeton=<valeur>
-- ===========================================================================
insert into interclub.jeton_qr (id, rencontre_id, nature, club_id, voie_vitesse_id, valeur, actif)
values
  ('55555555-5555-5555-5555-555555555551', '33333333-3333-3333-3333-333333333333',
   'coach_temporaire', '11111111-1111-1111-1111-111111111111', null,
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true),
  ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333333',
   'juge', null, '44444444-4444-4444-4444-444444444444',
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', true)
on conflict (id) do nothing;

-- Les résultats (voie/bloc) et temps de vitesse sont saisis PENDANT le cahier
-- (phase ② compétition) — non seedés ici pour partir d'un état « avant saisie ».
