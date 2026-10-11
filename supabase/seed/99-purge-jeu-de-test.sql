-- Purge : JEU DE DONNÉES DE TEST (T7) — bornée, rejouable.
-- Réf. : docs/conventions/09-environnements-et-donnees.md §3-4.
--
-- ⚠️ Supprime EXACTEMENT les données de test de `01-jeu-de-test.sql` (plage
-- d'UUID réservée). N'est JAMAIS chargée automatiquement en local (exclue de
-- config.toml → [db.seed]). NE JAMAIS exécuter en prod.
--
-- Sûreté (convention 09 §4) : chaque DELETE est borné par une clause `where`
-- explicite sur les UUID de test. Suppression BOTTOM-UP pour respecter les FK
-- (certaines sont `on delete restrict`). En cas de doute, ne pas exécuter.
--
-- Cycle « rejouer un cahier » : exécuter cette purge, puis `01-jeu-de-test.sql`.

-- Constantes de test (rappel) :
--   Rencontre 33333333-… (enfant) · adadadad-… (ado)
--   Clubs     11111111-… (A) · 22222222-… (B)
--   Comptes   aaaaaaaa-… · cccccccc-… (coach A/A2) · dddddddd-… (coach B) · 55555555-5555-…-555555555555

begin;

-- 1. Utilisateurs ANONYMES des sessions de test (créés au scan) — avant de
--    supprimer les jetons (la FK session_qr→jeton_qr est cascade, mais les
--    auth.users anonymes, eux, subsistent). Borné aux sessions de la rencontre.
delete from auth.users u
 where u.is_anonymous
   and u.id in (
     select s.utilisateur_id
       from interclub.session_qr s
       join interclub.jeton_qr j on j.id = s.jeton_qr_id
      where j.rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad')
   );

-- 2. Saisies (feuilles) rattachées aux épreuves de la rencontre de test.
delete from interclub.temps_vitesse
 where epreuve_id in (select id from interclub.epreuve where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad'));
delete from interclub.resultat_voie
 where voie_difficulte_id in (
   select vd.id from interclub.voie_difficulte vd
   join interclub.epreuve e on e.id = vd.epreuve_id
   where e.rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad')
 );
delete from interclub.resultat_bloc
 where bloc_id in (
   select b.id from interclub.bloc b
   join interclub.epreuve e on e.id = b.epreuve_id
   where e.rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad')
 );

-- 3. Compositions des équipes de la rencontre de test.
delete from interclub.composition
 where equipe_id in (select id from interclub.equipe where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad'));

-- 4. Sessions QR puis jetons de la rencontre de test.
delete from interclub.session_qr
 where jeton_qr_id in (select id from interclub.jeton_qr where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad'));
delete from interclub.jeton_qr where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad');

-- 5. Équipes, épreuves, voies, puis la rencontre.
delete from interclub.equipe       where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad');
delete from interclub.epreuve      where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad');
delete from interclub.voie_vitesse where rencontre_id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad');
delete from interclub.rencontre    where id in ('33333333-3333-3333-3333-333333333333', 'adadadad-adad-adad-adad-adadadadadad');

-- 6. Grimpeurs des clubs de test.
delete from interclub.grimpeur
 where club_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- 7. Mappings de rôle puis comptes Supabase Auth de test (+ identités par cascade).
delete from interclub.compte
 where utilisateur_id in (
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'cccccccc-cccc-cccc-cccc-cccccccccc02',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '55555555-5555-5555-5555-555555555555'
 );
delete from auth.users
 where id in (
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'cccccccc-cccc-cccc-cccc-cccccccccc02',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '55555555-5555-5555-5555-555555555555'
 );

-- 8. Clubs de test (en dernier : referencés par restrict côté rencontre — déjà
--    supprimée ci-dessus).
delete from interclub.club
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

commit;
