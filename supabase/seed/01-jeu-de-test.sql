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
--   Comptes      aaaaaaaa… (admin) · cccccccc… (coach A / A2) · dddddddd… (coach B) · 55555555…5555 (sans mapping)
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
-- 2. Comptes Supabase Auth (admin, coach A, coach A2, coach B, sans mapping).
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
   'cccccccc-cccc-cccc-cccc-cccccccccc02', 'authenticated', 'authenticated',
   'coach2@test.local', extensions.crypt('interclub', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated',
   'coachb@test.local', extensions.crypt('interclub', extensions.gen_salt('bf')),
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
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
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
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', 'cccccccc-cccc-cccc-cccc-cccccccccc02',
   '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccc02","email":"coach2@test.local","email_verified":true}',
   'email', now(), now(), now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","email":"coachb@test.local","email_verified":true}',
   'email', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555',
   '{"sub":"55555555-5555-5555-5555-555555555555","email":"sansmapping@test.local","email_verified":true}',
   'email', now(), now(), now())
on conflict do nothing;

-- Mappings de rôle. `sansmapping@test.local` n'a PAS de ligne (cas R5).
insert into interclub.compte (utilisateur_id, role, club_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', 'coach', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'coach', '22222222-2222-2222-2222-222222222222')
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
insert into interclub.epreuve (id, rencontre_id, type, points_chute, points_non_presentation) values
  ('88888888-8888-8888-8888-888888888801', '33333333-3333-3333-3333-333333333333', 'voie', null, null),
  ('88888888-8888-8888-8888-888888888802', '33333333-3333-3333-3333-333333333333', 'bloc', null, null),
  ('88888888-8888-8888-8888-888888888803', '33333333-3333-3333-3333-333333333333', 'vitesse', 1, 0)
on conflict (id) do nothing;

-- Barème de vitesse (enfant, § Matin) de l'épreuve vitesse 8803 (spec #3 R46) —
-- nécessaire au calcul des points de vitesse (spec #7). Cascade à la purge.
insert into interclub.bareme_vitesse_echelon
  (epreuve_id, rang_min, rang_max, points, decrement, ordre) values
  ('88888888-8888-8888-8888-888888888803',  1,   5, 15, 1,  1),
  ('88888888-8888-8888-8888-888888888803',  6,  10, 10, 0,  2),
  ('88888888-8888-8888-8888-888888888803', 11,  15,  9, 0,  3),
  ('88888888-8888-8888-8888-888888888803', 16,  20,  8, 0,  4),
  ('88888888-8888-8888-8888-888888888803', 21,  25,  7, 0,  5),
  ('88888888-8888-8888-8888-888888888803', 26,  30,  6, 0,  6),
  ('88888888-8888-8888-8888-888888888803', 31,  35,  5, 0,  7),
  ('88888888-8888-8888-8888-888888888803', 36,  40,  4, 0,  8),
  ('88888888-8888-8888-8888-888888888803', 41,  45,  3, 0,  9),
  ('88888888-8888-8888-8888-888888888803', 46, null,  2, 0, 10)
on conflict do nothing;

-- ===========================================================================
-- 5bis. Structure d'épreuve COMPLÈTE (voies de difficulté + blocs + paliers) —
--    reproduit fidèlement le GABARIT ENFANT (spec #3 R33/R38/R39 ; cf. migrations
--    202607291000 / 202607311000, barème « Matin ») afin que la SAISIE DES
--    RÉSULTATS (spec #6) dispose de l'ensemble réel : 4 voies moulinette (M1–M4),
--    10 voies tête (T1–T10), 2 blocs (B1/B2) et TOUS leurs paliers par essai.
--    UUID fixes (plage de test), connus des tests RLS (test-t6, test-resultats) et
--    des cahiers : la voie T1 (…9901), le bloc B1 (…9902) et son palier « 1er
--    essai » (…99a1) CONSERVENT leurs identifiants historiques. La purge (99-…)
--    supprime tout par cascade sur les épreuves de la rencontre — rien à lister.
-- ===========================================================================
-- Voies de difficulté (épreuve voie 8801) — moulinette M1–M4 puis tête T1–T10.
insert into interclub.voie_difficulte
  (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_prise_valorisee)
values
  ('99999999-9999-9999-9999-999999999911', '88888888-8888-8888-8888-888888888801', 'M1',  'moulinette', '4c',  1,  1, null),
  ('99999999-9999-9999-9999-999999999912', '88888888-8888-8888-8888-888888888801', 'M2',  'moulinette', '5a',  2,  2, null),
  ('99999999-9999-9999-9999-999999999913', '88888888-8888-8888-8888-888888888801', 'M3',  'moulinette', '5b',  3,  3, null),
  ('99999999-9999-9999-9999-999999999914', '88888888-8888-8888-8888-888888888801', 'M4',  'moulinette', '5c',  4,  4, null),
  ('99999999-9999-9999-9999-999999999901', '88888888-8888-8888-8888-888888888801', 'T1',  'tete',       '4c',  5,  5, 3),
  ('99999999-9999-9999-9999-999999999921', '88888888-8888-8888-8888-888888888801', 'T2',  'tete',       '5a',  6,  6, 3),
  ('99999999-9999-9999-9999-999999999922', '88888888-8888-8888-8888-888888888801', 'T3',  'tete',       '5b',  7,  7, 4),
  ('99999999-9999-9999-9999-999999999923', '88888888-8888-8888-8888-888888888801', 'T4',  'tete',       '5c',  8,  8, 4),
  ('99999999-9999-9999-9999-999999999924', '88888888-8888-8888-8888-888888888801', 'T5',  'tete',       '6a',  9,  9, 5),
  ('99999999-9999-9999-9999-999999999925', '88888888-8888-8888-8888-888888888801', 'T6',  'tete',       '6b', 10, 10, 5),
  ('99999999-9999-9999-9999-999999999926', '88888888-8888-8888-8888-888888888801', 'T7',  'tete',       '6c', 11, 11, 6),
  ('99999999-9999-9999-9999-999999999927', '88888888-8888-8888-8888-888888888801', 'T8',  'tete',       '7a', 12, 12, 6),
  ('99999999-9999-9999-9999-999999999928', '88888888-8888-8888-8888-888888888801', 'T9',  'tete',       '7b', 13, 13, 7),
  ('99999999-9999-9999-9999-999999999929', '88888888-8888-8888-8888-888888888801', 'T10', 'tete',       '7c', 14, 14, 8)
on conflict (id) do nothing;

-- Blocs (épreuve bloc 8802) + paliers par essai (R39). B1 garde son UUID.
insert into interclub.bloc (id, epreuve_id, code, ordre) values
  ('99999999-9999-9999-9999-999999999902', '88888888-8888-8888-8888-888888888802', 'B1', 1),
  ('99999999-9999-9999-9999-999999999903', '88888888-8888-8888-8888-888888888802', 'B2', 2)
on conflict (id) do nothing;

insert into interclub.bloc_palier (id, bloc_id, libelle, points, ordre) values
  ('99999999-9999-9999-9999-9999999999a1', '99999999-9999-9999-9999-999999999902', '1er essai', 4, 1),
  ('99999999-9999-9999-9999-9999999999a2', '99999999-9999-9999-9999-999999999902', '2e essai',  3, 2),
  ('99999999-9999-9999-9999-9999999999b1', '99999999-9999-9999-9999-999999999903', '1er essai', 6, 1),
  ('99999999-9999-9999-9999-9999999999b2', '99999999-9999-9999-9999-999999999903', '2e essai',  5, 2),
  ('99999999-9999-9999-9999-9999999999b3', '99999999-9999-9999-9999-999999999903', '3e essai',  4, 3)
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
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe) values
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Ana',    2015, 'F'),
  ('a0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Bob',    2016, 'H'),
  -- Pool de grimpeurs Club A LIBRES (non engagés) — 8 pour pouvoir atteindre 8/8.
  ('a0000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Chloé',  2015, 'F'),
  ('a0000000-0000-0000-0000-0000000000a4', '11111111-1111-1111-1111-111111111111', 'Alpha',  'David',  2016, 'H'),
  ('a0000000-0000-0000-0000-0000000000a5', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Emma',   2015, 'F'),
  ('a0000000-0000-0000-0000-0000000000a6', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Félix',  2016, 'H'),
  ('a0000000-0000-0000-0000-0000000000a7', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Gaby',   2015, 'F'),
  ('a0000000-0000-0000-0000-0000000000a8', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Hugo',   2016, 'H'),
  ('a0000000-0000-0000-0000-0000000000a9', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Iris',   2015, 'F'),
  ('a0000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 'Alpha',  'Jade',   2016, 'F'),
  ('b0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'Bravo',  'Cléo',   2015, 'F'),
  ('b0000000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'Bravo',  'Devi',   2016, 'H')
on conflict (id) do nothing;

-- ===========================================================================
-- 8. Compositions : Ana+Bob dans A1 ; Devi (prêté Club B) dans A2 ; Cléo dans B1.
--    `groupe_depart` renseigné (R19/R20). Devi composé dans A2 couvre le scénario
--    de prêt cross-club (spec #6 R36) sans avoir à l'insérer pendant le test.
-- ===========================================================================
insert into interclub.composition (equipe_id, grimpeur_id, groupe_depart) values
  ('66666666-6666-6666-6666-666666666666', 'a0000000-0000-0000-0000-0000000000a1', 'M2'),
  ('66666666-6666-6666-6666-666666666666', 'a0000000-0000-0000-0000-0000000000a2', 'T1'),
  ('66666666-6666-6666-6666-666666666602', 'b0000000-0000-0000-0000-0000000000b2', 'T1'),
  ('77777777-7777-7777-7777-777777777777', 'b0000000-0000-0000-0000-0000000000b1', 'T2')
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

-- ===========================================================================
-- 10. Rencontre ADO (Club A, compétition) — jeu de test complémentaire.
--     La catégorie ado change le FORMAT : voies tête T1–T10 avec ZONES (z1/z2,
--     R12), pas de moulinette ni de prise valorisée ; blocs à paliers ado
--     (Zone / Zone 1 / Zone 2 / Bloc complet, R39) ; saisie en CHOIX LIBRE de 6
--     voies (R11/R14, pas de groupe de départ). Barème « Après-midi » du gabarit
--     (cf. migrations 202607291000 / 202607311000). Famille d'UUID `adadadad…`
--     (reconnaissable). Purge : voir 99-… (ajoutée à la plage supprimée).
-- ===========================================================================
insert into interclub.rencontre (id, date_rencontre, club_porteur_id, categorie, phase)
values (
  'adadadad-adad-adad-adad-adadadadadad', '2026-09-19',
  '11111111-1111-1111-1111-111111111111', 'ado', 'competition'
)
on conflict (id) do nothing;

insert into interclub.epreuve (id, rencontre_id, type, points_chute, points_non_presentation) values
  ('adadadad-0000-0000-0000-0000000000a1', 'adadadad-adad-adad-adad-adadadadadad', 'voie', null, null),
  ('adadadad-0000-0000-0000-0000000000a2', 'adadadad-adad-adad-adad-adadadadadad', 'bloc', null, null),
  ('adadadad-0000-0000-0000-0000000000a3', 'adadadad-adad-adad-adad-adadadadadad', 'vitesse', 5, 0)
on conflict (id) do nothing;

-- Barème de vitesse (ado, § Après-midi) de l'épreuve vitesse a3 (spec #3 R46).
insert into interclub.bareme_vitesse_echelon
  (epreuve_id, rang_min, rang_max, points, decrement, ordre) values
  ('adadadad-0000-0000-0000-0000000000a3',  1,   5, 60, 1, 1),
  ('adadadad-0000-0000-0000-0000000000a3',  6,  50, 55, 1, 2),
  ('adadadad-0000-0000-0000-0000000000a3', 51, null, 10, 0, 3)
on conflict do nothing;

-- Voies de vitesse (Filles / Garçons).
insert into interclub.voie_vitesse (id, rencontre_id, numero, libelle) values
  ('adadadad-0000-0000-0000-0000000000f1', 'adadadad-adad-adad-adad-adadadadadad', 1, 'Filles'),
  ('adadadad-0000-0000-0000-0000000000f2', 'adadadad-adad-adad-adad-adadadadadad', 2, 'Garçons')
on conflict (id) do nothing;

-- Voies de difficulté ado : tête T1–T10 (zones z1/z2, barème « Après-midi »).
insert into interclub.voie_difficulte
  (id, epreuve_id, niveau, type_voie, cotation, ordre, points, points_zone1, points_zone2)
values
  ('adadadad-0000-0000-0000-000000000001', 'adadadad-0000-0000-0000-0000000000a1', 'T1',  'tete', '4c',  1,  4,  1,  2),
  ('adadadad-0000-0000-0000-000000000002', 'adadadad-0000-0000-0000-0000000000a1', 'T2',  'tete', '5a',  2,  6,  3,  4),
  ('adadadad-0000-0000-0000-000000000003', 'adadadad-0000-0000-0000-0000000000a1', 'T3',  'tete', '5b',  3,  8,  5,  6),
  ('adadadad-0000-0000-0000-000000000004', 'adadadad-0000-0000-0000-0000000000a1', 'T4',  'tete', '5c',  4, 10,  7,  8),
  ('adadadad-0000-0000-0000-000000000005', 'adadadad-0000-0000-0000-0000000000a1', 'T5',  'tete', '6a',  5, 12,  9, 10),
  ('adadadad-0000-0000-0000-000000000006', 'adadadad-0000-0000-0000-0000000000a1', 'T6',  'tete', '6b',  6, 14, 11, 12),
  ('adadadad-0000-0000-0000-000000000007', 'adadadad-0000-0000-0000-0000000000a1', 'T7',  'tete', '6c',  7, 16, 13, 14),
  ('adadadad-0000-0000-0000-000000000008', 'adadadad-0000-0000-0000-0000000000a1', 'T8',  'tete', '7a',  8, 18, 15, 16),
  ('adadadad-0000-0000-0000-000000000009', 'adadadad-0000-0000-0000-0000000000a1', 'T9',  'tete', '7b',  9, 20, 17, 18),
  ('adadadad-0000-0000-0000-000000000010', 'adadadad-0000-0000-0000-0000000000a1', 'T10', 'tete', '7c', 10, 22, 19, 20),
  -- 2ᵉ voie de niveau T5 : un même niveau peut être doublé (R11/R37). Permet de
  -- tester le choix libre de deux voies de MÊME niveau (cahier 17 CT-07).
  ('adadadad-0000-0000-0000-000000000015', 'adadadad-0000-0000-0000-0000000000a1', 'T5',  'tete', '6a', 11, 12,  9, 10)
on conflict (id) do nothing;

-- Blocs ado B1/B2 + paliers (Zone / Bloc complet ; Zone 1 / Zone 2 / Bloc complet).
insert into interclub.bloc (id, epreuve_id, code, ordre) values
  ('adadadad-0000-0000-0000-0000000000b1', 'adadadad-0000-0000-0000-0000000000a2', 'B1', 1),
  ('adadadad-0000-0000-0000-0000000000b2', 'adadadad-0000-0000-0000-0000000000a2', 'B2', 2)
on conflict (id) do nothing;

insert into interclub.bloc_palier (id, bloc_id, libelle, points, ordre) values
  ('adadadad-0000-0000-0000-00000000b101', 'adadadad-0000-0000-0000-0000000000b1', 'Zone',         10, 1),
  ('adadadad-0000-0000-0000-00000000b102', 'adadadad-0000-0000-0000-0000000000b1', 'Bloc complet', 30, 2),
  ('adadadad-0000-0000-0000-00000000b201', 'adadadad-0000-0000-0000-0000000000b2', 'Zone 1',        20, 1),
  ('adadadad-0000-0000-0000-00000000b202', 'adadadad-0000-0000-0000-0000000000b2', 'Zone 2',        40, 2),
  ('adadadad-0000-0000-0000-00000000b203', 'adadadad-0000-0000-0000-0000000000b2', 'Bloc complet',  60, 3)
on conflict (id) do nothing;

-- Grimpeurs ADO Club A (nés vers 2011) — distincts du pool enfant.
insert into interclub.grimpeur (id, club_id, nom, prenom, annee_naissance, sexe) values
  ('adadadad-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'Delta', 'Nora', 2011, 'F'),
  ('adadadad-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'Delta', 'Owen', 2011, 'H')
on conflict (id) do nothing;

-- Équipe ado « Ados A1 » + composition (choix libre → pas de groupe_depart).
insert into interclub.equipe (id, rencontre_id, club_id, nom) values
  ('adadadad-0000-0000-0000-00000000e001', 'adadadad-adad-adad-adad-adadadadadad',
   '11111111-1111-1111-1111-111111111111', 'Ados A1')
on conflict (id) do nothing;

insert into interclub.composition (equipe_id, grimpeur_id) values
  ('adadadad-0000-0000-0000-00000000e001', 'adadadad-0000-0000-0000-0000000000c1'),
  ('adadadad-0000-0000-0000-00000000e001', 'adadadad-0000-0000-0000-0000000000c2')
on conflict (equipe_id, grimpeur_id) do nothing;
